"use client";

/**
 * InboxFeed — the /inbox list. Sections of airy ~48px rows: what is waiting on
 * me for review, work sent back, newly assigned, mentions, and my notifications.
 * Every task and person is a link. Realtime refresh comes from the layout's
 * RealtimeProvider (the server page re-renders when anything changes).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Bell, CheckCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { StatusIcon } from "@/components/tasks/pickers/atoms";
import { timeAgo } from "./activity";
import { ListToolbar, NoMatches, useListFilter } from "@/components/list";

export interface InboxItem {
  key: string;
  kind: "task" | "mention" | "notification";
  title: string;
  /** Task short ID when the row is about a task. */
  code?: string;
  status?: string;
  href: string | null;
  person: { id: string; name: string } | null;
  /** Wording between the title and the person ("assigned by"). */
  verb?: string;
  excerpt?: string;
  at: string;
  unread?: boolean;
}

export interface InboxSection {
  id: string;
  title: string;
  hint?: string;
  empty: string;
  items: InboxItem[];
  markAllRead?: boolean;
}

export function InboxFeed({ sections }: { sections: InboxSection[] }) {
  const router = useRouter();
  const toast = useToast();
  const [marking, setMarking] = useState(false);
  const allItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const f = useListFilter(allItems, (it) =>
    [it.title, it.code, it.excerpt, it.person?.name, it.verb].filter(Boolean).join(" ")
  );
  const keep = useMemo(() => new Set(f.filtered.map((i) => i.key)), [f.filtered]);
  const shownSections = f.active
    ? sections.map((s) => ({ ...s, items: s.items.filter((i) => keep.has(i.key)) })).filter((s) => s.items.length > 0)
    : sections;

  const total = sections.filter((s) => s.id !== "notifications").reduce((n, s) => n + s.items.length, 0);
  const unread = sections.find((s) => s.id === "notifications")?.items.filter((i) => i.unread).length ?? 0;

  async function markAllRead() {
    if (marking) return;
    setMarking(true);
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast("Could not mark notifications as read", "error");
    }
    setMarking(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-5">
        <h1 className="text-[15px] font-semibold text-ink">Inbox</h1>
        <span className="text-[12.5px] text-muted">
          {total === 0 && unread === 0 ? "All caught up" : `${total} to look at${unread ? ` · ${unread} unread` : ""}`}
        </span>
      </header>

      <ListToolbar filter={f} noun="items" placeholder="Filter inbox…" />

      <div data-list-body="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">
        <div className="mx-auto w-full max-w-3xl px-2 py-4 sm:px-5 sm:py-6">
          {f.active && shownSections.length === 0 && <NoMatches filter={f} />}
          {shownSections.map((s) => (
            <section key={s.id} aria-label={s.title} className="mb-6">
              <div className="flex h-8 items-center gap-2 px-2 sm:px-3">
                <h2 className="text-[12.5px] font-medium text-ink">{s.title}</h2>
                <span className="font-mono text-[11.5px] text-muted">{s.items.length}</span>
                {s.hint && <span className="text-[11.5px] text-faint">{s.hint}</span>}
                {s.markAllRead && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    disabled={marking}
                    className="ml-auto flex min-h-[32px] items-center gap-1.5 rounded-md px-2 text-[12px] text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
              </div>
              {s.items.length === 0 ? (
                <p className="px-2 py-3 text-[12.5px] text-faint sm:px-3">{s.empty}</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-edge">
                  {s.items.map((it) => (
                    <Row key={it.key} item={it} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ item }: { item: InboxItem }) {
  const lead =
    item.kind === "task" && item.status ? (
      <StatusIcon status={item.status} />
    ) : item.kind === "mention" ? (
      <AtSign className="h-4 w-4 text-tealhi" aria-hidden="true" />
    ) : (
      <Bell className="h-4 w-4 text-muted" aria-hidden="true" />
    );

  const title = (
    <span className={cn("truncate text-[13.5px]", item.unread ? "font-semibold text-ink" : "font-medium text-ink")}>
      {item.code && <span className="mr-2 font-mono text-[11.5px] font-normal text-muted">{item.code}</span>}
      {item.title}
    </span>
  );

  return (
    <li className="flex min-h-[52px] items-start gap-3 px-3 py-2.5 transition-colors hover:bg-hover/50">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">{lead}</span>
      <div className="min-w-0 flex-1">
        {item.href ? (
          <Link href={item.href} className="block min-w-0 hover:underline">
            {title}
          </Link>
        ) : (
          <div className="min-w-0">{title}</div>
        )}
        {(item.verb || item.person) && (
          <div className="mt-0.5 truncate text-[12.5px] text-muted">
            {item.verb}{" "}
            {item.person && (
              <Link href={`/team/${item.person.id}`} className="text-ink2 hover:underline">
                {item.person.name}
              </Link>
            )}
          </div>
        )}
        {item.excerpt && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{item.excerpt}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {item.unread && <span className="h-2 w-2 rounded-full bg-teal" aria-label="Unread" />}
        <span className="text-[11.5px] text-faint" suppressHydrationWarning>{timeAgo(item.at)}</span>
      </div>
    </li>
  );
}
