import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { effectiveCapsForSession } from "@/lib/scope";
import { CourseRunner } from "@/components/lms/CourseRunner";
import { canOpenCourse, courseDepartmentLabel } from "@/lib/lms";
import type { CourseContent } from "@/lib/lmsContent";

export const dynamic = "force-dynamic";

/**
 * One course's runner — the actual drill. Read-only fetch: the caller's
 * enrollment/block-progress is created lazily by the first autosave PATCH,
 * not here, so simply viewing the page never writes anything.
 */
export default async function CoursePage({ params }: { params: { courseId: string } }) {
  const session = await guardPage("LMS");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.deletedAt || course.status !== "PUBLISHED") redirect("/lms");

  // Server-side backstop: the catalog never links a locked card to here, but a
  // direct URL must not leak the mission content either — never render or
  // even fetch progress for a course outside the viewer's department.
  if (!canOpenCourse(course, session)) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <Lock className="mx-auto mb-4 h-8 w-8 text-muted" />
        <h1 className="mb-2 text-xl font-semibold text-ink">{course.title}</h1>
        <p className="mb-6 text-[14px] text-muted">
          This module belongs to <span className="text-ink">{courseDepartmentLabel(course.department)}</span>.
          It's visible in the catalog so you know it exists, but only that team (and leadership) can open it.
        </p>
        <Link
          href="/lms"
          className="inline-block rounded-md border border-edge px-3 py-1.5 text-[12px] text-ink"
        >
          Back to Learning
        </Link>
      </div>
    );
  }

  const [enrollment, caps] = await Promise.all([
    prisma.courseEnrollment.findUnique({
      where: { courseId_employeeId: { courseId: course.id, employeeId: session.user.id } },
      include: { blocks: true },
    }),
    effectiveCapsForSession(session),
  ]);
  // Same "leadership" bypass as the catalog's open-gate (lms.manage =
  // SUPER_ADMIN, HR, or the leadership department) — they can copy/paste
  // freely; everyone else can't lift mission content off the page.
  const restrictCopy = !caps.has("lms.manage");

  return (
    <CourseRunner
      restrictCopy={restrictCopy}
      course={{
        id: course.id,
        title: course.title,
        description: course.description,
        content: course.content as unknown as CourseContent,
      }}
      initialProgress={
        enrollment
          ? {
              currentBlockIdx: enrollment.currentBlockIdx,
              status: enrollment.status,
              blocks: enrollment.blocks.map((b) => ({
                blockId: b.blockId,
                checks: (b.checks as Record<string, boolean> | null) ?? {},
                fields: (b.fields as Record<string, string> | null) ?? {},
                drillAnswers: (b.drillAnswers as Record<string, { answer: string; revealed: boolean }> | null) ?? {},
                completed: b.completed,
                elapsedSec: b.elapsedSec,
              })),
            }
          : null
      }
    />
  );
}
