"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowLeft, Building2, CheckSquare, Clock, Command as CommandIcon, ExternalLink, FolderKanban,
  History, Link2, Plus, Play, Target, User, UserPlus, Keyboard, CircleDot, ArrowRight,
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useUniversalTimer } from "@/components/timer/TimerContext";
import { ROUTES, type ModuleSlug } from "@/lib/nav";
import { createTask, openTask } from "@/lib/task-drawer";
import { parseQuickAdd, toCreateTaskInput, type QuickAdd } from "@/lib/quickAdd";
import { saveAssignee } from "@/components/tasks/pickers/mutations";
import { useRecents, type RecentType } from "@/lib/useRecents";
import { modKey } from "@/lib/shortcuts";
import type { SearchResults } from "@/app/api/search/route";

/**
 * Cmd/Ctrl+K command palette (cmdk). Groups: Recent, Navigate, Create, Search results,
 * Actions. Typing searches tasks (title or 3-char code), clients, projects, people and
 * (for CRM users) leads through the existing /api/search and /api/crm/leads routes —
 * both scope server-side. Picking a task opens a nested action list. "+ text" or
 * "new text" is natural-language quick add (src/lib/quickAdd.ts).
 */

type Step =
  | { kind: "root" }
  | { kind: "task"; id: string; code: string; label: string }
  | { kind: "status"; id: string; code: string; label: string }
  | { kind: "ask"; id: string; code: string; label: string; status: "BLOCKED" | "DONE" | "IN_REVIEW" };

interface Hit {
  type: RecentType;
  id: string;
  label: string;
  sub?: string;
}

const STATUSES: { value: string; label: string }[] = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
];

const TYPE_ICON: Record<RecentType, React.ComponentType<{ className?: string }>> = {
  task: CheckSquare,
  client: Building2,
  project: FolderKanban,
  person: User,
  lead: Target,
};

const itemCls = "h-9 gap-2.5 px-2.5";

