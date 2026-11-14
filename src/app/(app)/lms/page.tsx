import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { effectiveCapsForSession } from "@/lib/scope";
import { LmsHome } from "@/components/lms/LmsHome";
import { canOpenCourse, courseDepartmentLabel } from "@/lib/lms";

export const dynamic = "force-dynamic";

/**
 * Learning home — course catalog with the caller's own progress, plus a
 * leadership-only "Team progress" tab (rendered client-side only when the
 * session holds `lms.manage`; the team API route double-checks server-side).
 *
 * Company knowledge (`department: "company"`) is pulled out of the normal
 * course grid into its own always-present reference section at the top, so it
 * reads as the place employees consult about the company — distinct from the
 * pick-a-module course track.
 */
export default async function LmsPage() {
  const session = await guardPage("LMS");

  const [courses, myEnrollments, caps] = await Promise.all([
    prisma.course.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.courseEnrollment.findMany({
      where: { employeeId: session.user.id },
      include: { blocks: { select: { completed: true } } },
    }),
    effectiveCapsForSession(session),
  ]);

  const enrollmentByCourse = new Map(myEnrollments.map((e) => [e.courseId, e]));

  // Every published course is shown, department-labelled, to everyone — only
  // opening it is gated (see canOpenCourse). Locked cards carry no progress
  // data at all, not even a count, so a redacted card never leaks activity.
  const toCard = (c: (typeof courses)[number]) => {
    const openable = canOpenCourse(c, session);
    const departmentLabel = courseDepartmentLabel(c.department);
    if (!openable) {
      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: null,
        department: departmentLabel,
        openable: false as const,
        status: "NOT_STARTED" as const,
        blocksDone: 0,
        blocksTotal: 0,
      };
    }
    const content = c.content as unknown as { blocks: Array<{ id: string }> };
    const total = content.blocks?.length ?? 0;
    const enrollment = enrollmentByCourse.get(c.id);
    const done = enrollment?.blocks.filter((b) => b.completed).length ?? 0;
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      department: departmentLabel,
      openable: true as const,
      status: enrollment?.status ?? ("NOT_STARTED" as const),
      blocksDone: done,
      blocksTotal: total,
    };
  };

  const allCards = courses.map(toCard);
  const company = allCards.filter((c) => c.department === "Company");
  const modules = allCards.filter((c) => c.department !== "Company");

  return (
    <LmsHome
      courses={modules}
      companyKnowledge={company}
      canManage={caps.has("lms.manage")}
    />
  );
}
