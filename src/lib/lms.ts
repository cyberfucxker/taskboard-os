import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/eventlog";
import type { ScopedSession } from "@/lib/scope";
import { Prisma, type Course } from "@prisma/client";

/** Real seeded department slugs — a Course.department tag outside this set
 *  (e.g. "delivery") is a cross-functional track with no dedicated department
 *  and is treated as open to everyone, same as a null department. */
const KNOWN_DEPARTMENT_SLUGS = ["leadership", "sales", "design", "dev", "dm", "hr", "finance"];

/** Display names for a course's department tag, for the catalog badge. */
export const DEPARTMENT_LABELS: Record<string, string> = {
  leadership: "Leadership",
  sales: "Sales",
  design: "Design",
  dev: "Development",
  dm: "Digital Marketing",
  hr: "HR",
  finance: "Finance",
  company: "Company",
};

/** Human label for a course's department tag — a real dept name, "All departments"
 *  for cross-cutting/unmapped tags (null or e.g. "delivery"), or the raw tag as a
 *  last resort so an unexpected value never renders blank. */
export function courseDepartmentLabel(department: string | null): string {
  if (!department) return "All departments";
  return DEPARTMENT_LABELS[department] ?? (KNOWN_DEPARTMENT_SLUGS.includes(department) ? department : "All departments");
}

/**
 * Whether this session may OPEN (not just see) a course. The catalog itself
 * shows every published course to everyone with its department labelled —
 * this only gates walking into the mission content. Leadership (SUPER_ADMIN,
 * HR, or anyone in the leadership department) can open anything. Everyone
 * else can open cross-cutting courses (department null or an unrecognised tag
 * like "delivery") plus their own department's courses; any other course is
 * visible but locked.
 */
export function canOpenCourse(
  course: Pick<Course, "department">,
  session: ScopedSession,
  deptSlugs: string[] = KNOWN_DEPARTMENT_SLUGS
): boolean {
  const sees_everything =
    session.user.role === "SUPER_ADMIN" ||
    session.user.role === "HR" ||
    session.user.departmentSlug === "leadership";
  if (sees_everything) return true;
  if (!course.department) return true; // cross-cutting, e.g. core-ai-fluency-writing
  if (!deptSlugs.includes(course.department)) return true; // unmapped tag, e.g. "delivery"
  return course.department === session.user.departmentSlug;
}

/**
 * LMS (Learning) — learn-by-doing training modules. A Course is a JSON-authored
 * set of blocks (tasks/fields/drills/checks/trap, see prisma/seed.ts); progress
 * is tracked per employee per block so leadership can see not just completion
 * %, but the actual work a rep produced. No time limits are ever enforced here
 * — `elapsedSec` is stored for display only.
 */

export interface BlockProgressInput {
  blockId: string;
  checks?: Record<string, boolean>;
  fields?: Record<string, string>;
  drillAnswers?: Record<string, { answer: string; revealed: boolean }>;
  completed?: boolean;
  elapsedSec?: number;
  /** Furthest block index the learner is currently viewing — persists the resume point. */
  currentIdx?: number;
}

type CourseContent = { blocks: Array<{ id: string }> };

function notFound(message: string): never {
  const err = new Error(message);
  (err as unknown as { status: number }).status = 404;
  throw err;
}

/**
 * Records one block's autosaved work for the caller. Creates the enrollment
 * lazily on first write — starting the course IS enrolling, there is no
 * separate "enroll" step. Merges checks/fields/drillAnswers into any existing
 * JSON rather than overwriting, so a debounced partial save never clobbers
 * earlier work.
 */