function matches(q: string, ...fields: (string | undefined)[]): boolean {
  if (!q) return true;
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function pathFor(type: RecentType, id: string): string {
  switch (type) {
    case "task": return `/tasks/${id}`;
    case "client": return `/clients/${id}`;
    case "project": return `/projects/${id}`;
    case "person": return `/team/${id}`;
    default: return `/crm/leads/${id}`;
  }
}

export default function CommandPalette({
  open,
  onClose,
  pages,
  onHelp,
}: {
  open: boolean;
  onClose: () => void;
  pages: ModuleSlug[];
  onHelp?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();
  const { startTask } = useUniversalTimer();
  const recents = useRecents();
  const [q, setQ] = useState("");
  const [steps, setSteps] = useState<Step[]>([{ kind: "root" }]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const step = steps[steps.length - 1];
  const hasCrm = pages.includes("CRM");

  useEffect(() => {
    if (open) {
      setQ("");
      setSteps([{ kind: "root" }]);
      setHits([]);
    }
  }, [open]);

  // Quick add: "+ buy domain tomorrow 4pm p1 @Devon" or "new ...".
  const quick: QuickAdd | null = useMemo(() => {
    if (step.kind !== "root") return null;
    const t = q.trim();
    const m = t.match(/^(?:\+|new\s)\s*(.*)$/i);
    if (!m || !m[1].trim()) return null;
    return parseQuickAdd(m[1]);
  }, [q, step.kind]);

  // Debounced entity search through the existing routes.
  useEffect(() => {
    const term = q.trim();
    if (step.kind !== "root" || quick || term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const [sRes, lRes] = await Promise.all([
          fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal }),
          hasCrm
            ? fetch(`/api/crm/leads?search=${encodeURIComponent(term)}&pageSize=5`, { signal: ctrl.signal }).catch(() => null)
            : Promise.resolve(null),
        ]);
        const next: Hit[] = [];
        const sj = await sRes.json().catch(() => null);
        if (sj?.ok) {
          const r = sj.results as SearchResults;
          r.tasks.forEach((x) => next.push({ type: "task", id: x.id, label: x.label, sub: x.sublabel }));
          r.clients.forEach((x) => next.push({ type: "client", id: x.id, label: x.label, sub: x.sublabel }));
          r.projects.forEach((x) => next.push({ type: "project", id: x.id, label: x.label, sub: x.sublabel }));
          r.people.forEach((x) => next.push({ type: "person", id: x.id, label: x.label, sub: x.sublabel }));
        }
        if (lRes && lRes.ok) {
          const lj = await lRes.json().catch(() => null);
          const items: { id: string; firstName?: string; lastName?: string; company?: string }[] =
            lj?.items ?? lj?.data?.items ?? [];
          items.slice(0, 5).forEach((l) =>
            next.push({
              type: "lead",
              id: l.id,
              label: `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || "Lead",
              sub: l.company,
            })
          );
        }
        if (!ctrl.signal.aborted) setHits(next);
      } catch {
        /* aborted or offline */
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, step.kind, quick, hasCrm]);

  const go = useCallback(
    (path: string) => {
      onClose();
      router.push(path);
    },
    [onClose, router]
  );

  const push = (s: Step) => {
    setSteps((p) => [...p, s]);
    setQ("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const pop = () => {
    setSteps((p) => (p.length > 1 ? p.slice(0, -1) : p));
    setQ("");
  };

  async function runQuickAdd() {
    if (!quick || busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...toCreateTaskInput(quick) };
      if (quick.assigneeName) body.assignee = quick.assigneeName;
      if (quick.projectName) {
        // "#name" means project in quick add: resolve it with the same scoped search.
        const r = await fetch(`/api/search?q=${encodeURIComponent(quick.projectName)}`)
          .then((x) => x.json())
          .catch(() => null);
        const p = r?.ok ? (r.results as SearchResults).projects[0] : null;
        if (p) body.projectId = p.id;
      }
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Created ${data.task.code}: ${data.task.title}`, "success");
        onClose();
        router.refresh();
      } else {
        toast(data.error ?? "Could not create the task", "error");
      }
    } catch {
      toast("Network error: task not created", "error");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(t: { id: string; code: string }, status: string, text?: string) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { action: "status", status };
      if (status === "BLOCKED") body.reason = text;
      else if (text) body.outcome = text;
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        toast(`${t.code} moved to ${STATUSES.find((s) => s.value === status)?.label ?? status}`, "success");
        onClose();
        router.refresh();
      } else {
        toast(data.error ?? "Could not change status", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function assignToMe(t: { id: string; code: string }) {
    const me = session?.user?.id;
    if (!me) return toast("Not signed in", "error");
    setBusy(true);
    const r = await saveAssignee(t.id, me);
    setBusy(false);
    if (r.ok) {
      toast(`${t.code} assigned to you`, "success");
      onClose();
      router.refresh();
    } else {
      toast(r.error ?? "Could not assign", "error");
    }
  }

  async function startTimer(t: { id: string; code: string }) {
    setBusy(true);
    const ok = await startTask(t.id);
    setBusy(false);
    if (ok) {
      toast(`Timer started on ${t.code}`, "success");
      onClose();
    }
  }

  function onRootKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && step.kind === "ask") {
      e.preventDefault();
      if (q.trim()) void setStatus(step, step.status, q.trim());
    } else if (e.key === "Enter" && quick) {
      // Quick add owns Enter, ahead of whichever list row cmdk highlighted.
      e.preventDefault();
      void runQuickAdd();
    }
  }

  const needle = q.trim();
  const grantedRoutes = ROUTES.filter((r) => pages.includes(r.slug));
  const navItems = grantedRoutes.filter((r) => matches(needle, r.label, r.hint));
  const recentItems = recents.filter((r) => matches(needle, r.label)).slice(0, needle ? 5 : 6);

  const placeholder =
    step.kind === "ask"
      ? step.status === "BLOCKED" ? "What is blocking it? Enter to confirm" : "What was achieved? Enter to confirm"
      : step.kind === "root"
        ? "Search, jump, or type + task text to add one"
        : `Actions for ${step.code}`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[85] bg-black/50 tk-fade" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="tk-pop fixed left-1/2 top-[14vh] z-[86] w-[calc(100%-1.5rem)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-[12px] border border-edge bg-raised text-ink shadow-popover"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command shouldFilter={false} loop className="h-auto rounded-[12px]" onKeyDown={onRootKeyDown}>
            {steps.length > 1 && step.kind !== "root" && (
              <div className="flex items-center gap-2 border-b border-line px-3 pt-2.5 text-[12px] text-muted">
                <button
                  type="button"
                  onClick={pop}
                  aria-label="Back"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-hover hover:text-ink"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <span className="truncate pb-2.5">
                  <span className="font-mono text-ink2">{step.code}</span> {step.label}
                </span>
              </div>
            )}
            <div className="flex items-center border-b border-line px-3" cmdk-input-wrapper="">
              <CommandIcon className="mr-2 h-4 w-4 shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                aria-label="Command palette search"
                className="flex h-11 w-full bg-transparent py-3 text-[14px] text-ink outline-none placeholder:text-faint"
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && q === "" && steps.length > 1) {
                    e.preventDefault();
                    pop();
                  }
                }}
              />
              <Kbd>esc</Kbd>
            </div>

            <CommandList className="max-h-[min(60vh,420px)] p-1.5">
              {step.kind === "ask" ? (
                <div className="px-3 py-6 text-center text-[13px] text-muted">
                  Type your answer and press Enter. Backspace on an empty box goes back.
                </div>
              ) : step.kind === "status" ? (
                <CommandGroup heading="Change status">
                  {STATUSES.map((s) => (
                    <CommandItem
                      key={s.value}
                      value={`status-${s.value}`}
                      className={itemCls}
                      disabled={busy}
                      onSelect={() => {
                        if (s.value === "BLOCKED" || s.value === "DONE" || s.value === "IN_REVIEW") {
                          push({ kind: "ask", id: step.id, code: step.code, label: step.label, status: s.value });
                        } else void setStatus(step, s.value);
                      }}
                    >
                      <CircleDot />
                      <span>{s.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : step.kind === "task" ? (
                <CommandGroup heading="Task actions">
                  <CommandItem value="assign-me" className={itemCls} disabled={busy} onSelect={() => void assignToMe(step)}>
                    <UserPlus />
                    <span>Assign to me</span>
                  </CommandItem>
                  <CommandItem
                    value="change-status"
                    className={itemCls}
                    onSelect={() => push({ kind: "status", id: step.id, code: step.code, label: step.label })}
                  >
                    <CircleDot />
                    <span>Change status</span>
                    <ArrowRight className="ml-auto" />
                  </CommandItem>
                  <CommandItem value="start-timer" className={itemCls} disabled={busy} onSelect={() => void startTimer(step)}>
                    <Play />
                    <span>Start timer</span>
                  </CommandItem>
                  <CommandItem value="open-page" className={itemCls} onSelect={() => go(`/tasks/${step.id}`)}>
                    <ExternalLink />
                    <span>Open full page</span>
                  </CommandItem>
                  <CommandItem
                    value="open-drawer"
                    className={itemCls}
                    onSelect={() => {
                      onClose();
                      openTask(step.code || step.id);
                    }}
                  >
                    <CheckSquare />
                    <span>Open in side panel</span>
                  </CommandItem>
                </CommandGroup>
              ) : (
                <>
                  {quick && (
                    <CommandGroup heading="Create">
                      <CommandItem
                        value="quick-add"
                        className="h-auto min-h-9 gap-2.5 px-2.5 py-2"
                        disabled={busy}
                        onSelect={() => void runQuickAdd()}
                      >
                        <Plus />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-ink">Create task: {quick.title}</div>
                          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted">
                            <span>{quick.priority ?? "P2"}</span>
                            {quick.dueDate && <span>due {quick.dueDate}{quick.dueTime ? ` ${quick.dueTime}` : ""}</span>}
                            {quick.assigneeName && <span>@{quick.assigneeName}</span>}
                            {quick.projectName && <span>#{quick.projectName}</span>}
                          </div>
                        </div>
                        <Kbd>↵</Kbd>
                      </CommandItem>
                    </CommandGroup>
                  )}

                  {!needle && recentItems.length > 0 && (
                    <CommandGroup heading="Recent">
                      {recentItems.map((r) => {
                        const Icon = TYPE_ICON[r.type];
                        return (
                          <CommandItem
                            key={`${r.type}-${r.id}`}
                            value={`recent-${r.type}-${r.id}`}
                            className={itemCls}
                            onSelect={() => go(r.path)}
                          >
                            <Icon />
                            <span className="truncate">{r.label}</span>
                            <History className="ml-auto !text-faint" />
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}

                  {!quick && navItems.length > 0 && (
                    <CommandGroup heading="Navigate">
                      {navItems.slice(0, needle ? 8 : 12).map((r) => (
                        <CommandItem key={r.slug} value={`nav-${r.slug}`} className={itemCls} onSelect={() => go(r.path)}>
                          <ArrowRight />
                          <span>{r.label}</span>
                          <span className="ml-1 truncate text-[12px] text-faint">{r.hint}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {!quick && matches(needle, "new task create") && (
                    <CommandGroup heading="Create">
                      <CommandItem
                        value="create-task"
                        className={itemCls}
                        onSelect={() => {
                          onClose();
                          createTask();
                        }}
                      >
                        <Plus />
                        <span>New task</span>
                        <span className="ml-auto flex items-center gap-1 text-muted"><Kbd>C</Kbd></span>
                      </CommandItem>
                    </CommandGroup>
                  )}

                  {!quick && needle.length >= 2 && (hits.length > 0 || searching) && (
                    <CommandGroup heading={searching && hits.length === 0 ? "Searching" : "Search results"}>
                      {hits.map((h) => {
                        const Icon = TYPE_ICON[h.type];
                        return (
                          <CommandItem
                            key={`${h.type}-${h.id}`}
                            value={`hit-${h.type}-${h.id}`}
                            className={itemCls}
                            onSelect={() => {
                              if (h.type === "task") {
                                push({ kind: "task", id: h.id, code: h.sub ?? "", label: h.label });
                              } else go(pathFor(h.type, h.id));
                            }}
                          >
                            <Icon />
                            <span className="truncate">{h.label}</span>
                            {h.sub && (
                              <span className={`ml-auto shrink-0 text-[11px] text-muted ${h.type === "task" ? "font-mono" : ""}`}>{h.sub}</span>
                            )}
                            {h.type === "task" && <ArrowRight className="shrink-0 !text-faint" />}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}

                  {!quick && (matches(needle, "keyboard shortcuts help") || matches(needle, "copy link page") || matches(needle, "focus timer today")) && (
                    <CommandGroup heading="Actions">
                      {matches(needle, "keyboard shortcuts help") && onHelp && (
                        <CommandItem
                          value="act-help"
                          className={itemCls}
                          onSelect={() => {
                            onClose();
                            onHelp();
                          }}
                        >
                          <Keyboard />
                          <span>Keyboard shortcuts</span>
                          <span className="ml-auto"><Kbd>?</Kbd></span>
                        </CommandItem>
                      )}
                      {matches(needle, "copy link page") && (
                        <CommandItem
                          value="act-copy"
                          className={itemCls}
                          onSelect={() => {
                            navigator.clipboard?.writeText(window.location.href).then(
                              () => toast("Link copied", "success"),
                              () => toast("Could not copy the link", "error")
                            );
                            onClose();
                          }}
                        >
                          <Link2 />
                          <span>Copy link to this page</span>
                        </CommandItem>
                      )}
                      {matches(needle, "focus timer today") && pages.includes("Today") && (
                        <CommandItem value="act-today" className={itemCls} onSelect={() => go("/today")}>
                          <Clock />
                          <span>Start a focus block (Today)</span>
                        </CommandItem>
                      )}
                    </CommandGroup>
                  )}

                  <CommandEmpty>
                    {needle.length >= 2 && !searching ? `No matches for "${needle}"` : "Type to search"}
                  </CommandEmpty>
                </>
              )}
            </CommandList>

            <div className="flex items-center gap-4 border-t border-line px-3 py-2 text-[11px] text-muted">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
              <span className="flex items-center gap-1"><Kbd>↵</Kbd> select</span>
              {steps.length > 1 && <span className="flex items-center gap-1"><Kbd>⌫</Kbd> back</span>}
              <span className="ml-auto">{modKey()} K to toggle</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
