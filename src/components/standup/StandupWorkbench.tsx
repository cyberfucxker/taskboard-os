"use client";

import { useState, useTransition } from "react";
import { ListToolbar, useListFilter } from "@/components/list";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Sparkles,
  Send,
  CheckCircle2,
  Clock,
  AlertOctagon,
  Users,
  Filter,
  Check,
  RefreshCw,
  MessageSquare,
  ArrowRight
} from "lucide-react";

export interface StandupEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeAvatar: string | null;
  employeeRole: string;
  departmentName: string;
  departmentColor: string;
  date: string;
  did: string;
  doing: string;
  blocked: string | null;
  createdAt: string;
  isSelf?: boolean;
}

interface Props {
  entries: StandupEntry[];
  currentUserId: string;
  userTodayEntry: StandupEntry | null;
  selectedDate: string;
  departments: { id: string; name: string }[];
}

export function StandupWorkbench({
  entries,
  currentUserId,
  userTodayEntry,
  selectedDate,
  departments,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form states
  const [did, setDid] = useState(userTodayEntry?.did || "");
  const [doing, setDoing] = useState(userTodayEntry?.doing || "");
  const [blocked, setBlocked] = useState(userTodayEntry?.blocked || "");
  const [autoFilling, setAutoFilling] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Filters
  const [deptFilter, setDeptFilter] = useState("ALL");
  const sf = useListFilter(entries, (en) =>
    [en.employeeName, en.departmentName, en.employeeRole, en.did, en.doing, en.blocked].filter(Boolean).join(" ")
  );

  const handleAutoFill = async () => {
    setAutoFilling(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/standup/autofill");
      if (!res.ok) throw new Error("Failed to autofill");
      const data = await res.json();
      if (data.autofill?.did) setDid(data.autofill.did);
      if (data.autofill?.doing) setDoing(data.autofill.doing);
      if (data.autofill?.blockedOn) setBlocked(data.autofill.blockedOn);
    } catch (err: any) {
      setErrorMsg(err.message || "Could not autofill from task logs");
    } finally {
      setAutoFilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!did.trim() && !doing.trim()) {
      setErrorMsg("Please fill in what you did or what you are doing.");
      return;
    }
    setErrorMsg("");

    try {
      const res = await fetch("/api/standup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          did: did.trim(),
          doing: doing.trim(),
          blocked: blocked.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit standup update");
      }

      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 4000);
      startTransition(() => {
        router.refresh();
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save standup");
    }
  };

  const filteredEntries = sf.filtered.filter((entry) => deptFilter === "ALL" || entry.departmentName === deptFilter);

  const totalSubmitted = entries.length;
  const totalBlocked = entries.filter((e) => e.blocked && e.blocked.trim().length > 0).length;

  return (
    <div className="space-y-6">
      {/* Top Header Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[var(--fg-muted)]">
              Today's Submissions
            </p>
            <p className="text-2xl font-bold text-[var(--fg-default)] mt-1">{totalSubmitted}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal/10 text-tealhi flex items-center justify-center">
            <Users size={20} />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[var(--fg-muted)]">
              Your Status Today
            </p>
            <p className="text-sm font-semibold mt-1">
              {userTodayEntry ? (
                <span className="inline-flex items-center gap-1.5 text-emerald">
                  <CheckCircle2 size={16} /> Submitted
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-amber">
                  <Clock size={16} /> Pending Submission
                </span>
              )}
            </p>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${userTodayEntry ? "bg-emerald/10 text-emerald" : "bg-amber/10 text-amber"}`}>
            {userTodayEntry ? <Check size={20} /> : <Clock size={20} />}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[var(--fg-muted)]">
              Reported Blockers
            </p>
            <p className="text-2xl font-bold text-[var(--fg-default)] mt-1">
              {totalBlocked > 0 ? (
                <span className="text-crimson">{totalBlocked} Blocked</span>
              ) : (
                <span className="text-emerald">0 Blockers</span>
              )}
            </p>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${totalBlocked > 0 ? "bg-crimson/10 text-crimson" : "bg-emerald/10 text-emerald"}`}>
            <AlertOctagon size={20} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Your Daily Standup Form (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[var(--fg-default)]">
                  {userTodayEntry ? "Update Your Standup" : "Post Today's Standup"}
                </h3>
                <p className="text-xs text-[var(--fg-muted)]">
                  Keep leadership and team in sync with your output
                </p>
              </div>
              <button
                type="button"
                onClick={handleAutoFill}
                disabled={autoFilling}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-teal/30 bg-teal/10 text-tealhi hover:bg-teal/20 transition-all disabled:opacity-50"
                title="Auto-fill did/doing from your active tasks and timer sessions"
              >
                {autoFilling ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                <span>Auto-Fill AI</span>
              </button>
            </div>

            {submitSuccess && (
              <div className="p-3 rounded-xl bg-emerald/10 border border-emerald/20 text-emerald text-xs flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>Standup submitted successfully!</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-crimson/10 border border-crimson/20 text-crimson text-xs flex items-center gap-2">
                <AlertOctagon size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-emerald flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald"></span>
                  What did you accomplish yesterday / today?
                </label>
                <textarea
                  value={did}
                  onChange={(e) => setDid(e.target.value)}
                  placeholder="e.g. Shipped new API routes for Finance module; resolved 3 high-priority bugs in CRM pipeline..."
                  rows={3}
                  className="w-full text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-[var(--fg-default)] placeholder:text-[var(--fg-muted)]/50 focus:outline-none focus:border-emerald/50 resize-none transition-all"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-tealhi flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal"></span>
                  What are you working on next today?
                </label>
                <textarea
                  value={doing}
                  onChange={(e) => setDoing(e.target.value)}
                  placeholder="e.g. Building interactive Lead kanban board with stage drag-and-drop..."
                  rows={3}
                  className="w-full text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-[var(--fg-default)] placeholder:text-[var(--fg-muted)]/50 focus:outline-none focus:border-teal/50 resize-none transition-all"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-crimson flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-crimson"></span>
                  Any blockers or items needing attention? (Optional)
                </label>
                <textarea
                  value={blocked}
                  onChange={(e) => setBlocked(e.target.value)}
                  placeholder="e.g. Awaiting client API keys for payment gateway integration..."
                  rows={2}
                  className="w-full text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-[var(--fg-default)] placeholder:text-[var(--fg-muted)]/50 focus:outline-none focus:border-crimson/50 resize-none transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 rounded-xl bg-teal hover:bg-teal text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-sm cursor-pointer"
              >
                {isPending ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span>{userTodayEntry ? "Update Standup" : "Publish Standup Entry"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Team Standup Feed (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <ListToolbar
            sticky
            filter={sf}
            shown={filteredEntries.length}
            total={entries.length}
            noun="updates"
            placeholder="Search standup updates…"
            className="rounded-lg border border-line"
            pills={[
              { id: "ALL", label: "All Departments", active: deptFilter === "ALL", onClick: () => setDeptFilter("ALL") },
              ...departments.map((dept) => ({ id: dept.id, label: dept.name, active: deptFilter === dept.name, onClick: () => setDeptFilter(dept.name) })),
            ]}
          />

          <div className="space-y-3">
            {filteredEntries.length === 0 ? (
              <div className="p-12 text-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)]">
                <MessageSquare className="w-10 h-10 mx-auto text-[var(--fg-muted)]/40 mb-3" />
                <p className="text-sm font-semibold text-[var(--fg-default)]">{sf.active ? "No matches" : "No standup posts found"}</p>
                {sf.active && (
                  <button type="button" onClick={sf.clear} className="mt-2 h-8 rounded-md border border-edge px-3 text-[13px] font-medium text-ink2 hover:bg-hover">
                    Clear filter
                  </button>
                )}
                <p className="text-xs text-[var(--fg-muted)] mt-1">
                  Be the first in your department to submit a daily update!
                </p>
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    entry.isSelf
                      ? "border-teal/30 bg-teal/[0.03]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface-raised)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-teal flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm">
                        {entry.employeeName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--fg-default)]">
                            {entry.employeeName}
                          </span>
                          {entry.isSelf && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal/20 text-tealhi">
                              You
                            </span>
                          )}
                          <span
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--border-subtle)]"
                            style={{
                              backgroundColor: `${entry.departmentColor}15`,
                              color: entry.departmentColor || "var(--muted)",
                            }}
                          >
                            {entry.departmentName}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                          {entry.employeeRole} • {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/directory`}
                      className="text-[11px] text-[var(--fg-muted)] hover:text-tealhi transition-colors flex items-center gap-1"
                    >
                      <span>View Profile</span>
                      <ArrowRight size={12} />
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-[var(--border-subtle)]/50 text-xs">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-emerald flex items-center gap-1">
                        <CheckCircle2 size={12} /> Did:
                      </span>
                      <p className="text-[var(--fg-default)] bg-[var(--bg-canvas)] p-2.5 rounded-xl border border-[var(--border-subtle)]/40 whitespace-pre-wrap leading-relaxed">
                        {entry.did}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-tealhi flex items-center gap-1">
                        <Clock size={12} /> Doing:
                      </span>
                      <p className="text-[var(--fg-default)] bg-[var(--bg-canvas)] p-2.5 rounded-xl border border-[var(--border-subtle)]/40 whitespace-pre-wrap leading-relaxed">
                        {entry.doing}
                      </p>
                    </div>

                    {entry.blocked && entry.blocked.trim().length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-crimson flex items-center gap-1">
                          <AlertOctagon size={12} /> Blocked On:
                        </span>
                        <p className="text-crimson bg-crimson/10 p-2.5 rounded-xl border border-crimson/20 whitespace-pre-wrap leading-relaxed">
                          {entry.blocked}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