export async function saveBlockProgress(
  session: ScopedSession,
  courseId: string,
  input: BlockProgressInput
) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.deletedAt) notFound("Course not found");
  const content = course.content as unknown as CourseContent;

  let enrollment = await prisma.courseEnrollment.findUnique({
    where: { courseId_employeeId: { courseId, employeeId: session.user.id } },
  });
  if (!enrollment) {
    enrollment = await prisma.courseEnrollment.create({
      data: { courseId, employeeId: session.user.id, status: "IN_PROGRESS", startedAt: new Date() },
    });
    await emitEvent({
      type: "COURSE_STARTED",
      actorId: session.user.id,
      entityType: "course",
      entityId: courseId,
      payload: { courseSlug: course.slug },
    });
  }

  const existing = await prisma.courseBlockProgress.findUnique({
    where: { enrollmentId_blockId: { enrollmentId: enrollment.id, blockId: input.blockId } },
  });

  const mergedChecks = { ...(existing?.checks as Record<string, boolean> | null), ...(input.checks ?? {}) };
  const mergedFields = { ...(existing?.fields as Record<string, string> | null), ...(input.fields ?? {}) };
  const mergedDrills = { ...(existing?.drillAnswers as Record<string, unknown> | null), ...(input.drillAnswers ?? {}) };
  const nowCompleting = Boolean(input.completed) && !existing?.completed;

  const blockProgress = await prisma.courseBlockProgress.upsert({
    where: { enrollmentId_blockId: { enrollmentId: enrollment.id, blockId: input.blockId } },
    create: {
      enrollmentId: enrollment.id,
      blockId: input.blockId,
      checks: mergedChecks as Prisma.InputJsonValue,
      fields: mergedFields as Prisma.InputJsonValue,
      drillAnswers: mergedDrills as Prisma.InputJsonValue,
      completed: input.completed ?? false,
      startedAt: new Date(),
      completedAt: input.completed ? new Date() : null,
      elapsedSec: input.elapsedSec ?? 0,
    },
    update: {
      checks: mergedChecks as Prisma.InputJsonValue,
      fields: mergedFields as Prisma.InputJsonValue,
      drillAnswers: mergedDrills as Prisma.InputJsonValue,
      ...(input.completed !== undefined ? { completed: input.completed } : {}),
      ...(nowCompleting ? { completedAt: new Date() } : {}),
      ...(input.elapsedSec !== undefined ? { elapsedSec: input.elapsedSec } : {}),
    },
  });

  let updatedEnrollment = enrollment;
  if (nowCompleting) {
    const blockIdx = content.blocks.findIndex((b) => b.id === input.blockId);
    const isLast = blockIdx >= 0 && blockIdx === content.blocks.length - 1;
    updatedEnrollment = await prisma.courseEnrollment.update({
      where: { id: enrollment.id },
      data: {
        currentBlockIdx: Math.max(enrollment.currentBlockIdx, blockIdx + 1),
        ...(isLast ? { status: "COMPLETED", completedAt: new Date() } : { status: "IN_PROGRESS" }),
      },
    });
    if (isLast) {
      await emitEvent({
        type: "COURSE_COMPLETED",
        actorId: session.user.id,
        entityType: "course",
        entityId: courseId,
        payload: { courseSlug: course.slug },
      });
    }
  }

  if (!nowCompleting && typeof input.currentIdx === "number" && input.currentIdx > enrollment.currentBlockIdx) {
    updatedEnrollment = await prisma.courseEnrollment.update({
      where: { id: enrollment.id },
      data: { currentBlockIdx: input.currentIdx, status: "IN_PROGRESS" },
    });
  }

  return { enrollment: updatedEnrollment, blockProgress };
}

/** Leadership roster view — every employee's enrollment(s), completion counts,
 *  and last-activity time. Caller must already hold `lms.manage`. Org-wide
 *  people-ops roles (SUPER_ADMIN, HR) see every department; `lms.manage` is
 *  also granted to the whole `leadership` department as a base capability
 *  (see DEPT_ADDONS in rbac.ts), so without this filter any leadership-dept
 *  employee — not just HR — could read every other department's course
 *  completion status and full written drill answers. */
export async function getTeamProgress(session: ScopedSession) {
  const orgWide = session.user.role === "SUPER_ADMIN" || session.user.role === "HR";
  const enrollments = await prisma.courseEnrollment.findMany({
    where: orgWide || !session.user.departmentId
      ? undefined
      : { employee: { departmentId: session.user.departmentId } },
    include: {
      employee: { select: { id: true, name: true, department: { select: { name: true } } } },
      course: { select: { id: true, slug: true, title: true, content: true } },
      blocks: { select: { completed: true, updatedAt: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return enrollments.map((e) => {
    const content = e.course.content as unknown as CourseContent;
    const total = content.blocks?.length ?? 0;
    const done = e.blocks.filter((b) => b.completed).length;
    const lastActivity = e.blocks.reduce<Date | null>(
      (max, b) => (!max || b.updatedAt > max ? b.updatedAt : max),
      null
    );
    return {
      enrollmentId: e.id,
      employee: { id: e.employee.id, name: e.employee.name, department: e.employee.department?.name ?? null },
      course: { id: e.course.id, slug: e.course.slug, title: e.course.title },
      status: e.status,
      blocksDone: done,
      blocksTotal: total,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      lastActivity: lastActivity ?? e.updatedAt,
    };
  });
}

/** One rep's full block-by-block written work for one course (drill-down).
 *  Caller must already hold `lms.manage`. Same department boundary as
 *  getTeamProgress — a leadership-dept employee must not drill into another
 *  department's answers just by knowing/guessing an enrollment id. */
export async function getEnrollmentDetail(session: ScopedSession, enrollmentId: string) {
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      employee: { select: { id: true, name: true, departmentId: true } },
      course: { select: { id: true, slug: true, title: true, content: true } },
      blocks: true,
    },
  });
  if (!enrollment) notFound("Enrollment not found");
  const orgWide = session.user.role === "SUPER_ADMIN" || session.user.role === "HR";
  if (!orgWide && enrollment.employee.departmentId !== session.user.departmentId) {
    notFound("Enrollment not found");
  }
  return enrollment;
}
