import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { scopedTaskWhere } from "@/lib/scope";
import { InboxFeed, type InboxSection } from "@/components/tasks/detail/InboxFeed";
import { InboxTabs } from "@/components/inbox/InboxTabs";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

const TASK_SELECT = {
  id: true,
  code: true,
  title: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  reworkReason: true,
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
} as const;

export default async function InboxPage() {
  const session = await guardPage("Today");
  const me = session.user.id;
  const scope = await scopedTaskWhere(session);
  const since14 = new Date(Date.now() - 14 * DAY);
  const since30 = new Date(Date.now() - 30 * DAY);

  const [review, rework, assigned, mentions, notifications] = await Promise.all([
    safe(
      prisma.task.findMany({
        where: { deletedAt: null, status: "IN_REVIEW", creatorId: me, NOT: { assigneeId: me }, AND: [scope] },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: TASK_SELECT,
      }),
      []
    ),
    safe(
      prisma.task.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          status: { notIn: ["DONE"] },
          reworkReason: { not: null },
          OR: [{ assigneeId: me }, { assignees: { some: { employeeId: me } } }],
          AND: [scope],
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: TASK_SELECT,
      }),
      []
    ),
    safe(
      prisma.task.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          status: { notIn: ["DONE"] },
          NOT: { creatorId: me },
          OR: [
            { assigneeId: me, createdAt: { gte: since14 } },
            { assignees: { some: { employeeId: me, createdAt: { gte: since14 } } } },
          ],
          AND: [scope],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: TASK_SELECT,
      }),
      []
    ),
    safe(
      prisma.taskComment.findMany({
        where: {
          createdAt: { gte: since30 },
          NOT: { authorId: me },
          OR: [{ mentionedUserIds: { array_contains: [{ id: me }] } }, { mentionedUserIds: { array_contains: [me] } }],
          task: { deletedAt: null, AND: [scope] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true } },
          task: { select: { id: true, code: true, title: true } },
        },
      }),
      []
    ),
    safe(
      prisma.notification.findMany({
        where: { employeeId: me },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      []
    ),
  ]);

  const reviewIds = new Set(review.map((t) => t.id));
  const reworkIds = new Set(rework.map((t) => t.id));

  const sections: InboxSection[] = [
    {
      id: "review",
      title: "Waiting for your review",
      empty: "Nothing is waiting on you.",
      items: review.map((t) => ({
        key: `review-${t.id}`,
        kind: "task",
        status: t.status,
        code: t.code,
        title: t.title,
        href: `/tasks/${t.code}`,
        person: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
        verb: "submitted for review by",
        at: t.updatedAt.toISOString(),
      })),
    },
    {
      id: "rework",
      title: "Changes requested",
      empty: "No work has been sent back to you.",
      items: rework.map((t) => ({
        key: `rework-${t.id}`,
        kind: "task",
        status: t.status,
        code: t.code,
        title: t.title,
        href: `/tasks/${t.code}`,
        person: null,
        verb: t.reworkReason ? `sent back: ${t.reworkReason}` : "sent back for changes",
        at: t.updatedAt.toISOString(),
      })),
    },
    {
      id: "assigned",
      title: "Assigned to you",
      hint: "Last 14 days",
      empty: "Nothing new has been assigned to you.",
      items: assigned
        .filter((t) => !reviewIds.has(t.id) && !reworkIds.has(t.id))
        .map((t) => ({
          key: `assigned-${t.id}`,
          kind: "task",
          status: t.status,
          code: t.code,
          title: t.title,
          href: `/tasks/${t.code}`,
          person: t.creator ? { id: t.creator.id, name: t.creator.name } : null,
          verb: "assigned by",
          at: t.createdAt.toISOString(),
        })),
    },
    {
      id: "mentions",
      title: "Mentions",
      hint: "Last 30 days",
      empty: "Nobody has mentioned you recently.",
      items: mentions.map((c) => ({
        key: `mention-${c.id}`,
        kind: "mention",
        code: c.task.code,
        title: c.task.title,
        href: `/tasks/${c.task.code}`,
        person: c.author ? { id: c.author.id, name: c.author.name } : null,
        verb: "mentioned you:",
        excerpt: c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body,
        at: c.createdAt.toISOString(),
      })),
    },
    {
      id: "notifications",
      title: "Notifications",
      empty: "No notifications yet.",
      markAllRead: notifications.some((n) => !n.read),
      items: notifications.map((n) => ({
        key: `note-${n.id}`,
        kind: "notification",
        title: n.title,
        excerpt: n.detail,
        href: (() => {
          const m = /\b([A-Z]{2,5}-\d+)\b/.exec(`${n.title} ${n.detail}`);
          return m ? `/tasks/${m[1]}` : null;
        })(),
        person: null,
        at: n.createdAt.toISOString(),
        unread: !n.read,
      })),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <InboxTabs>
        <InboxFeed sections={sections} />
      </InboxTabs>
    </div>
  );
}
