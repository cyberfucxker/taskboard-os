"use client";

import { TopThree } from "@/components/today/TopThree";
import { NeedsAttention } from "@/components/today/NeedsAttention";
import { RaiseBlockerModal, SubmitDeliverableModal } from "@/components/today/TodayModals";
import { createTask as openCreateTaskDrawer } from "@/lib/task-drawer";
import { useUniversalTimer } from "@/components/timer/TimerContext";
import { WorkloadSection } from "@/components/workload/WorkloadSection";
import { QuickAccess } from "@/components/QuickAccess";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import {
  Play,
  Pause,
  Clock3,
  Plus,
  Check,
  Activity,
  PhoneCall,
  FileText,
  Users,
  Palette,
  Code2,
  TrendingUp,
  Sparkles,
  ExternalLink,
  Coffee,
  AlertOctagon,
  LogOut,
  Flame,
  CheckCircle2,
  Hourglass,
  Layers,
  Search,
  Target,
  Share2,
  BarChart3,
  Link2,
  UserPlus,
  Award,
  Pin,
  Filter,
  ChevronRight,
  ArrowUp,
  X,
  Pencil,
} from "lucide-react";
import type { TodayStatus, TodayTask } from "@/lib/time";
import { useToday } from "@/components/today/useToday";
import { HoursRing, fmtMs } from "@/components/today/HoursRing";
import { fmtMsWithSec } from "@/lib/fmt";
import { LogHoursModal } from "@/components/today/LogHoursModal";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { CompleteTaskModal } from "@/components/tasks/CompleteTaskModal";
import { TaskDrawer } from "@/components/tasks/TaskDrawer";
import type { TaskView } from "@/components/tasks/types";

const CAT_LABEL: Record<string, string> = {
  CALL: "Calls & Outreach",
  MEETING: "Client Meeting",
  SCREENING: "Screening",
  BUG_FIX: "Bug Fix",
  DEVELOPMENT: "Development",
  DESIGN: "Design & Creative",
  CRM: "CRM & Leads",
  ADMIN: "Operations & HR",
  DOCUMENTATION: "Proposal / Report",
  OTHER: "General",
};

const CAT_ICON: Record<string, typeof Activity> = {
  CALL: PhoneCall,
  MEETING: Users,
  SCREENING: Search,
  BUG_FIX: AlertOctagon,
  DEVELOPMENT: Code2,
  DESIGN: Palette,
  CRM: TrendingUp,
  ADMIN: Layers,
  DOCUMENTATION: FileText,
  OTHER: Activity,
};

const CAT_COLOR: Record<string, { color: string; bg: string }> = {
  CALL: { color: "text-teal", bg: "hover:border-teal/50 hover:bg-teal/10" },
  MEETING: { color: "text-violet", bg: "hover:border-violet/50 hover:bg-violet/10" },
  SCREENING: { color: "text-amber", bg: "hover:bg-hover" },
  BUG_FIX: { color: "text-crimson", bg: "hover:border-crimson/50 hover:bg-crimson/10" },
  DEVELOPMENT: { color: "text-tealhi", bg: "hover:border-tealhi/50 hover:bg-tealhi/10" },
  DESIGN: { color: "text-violet", bg: "hover:bg-hover" },
  CRM: { color: "text-emerald", bg: "hover:border-emerald/50 hover:bg-emerald/10" },
  ADMIN: { color: "text-muted", bg: "hover:border-muted/50 hover:bg-muted/10" },
  DOCUMENTATION: { color: "text-amber", bg: "hover:border-amber/50 hover:bg-amber/10" },
  OTHER: { color: "text-muted", bg: "hover:border-muted/50 hover:bg-muted/10" },
};

// Department-specific quick-launch streams
type QuickStream = {
  id?: string;
  key: string;
  title: string;
  category: string;
  icon: typeof Activity;
  color: string;
  bg: string;
};

const DEPT_STREAMS: Record<string, QuickStream[]> = {
  // Sales department
  sales: [
    { key: "outreach", title: "Client Calling & Outreach", category: "CALL", icon: PhoneCall, color: "text-teal", bg: "hover:border-teal/50 hover:bg-teal/10" },
    { key: "proposals", title: "Client Reports & Proposals", category: "DOCUMENTATION", icon: FileText, color: "text-amber", bg: "hover:border-amber/50 hover:bg-amber/10" },
    { key: "meetings", title: "Client Review / Sync", category: "MEETING", icon: Users, color: "text-violet", bg: "hover:border-violet/50 hover:bg-violet/10" },
    { key: "crm", title: "CRM Leads & Pipeline", category: "CRM", icon: TrendingUp, color: "text-emerald", bg: "hover:border-emerald/50 hover:bg-emerald/10" },
    { key: "screening", title: "Lead Screening", category: "SCREENING", icon: Search, color: "text-amber", bg: "hover:bg-hover" },
  ],
  // Design department
  design: [
    { key: "design", title: "Creative / Design Work", category: "DESIGN", icon: Palette, color: "text-violet", bg: "hover:bg-hover" },
    { key: "meetings", title: "Client Review / Sync", category: "MEETING", icon: Users, color: "text-violet", bg: "hover:border-violet/50 hover:bg-violet/10" },
    { key: "admin", title: "Operations & Admin", category: "ADMIN", icon: Layers, color: "text-muted", bg: "hover:border-muted/50 hover:bg-muted/10" },
  ],
  // Development department
  dev: [
    { key: "dev", title: "Tech Dev & Engineering", category: "DEVELOPMENT", icon: Code2, color: "text-tealhi", bg: "hover:border-tealhi/50 hover:bg-tealhi/10" },
    { key: "bugfix", title: "Bug Fix & QA", category: "BUG_FIX", icon: AlertOctagon, color: "text-crimson", bg: "hover:border-crimson/50 hover:bg-crimson/10" },
    { key: "meetings", title: "Team Sync / Code Review", category: "MEETING", icon: Users, color: "text-violet", bg: "hover:border-violet/50 hover:bg-violet/10" },
    { key: "docs", title: "Documentation & Specs", category: "DOCUMENTATION", icon: FileText, color: "text-amber", bg: "hover:border-amber/50 hover:bg-amber/10" },
  ],
  // Digital Marketing
  dm: [
    { key: "crm", title: "CRM & Lead Management", category: "CRM", icon: TrendingUp, color: "text-emerald", bg: "hover:border-emerald/50 hover:bg-emerald/10" },
    { key: "design", title: "Creative / Content", category: "DESIGN", icon: Palette, color: "text-violet", bg: "hover:bg-hover" },
    { key: "outreach", title: "Client Calling & Outreach", category: "CALL", icon: PhoneCall, color: "text-teal", bg: "hover:border-teal/50 hover:bg-teal/10" },
    { key: "meetings", title: "Client / Team Sync", category: "MEETING", icon: Users, color: "text-violet", bg: "hover:border-violet/50 hover:bg-violet/10" },
    { key: "docs", title: "Reports & Analytics", category: "DOCUMENTATION", icon: BarChart3, color: "text-amber", bg: "hover:border-amber/50 hover:bg-amber/10" },
  ],
  // HR
  hr: [
    { key: "admin", title: "HR Operations", category: "ADMIN", icon: Layers, color: "text-muted", bg: "hover:border-muted/50 hover:bg-muted/10" },
    { key: "screening", title: "Candidate Screening", category: "SCREENING", icon: Search, color: "text-amber", bg: "hover:bg-hover" },
    { key: "meetings", title: "Interviews / Sync", category: "MEETING", icon: Users, color: "text-violet", bg: "hover:border-violet/50 hover:bg-violet/10" },
    { key: "docs", title: "Documentation / Reports", category: "DOCUMENTATION", icon: FileText, color: "text-amber", bg: "hover:border-amber/50 hover:bg-amber/10" },
  ],
  // Leadership / catch-all
  leadership: [
    { key: "outreach", title: "Client Calling & Outreach", category: "CALL", icon: PhoneCall, color: "text-teal", bg: "hover:border-teal/50 hover:bg-teal/10" },
    { key: "proposals", title: "Client Reports & Proposals", category: "DOCUMENTATION", icon: FileText, color: "text-amber", bg: "hover:border-amber/50 hover:bg-amber/10" },
    { key: "meetings", title: "Client Review / Sync", category: "MEETING", icon: Users, color: "text-violet", bg: "hover:border-violet/50 hover:bg-violet/10" },
    { key: "design", title: "Creative / Design Work", category: "DESIGN", icon: Palette, color: "text-violet", bg: "hover:bg-hover" },
    { key: "dev", title: "Tech Dev & Engineering", category: "DEVELOPMENT", icon: Code2, color: "text-tealhi", bg: "hover:border-tealhi/50 hover:bg-tealhi/10" },
    { key: "crm", title: "CRM Leads & Pipeline", category: "CRM", icon: TrendingUp, color: "text-emerald", bg: "hover:border-emerald/50 hover:bg-emerald/10" },
  ],
};

/**
 * One ticking clock for the whole card (#418). Reading Date.now() during render made the
 * greeting, the date and the live total disagree between server and client HTML; keeping
 * the time in state fixes that and re-renders on its own at the cadence asked for.
 */
function useNow(intervalMs: number) {
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

/** Hook: live-ticking elapsed seconds from a start timestamp. */
function useLiveTimer(startMs: number | null) {
  const nowMs = useNow(startMs ? 1000 : 60_000);
  if (!startMs) return 0;
  return Math.max(0, nowMs - startMs);
}

/** Greeting for an IST hour — pure, so it is safe to call while rendering. */
function greetingFor(nowMs: number) {
  const now = new Date(nowMs);
  const istHour =
    (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  if (istHour < 12) return "Good morning";
  if (istHour < 17) return "Good afternoon";
  return "Good evening";
}

export function TodayCard({ initial }: { initial: TodayStatus }) {
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [planKey, setPlanKey] = useState(0);
  const [attentionKey, setAttentionKey] = useState(0);
  const { status, lastFetchedAt, refresh } = useToday(initial);
  const { startFocusBlock } = useUniversalTimer();
  const s = status ?? initial;
  const running = s.running;

  // Department-based stream selection — real, per-department, employee-managed
  const deptSlug = s.employee?.department?.slug ?? "leadership";
  const [customStreams, setCustomStreams] = useState<QuickStream[] | null>(null);
  const [streamsManageOpen, setStreamsManageOpen] = useState(false);
  const [streamFormOpen, setStreamFormOpen] = useState(false);
  const [editingStreamId, setEditingStreamId] = useState<string | null>(null);
  
  const [workflowLaunchStream, setWorkflowLaunchStream] = useState<any>(null);
  const [workflowSelectedTasks, setWorkflowSelectedTasks] = useState<string[]>([]);
  const [workflowPriorities, setWorkflowPriorities] = useState<string[]>([]);

  const [streamTitle, setStreamTitle] = useState("");
  const [streamCategory, setStreamCategory] = useState("OTHER");
  const [streamSaving, setStreamSaving] = useState(false);
  const streamToast = useToast();

  const loadStreams = useCallback(async () => {
    try {
      // Strictly per-person now — never shared with or editable by the rest
      // of the department (see /api/workflow-streams).
      const res = await fetch("/api/workflow-streams").then((r) => r.json());
      if (res?.ok) {
        setCustomStreams(
          (res.data || []).map((row: any) => ({
            id: row.id,
            key: row.key,
            title: row.title,
            category: row.category,
            icon: CAT_ICON[row.category] ?? Activity,
            color: CAT_COLOR[row.category]?.color ?? "text-muted",
            bg: CAT_COLOR[row.category]?.bg ?? "hover:border-muted/50 hover:bg-muted/10",
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load workflow streams", err);
    }
  }, [deptSlug]);

  useEffect(() => {
    loadStreams();
  }, [loadStreams]);
  useOnLiveChange(() => { loadStreams(); });

  const streams = customStreams ?? DEPT_STREAMS[deptSlug] ?? DEPT_STREAMS.leadership;

  function openAddStream() {
    setEditingStreamId(null);
    setStreamTitle("");
    setStreamCategory("OTHER");
    setStreamFormOpen(true);
  }

  function openEditStream(stream: QuickStream) {
    setEditingStreamId((stream as any).id);
    setStreamTitle(stream.title);
    setStreamCategory(stream.category);
    setStreamFormOpen(true);
  }

  async function saveStream() {
    if (!streamTitle.trim()) {
      streamToast("Title is required", "error");
      return;
    }
    setStreamSaving(true);
    try {
      const res = editingStreamId
        ? await fetch("/api/workflow-streams", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingStreamId, title: streamTitle, category: streamCategory }),
          }).then((r) => r.json())
        : await fetch("/api/workflow-streams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: streamTitle, category: streamCategory }),
          }).then((r) => r.json());
      if (res?.ok) {
        streamToast(editingStreamId ? "Workflow updated" : "Workflow added", "success");
        setStreamFormOpen(false);
        loadStreams();
      } else {
        streamToast(res?.error || "Failed to save workflow", "error");
      }
    } catch {
      streamToast("Failed to save workflow", "error");
    } finally {
      setStreamSaving(false);
    }
  }

  async function deleteStream(id: string) {
    try {
      const res = await fetch(`/api/workflow-streams?id=${id}`, { method: "DELETE" }).then((r) => r.json());
      if (res?.ok) {
        streamToast("Workflow removed", "success");
        loadStreams();
      } else {
        streamToast(res?.error || "Failed to remove workflow", "error");
      }
    } catch {
      streamToast("Failed to remove workflow", "error");
    }
  }

  // Live-ticking timer for the active session
  const liveSessionMs = useLiveTimer(running?.startedAtMs ?? null);

  // Slow clock for everything that only needs to be roughly current (greeting, date).
  const nowMs = useNow(30_000);

  // Live total: server-side loggedMs + elapsed since last fetch for running task
  const liveLoggedMs = useMemo(() => {
    if (!running) return s.loggedMs;
    // Add seconds elapsed since last status fetch
    const sinceFetch = Math.max(0, nowMs - lastFetchedAt);
    return s.loggedMs + sinceFetch;
  }, [s.loggedMs, running, lastFetchedAt, nowMs]);

  // SHIFT PAUSE STATE: read from server-persisted field
  const isShiftPaused = s.isShiftPaused ?? false;

  const toggle = async (taskId: string) => {
    try {
      const isCurrentlyRunning =
        running && (running.taskId === taskId || running.code === taskId);
      const action = isCurrentlyRunning ? "pause" : "start";
      const targetEndpoint = isCurrentlyRunning
        ? `/api/tasks/${running?.taskId || taskId}`
        : `/api/tasks/${taskId}`;

      const res = await fetch(targetEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || (data && !data.ok)) {
        toast(data?.error ?? "Could not update task timer", "error");
      }
    } catch {
      toast("Failed to toggle task", "error");
    } finally {
      refresh();
    }
  };

  const pause = async (reason?: string) => {
    try {
      const targetId = running?.taskId || "current";
      const res = await fetch(`/api/tasks/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause", reason }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || (data && !data.ok)) {
        toast(data?.error ?? "Could not pause task", "error");
      }
    } catch {
      toast("Failed to pause task", "error");
    } finally {
      refresh();
    }
  };

  const [logOpen, setLogOpen] = useState(false);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [streamBusy, setStreamBusy] = useState(false);
  const [completingTask, setCompletingTask] = useState<{
    id: string;
    title: string;
    code: string;
  } | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [drawerTask, setDrawerTask] = useState<TaskView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [breakModalOpen, setBreakModalOpen] = useState(false);
  const [breakReason, setBreakReason] = useState("Lunch Break");
  
  const [workflowModeActive, setWorkflowModeActive] = useState(false);
  const [workflowModeTasks, setWorkflowModeTasks] = useState<string[]>([]);

  useEffect(() => {
    const handleWorkflowStart = (e: any) => {
      setWorkflowModeActive(true);
      setWorkflowModeTasks(e.detail.includedTasks);
    };
    window.addEventListener("workflow-mode-started", handleWorkflowStart);
    return () => window.removeEventListener("workflow-mode-started", handleWorkflowStart);
  }, []);

  const [taskFilter, setTaskFilter] = useState<"all" | "active" | "done">("all");
  const toast = useToast();

  // Load task for in-page drawer preview
  useEffect(() => {
    if (drawerTaskId) {
      fetch(`/api/tasks/${drawerTaskId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.task) {
            setDrawerTask(data.task);
            setDrawerOpen(true);
          }
        })
        .catch(() => toast("Could not load task", "error"));
    }
  }, [drawerTaskId]);

  const handleStartStream = async (stream: QuickStream) => {
    setStreamBusy(true);
    try {
      const existing = s.tasksToday.find(
        (t) => t.category === stream.category && t.status !== "DONE"
      );
      if (existing) {
        await toggle(existing.id);
      } else {
        const dateStr = new Date().toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
        });
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Routine: ${stream.title} — ${dateStr}`,
            category: stream.category,
            priority: "P2",
            assigneeId: s.employee?.id,
            dueDate: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
          }),
        });
        const json = await res.json();
        if (json.ok && json.task?.id) {
          await toggle(json.task.id);
        } else {
          toast(json.error ?? "Could not launch workflow", "error");
        }
      }
    } catch {
      toast("Failed to start workflow", "error");
    } finally {
      setStreamBusy(false);
    }
  };

  // Server-persisted shift pause/resume
  const handleTakeBreak = async () => {
    try {
      const res = await fetch("/api/time/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause", reason: breakReason }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error ?? "Could not pause shift", "error");
      } else {
        toast(`Shift & task paused for ${breakReason}. Hourglass frozen.`, "default");
      }
    } catch {
      toast("Failed to pause shift", "error");
    } finally {
      setBreakModalOpen(false);
      refresh();
    }
  };

  const handleResumeShift = async () => {
    try {
      const res = await fetch("/api/time/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error ?? "Could not resume shift", "error");
      } else {
        toast("Shift resumed! Hourglass ticking.", "success");
      }
    } catch {
      toast("Failed to resume shift", "error");
    } finally {
      refresh();
    }
  };

  const answerCheckin = async (
    done: boolean,
    outcome?: string,
    reason?: string
  ) => {
    if (!running) return;
    setCheckinBusy(true);
    try {
      const res = await fetch("/api/checkin/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: running.taskId, done, outcome, reason }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok)
        toast(json?.error ?? "Couldn't answer", "error");
      else {
        toast(done ? "Task marked done" : "Keep going — logged", "success");
        refresh();
      }
    } finally {
      setCheckinBusy(false);
    }
  };

  const progressPercent = Math.min(
    100,
    Math.round((liveLoggedMs / (8 * 3600000)) * 100)
  );
  const isGoalMet = liveLoggedMs >= 8 * 3600000;
  const remainingMs = Math.max(0, 8 * 3600000 - liveLoggedMs);

  // Task filtering
  const filteredTasks = useMemo(() => {
    let result = s.tasksToday;
    if (taskFilter === "active") result = s.tasksToday.filter((t) => t.status !== "DONE");
    else if (taskFilter === "done") result = s.tasksToday.filter((t) => t.status === "DONE");
    return result;
  }, [s.tasksToday, taskFilter]);
  const finalFilteredTasks = useMemo(() => {
    return (workflowModeActive && workflowModeTasks.length > 0) ? filteredTasks.filter((t: any) => workflowModeTasks.includes(t.id) || t.id === running?.taskId) : filteredTasks;
  }, [filteredTasks, workflowModeActive, workflowModeTasks, running]);

  const activeTasks = s.tasksToday.filter((t) => t.status !== "DONE");
  const doneTasks = s.tasksToday.filter((t) => t.status === "DONE");

  // Focus block active state - read from localStorage to sync with header chip
  const [focusBlockActive, setFocusBlockActive] = useState(false);
  const [focusTaskIds, setFocusTaskIds] = useState<string[]>([]);
  useEffect(() => {
    const uid = s.employee?.id;
    if (!uid) return;
    const check = () => {
      try {
        const raw = localStorage.getItem('taskboard.focus.' + uid);
        if (!raw) { setFocusBlockActive(false); setFocusTaskIds([]); return; }
        const parsed = JSON.parse(raw);
        const ids: string[] = Array.isArray(parsed?.taskIds) ? parsed.taskIds : [];
        setFocusBlockActive(ids.length > 0);
        setFocusTaskIds(ids);
      } catch { setFocusBlockActive(false); setFocusTaskIds([]); }
    };
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [s.employee?.id]);
  const focusTasks = s.tasksToday.filter((t) => focusTaskIds.includes(t.id));

  const empName = s.employee?.name?.split(" ")[0] ?? "";
  const deptName = s.employee?.department?.name ?? "";


  return (
    <div className="mx-auto max-w-4xl px-4 py-5 xl:grid xl:max-w-[1180px] xl:grid-cols-[minmax(0,1fr)_272px] xl:gap-8">
      <QuickAccess
        onNewTask={() => openCreateTaskDrawer()}
        onFocus={() => { void startFocusBlock(activeTasks.filter((t) => t.status !== "BLOCKED").slice(0, 3).map((t) => t.id)); }}
        focusDisabled={activeTasks.length === 0}
        focusHint={activeTasks.length === 0 ? "No open tasks to focus on" : "Start a focus block on your top open tasks"}
        focusActive={focusBlockActive}
        onBlocker={() => setBlockerOpen(true)}
        onSubmit={() => setSubmitOpen(true)}
      />
      <div className="min-w-0 space-y-5 xl:col-start-1 xl:row-start-1">
      {/* ================= GREETING ================= */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[16px] font-semibold text-ink">
            {greetingFor(nowMs)}, {empName}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {deptName ? `${deptName} · ` : ""}
            {s.employee?.title ?? ""}
            {" · "}
            {new Date(nowMs).toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setBlockerOpen(true)} className="h-8 rounded-md px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-ink">Raise blocker</button>
          <button type="button" onClick={() => setSubmitOpen(true)} className="h-8 rounded-md px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-ink">Submit deliverable</button>
        </div>
      </div>

      {/* Lane I: workload guard (planned vs capacity, plan check, suggested order) */}
      <WorkloadSection onPlanChanged={() => setPlanKey((k) => k + 1)}>
        <TopThree reloadKey={planKey} />
      </WorkloadSection>

      {/* ================= MASTER SHIFT HOURGLASS BAR ================= */}
      <div className="rounded-2xl border border-hover bg-raised p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-bg border border-hover">
              <Hourglass
                className={`h-7 w-7 ${
                  running
                    ? "text-tealhi animate-pulse"
                    : isShiftPaused
                    ? "text-amber"
                    : "text-muted"
                }`}
              />
              {running && !isShiftPaused && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-tealhi">
                  <span className="h-2 w-2 rounded-full bg-bg animate-ping" />
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-muted">
                  Shift Hourglass
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isGoalMet
                      ? "bg-emerald/20 text-emerald border border-emerald/30"
                      : running && !isShiftPaused
                      ? "bg-tealhi/20 text-tealhi border border-tealhi/30"
                      : isShiftPaused
                      ? "bg-amber/20 text-amber border border-amber/30"
                      : "bg-hover text-muted"
                  }`}
                >
                  {isGoalMet
                    ? "8h Goal Achieved"
                    : running && !isShiftPaused
                    ? "Active & Productive"
                    : isShiftPaused
                    ? `Paused — ${s.shiftPauseReason ?? "Break"}`
                    : "Standby"}
                </span>
              </div>

              <div className="mt-1 text-lg font-bold text-ink flex items-baseline gap-2">
                <span className="font-mono tabular-nums">
                  {fmtMs(liveLoggedMs)}
                </span>
                <span className="text-xs font-normal text-muted">
                  / 8h 00m
                </span>
                {s.otMs > 0 && (
                  <span className="text-xs font-mono font-bold text-emerald bg-emerald/10 px-2 py-0.5 rounded-full">
                    +OT {fmtMs(s.otMs)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Hourglass Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {isShiftPaused ? (
              <button
                onClick={handleResumeShift}
                className="flex items-center gap-1.5 rounded-xl bg-emerald px-4 py-2 text-xs font-bold text-white hover:bg-emerald/90 transition shadow-lg"
              >
                <Play className="h-4 w-4 fill-current" /> Resume Shift
              </button>
            ) : (
              <button
                onClick={() => setBreakModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-edge bg-bg px-3.5 py-2 text-xs font-medium text-ink hover:border-amber hover:text-amber transition"
              >
                <Coffee className="h-4 w-4 text-amber" /> Pause / Break
              </button>
            )}

            <button
              onClick={() => setLogOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-hover bg-bg px-3 py-2 text-xs text-muted hover:text-ink transition"
            >
              <Clock3 className="h-3.5 w-3.5 text-tealhi" /> Manual Log
            </button>
          </div>
        </div>

        {/* Master Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted">
            <span>{progressPercent}% Complete</span>
            <span>
              {remainingMs > 0
                ? `${Math.floor(remainingMs / 3600000)}h ${Math.floor(
                    (remainingMs % 3600000) / 60000
                  )}m remaining`
                : "Overtime Active"}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg border border-hover">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isGoalMet
                  ? "bg-emerald"
                  : running && !isShiftPaused
                  ? "bg-teal"
                  : "bg-amber"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {/* Mini stats row */}
          <div className="flex items-center gap-4 text-[10px] font-mono text-muted pt-1">
            <span>Tracked: {fmtMs(s.sessionMs)}</span>
            {s.manualMs > 0 && <span>Manual: {fmtMs(s.manualMs)}</span>}
            {s.breakMs > 0 && <span>Break: {fmtMs(s.breakMs)}</span>}
            <span className="ml-auto">
              {activeTasks.length} active · {doneTasks.length} done
            </span>
          </div>
        </div>
      </div>

      {/* ================= LIVE FOCUS TASK BAR ================= */}
      {running && !isShiftPaused ? (
        <div className="rounded-xl border border-teal/40 bg-teal/10 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-3 w-3 shrink-0 rounded-full bg-tealhi mt-1 animate-pulse" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-tealhi">
                    {running.code}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-tealhi/20 text-tealhi">
                    {CAT_LABEL[running.category] ?? running.category}
                  </span>
                </div>
                <h2 className="mt-1 text-base font-semibold text-ink">
                  {running.title}
                </h2>
                <div className="mt-1 font-mono text-sm font-bold text-tealhi tabular-nums">
                  Active: {fmtMsWithSec(liveSessionMs)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                onClick={() => pause()}
                className="flex items-center gap-1.5 rounded-lg border border-edge bg-raised px-3.5 py-2 text-xs font-semibold text-ink hover:bg-hover transition"
              >
                <Pause className="h-3.5 w-3.5 text-amber" /> Pause
              </button>
              <button
                onClick={() =>
                  setCompletingTask({
                    id: running.taskId,
                    title: running.title,
                    code: running.code,
                  })
                }
                className="flex items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-xs font-bold text-white hover:bg-tealhi transition"
              >
                <Check className="h-4 w-4" /> Complete
              </button>
            </div>
          </div>
        </div>
      ) : !running && !isShiftPaused && focusBlockActive && focusTasks.length > 0 ? (
        <div className="rounded-xl border border-teal/30 bg-teal/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-2 w-2 rounded-full bg-tealhi animate-pulse" />
            <span className="text-[12px] font-semibold text-tealhi">Focus Block Active</span>
            <span className="text-[11px] text-muted ml-auto">{focusTasks.length} task{focusTasks.length !== 1 ? "s" : ""} in focus</span>
          </div>
          <div className="space-y-2">
            {focusTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-teal/20 bg-bg px-3 py-2">
                <span className="font-mono text-[10px] text-tealhi shrink-0">{t.code}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{t.title}</span>
                <span className="text-[10px] text-teal/70 shrink-0">IN PROGRESS</span>
              </div>
            ))}
          </div>
        </div>
      ) : !running && !isShiftPaused ? (
        <div className="rounded-xl border border-dashed border-edge bg-raised/50 p-6 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted/50" />
          <h3 className="mt-2 text-sm font-semibold text-ink">
            No Active Task Running
          </h3>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            Pick a task below or launch a routine workflow to start tracking.
          </p>
        </div>
      ) : null}

      {/* ================= QUICK-SWITCH OPERATIONAL STREAMS ================= */}
      <div className="rounded-xl border border-hover bg-raised p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <Sparkles className="h-3.5 w-3.5 text-teal" />
            {deptName ? `${deptName} Workflows` : "Quick Workflows"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStreamsManageOpen((v) => !v)}
              className="text-[10px] font-semibold text-muted hover:text-ink transition"
            >
              {streamsManageOpen ? "Done" : "Manage"}
            </button>
            {streamsManageOpen && (
              <button
                onClick={openAddStream}
                className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-teal/10 hover:bg-teal/20 text-tealhi border border-teal/30 transition"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            )}
            {!streamsManageOpen && <span className="text-[11px] text-muted">1-click timer switch</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {streams.map((st) => {
            const Icon = st.icon;
            const isStreamRunning = running?.category === st.category;
            return (
              <div key={st.key} className="relative group">
                <button
                  disabled={streamBusy || isShiftPaused || streamsManageOpen}
                  onClick={() => handleStartStream(st)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    isStreamRunning
                      ? "border-teal bg-teal/20 shadow-md"
                      : `border-hover bg-bg ${st.bg}`
                  } ${isShiftPaused || streamsManageOpen ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className={`p-2 rounded-lg bg-raised ${st.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-ink">
                      {st.title}
                    </div>
                    <div className="text-[10px] text-muted">
                      {isStreamRunning ? "Running Now" : "Launch timer"}
                    </div>
                  </div>
                </button>
                {streamsManageOpen && (st as any).id && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    <button
                      onClick={() => openEditStream(st)}
                      className="p-1 rounded-md bg-raised hover:bg-hover text-muted border border-edge"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => deleteStream((st as any).id)}
                      className="p-1 rounded-md bg-crimson/10 hover:bg-crimson/20 text-crimson border border-crimson/30"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {streams.length === 0 && (
            <p className="col-span-full text-xs text-muted text-center py-4">
              No workflows yet. Click Manage → Add to create your own.
            </p>
          )}
        </div>
      </div>

      {streamFormOpen && (
        <div className="fixed inset-0 z-[85] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-raised border border-edge rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">
                {editingStreamId ? "Edit Workflow" : "Add Workflow"}
              </h3>
              <button onClick={() => setStreamFormOpen(false)} className="text-muted hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted">Title</label>
              <input
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                placeholder="e.g. Client Onboarding Calls"
                className="w-full rounded-lg bg-bg border border-edge px-3 py-2 text-xs text-ink outline-none focus:border-teal"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted">Category</label>
              <select
                value={streamCategory}
                onChange={(e) => setStreamCategory(e.target.value)}
                className="w-full rounded-lg bg-bg border border-edge px-3 py-2 text-xs text-ink outline-none focus:border-teal"
              >
                {Object.entries(CAT_LABEL).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
            <button
              disabled={streamSaving}
              onClick={saveStream}
              className="w-full rounded-lg bg-teal hover:bg-tealhi text-white text-xs font-bold py-2.5 transition disabled:opacity-60"
            >
              {streamSaving ? "Saving…" : editingStreamId ? "Save Changes" : "Add Workflow"}
            </button>
          </div>
        </div>
      )}

      <NeedsAttention tasks={s.tasksToday} currentUserId={s.employee?.id} reloadKey={attentionKey} />
      <RaiseBlockerModal open={blockerOpen} onClose={() => setBlockerOpen(false)} tasks={s.tasksToday} onCreated={() => setAttentionKey((k) => k + 1)} />
      <SubmitDeliverableModal open={submitOpen} onClose={() => setSubmitOpen(false)} tasks={s.tasksToday} />

      {/* ================= TODAY'S ACTION QUEUE ================= */}
      <div className="rounded-xl border border-hover bg-raised p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-hover pb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-bold text-muted">
              Today&apos;s Queue ({s.tasksToday.length})
            </h3>
            <div className="flex items-center gap-1">
              {(["all", "active", "done"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTaskFilter(f)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition ${
                    taskFilter === f
                      ? "bg-hover text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {f === "all"
                    ? `All (${s.tasksToday.length})`
                    : f === "active"
                    ? `Active (${activeTasks.length})`
                    : `Done (${doneTasks.length})`}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => openCreateTaskDrawer()}
            className="flex items-center gap-1 text-xs text-tealhi hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add Task
          </button>
        </div>

        {finalFilteredTasks.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">
            {taskFilter === "done"
              ? "No completed tasks yet today."
              : taskFilter === "active"
              ? "All tasks done! Great work."
              : "No tasks queued. Pick a workflow or create a task."}
          </div>
        ) : (
          <div className="space-y-2">
            {finalFilteredTasks.map((t) => {
              const isTaskRunning = running?.taskId === t.id;
              const isDone = t.status === "DONE";
              const CatIcon = CAT_ICON[t.category] ?? Activity;
              return (
                <div
                  key={t.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition ${
                    isTaskRunning
                      ? "border-teal bg-teal/10"
                      : isDone
                      ? "border-hover bg-bg/50 opacity-60"
                      : "border-hover bg-bg hover:border-edge"
                  }`}
                >
                  <div
                    onClick={() => setDrawerTaskId(t.id)}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <CatIcon className="h-3 w-3 text-muted shrink-0" />
                      <span className="font-mono text-[11px] text-muted">
                        {t.code}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          t.priority === "P0"
                            ? "bg-crimson/20 text-crimson"
                            : t.priority === "P1"
                            ? "bg-amber/20 text-amber"
                            : "bg-tealhi/20 text-tealhi"
                        }`}
                      >
                        {t.priority}
                      </span>
                      {t.elapsedMs > 0 && (
                        <span className="text-[10px] font-mono text-muted">
                          {fmtMs(t.elapsedMs)}
                        </span>
                      )}
                      {(t.subtaskTotal ?? 0) > 0 && (
                        <span className="text-[10px] font-mono text-muted">
                          {t.subtaskDone ?? 0}/{t.subtaskTotal} sub
                        </span>
                      )}
                    </div>
                    <div
                      className={`mt-0.5 text-xs font-semibold ${
                        isDone
                          ? "line-through text-muted"
                          : "text-ink"
                      }`}
                    >
                      {t.title}
                    </div>
                    {(t.clientName || t.projectName) && (
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted">
                        {t.clientName && <span>{t.clientName}</span>}
                        {t.projectName && (
                          <span className="text-tealhi">{t.projectName}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isDone && (
                      <>
                        <button
                          onClick={() => toggle(t.id)}
                          disabled={isShiftPaused}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                            isTaskRunning
                              ? "bg-amber text-white hover:bg-amber/90"
                              : "bg-hover text-ink hover:bg-edge"
                          } ${isShiftPaused ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {isTaskRunning ? (
                            <Pause className="h-3 w-3" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                          {isTaskRunning ? "Pause" : "Start"}
                        </button>
                        <button
                          onClick={() =>
                            setCompletingTask({
                              id: t.id,
                              title: t.title,
                              code: t.code,
                            })
                          }
                          className="flex items-center gap-1 rounded-lg border border-hover bg-raised px-2.5 py-1.5 text-xs text-emerald hover:bg-emerald/20 transition"
                        >
                          <Check className="h-3.5 w-3.5" /> Done
                        </button>
                      </>
                    )}
                    {isDone && (
                      <span className="flex items-center gap-1 text-xs text-emerald font-mono">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Done
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= MODAL: TAKE BREAK / PAUSE SHIFT ================= */}
      {breakModalOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-hover bg-raised p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <Coffee className="h-4 w-4 text-amber" /> Pause Shift &
              Take Break
            </div>
            <p className="text-xs text-muted">
              Pauses the master 8-hour hourglass AND any active task stopwatch.
              State persists across reloads and devices.
            </p>

            <div className="space-y-2">
              <label className="text-[11px] text-muted">
                Select Reason
              </label>
              {[
                { label: "Lunch Break (Standard 40m)", val: "Lunch Break" },
                { label: "Tea / Coffee Break (15m)", val: "Tea Break" },
                {
                  label: "Emergency / Personal Pause",
                  val: "Personal Emergency",
                },
                { label: "End of Day Shift Sign-Off", val: "Shift End" },
              ].map((r) => (
                <button
                  key={r.val}
                  onClick={() => setBreakReason(r.val)}
                  className={`w-full rounded-lg border p-2.5 text-left text-xs font-medium transition ${
                    breakReason === r.val
                      ? "border-amber bg-amber/10 text-ink"
                      : "border-hover bg-bg text-muted hover:border-edge"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-hover">
              <button
                onClick={() => setBreakModalOpen(false)}
                className="rounded-lg border border-hover px-3 py-1.5 text-xs text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={handleTakeBreak}
                className="rounded-lg bg-amber px-4 py-1.5 text-xs font-bold text-white hover:bg-amber/90 transition"
              >
                Confirm Pause
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {completingTask && (
        <CompleteTaskModal
          open={true}
          taskId={completingTask.id}
          taskCode={completingTask.code}
          isLeaderOrCreator={Boolean(
            ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "TEAM_LEAD"].includes(s.employee?.role ?? "")
          )}
          onClose={() => setCompletingTask(null)}
          onCompleted={() => {
            setCompletingTask(null);
            refresh();
          }}
        />
      )}

      {/* Manual Time Log Modal */}
      {logOpen && (
        <LogHoursModal
          onClose={() => setLogOpen(false)}
          onSaved={() => {
            setLogOpen(false);
            refresh();
          }}
          myTasks={s.tasksToday.map((t) => ({
            id: t.id,
            code: t.code,
            title: t.title,
            category: t.category,
          }))}
        />
      )}

      {/* Task Drawer */}
      <TaskDrawer
        open={drawerOpen}
        task={drawerTask}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerTaskId(null);
        }}
        onStatus={async (id, status, reason) => {
          await fetch(`/api/tasks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "status", status, reason }),
          });
          refresh();
        }}
        onSubtask={async (taskId, subtaskId, done) => {
          await fetch(`/api/tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "subtask", subtaskId, done }),
          });
          refresh();
        }}
      />
    
      {workflowLaunchStream && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex justify-center items-start pt-[10vh] px-4">
          <div className="bg-raised border border-edge rounded-2xl w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
            <div className="flex items-center justify-between p-5 border-b border-edge">
              <div>
                <h3 className="text-base font-bold text-ink">Launch Routine: {workflowLaunchStream.title}</h3>
                <p className="text-sm text-muted">Tap tasks to focus on — the order you tap is rank 1-3 — &amp; mark the top 3 priorities.</p>
              </div>
            </div>

            <div className="overflow-y-auto p-5 space-y-3 flex-1 bg-surface">
              {initial.tasksToday.filter((t: any) => !t.done).length === 0 ? (
                <p className="text-sm text-muted text-center py-6">No active tasks available to attach.</p>
              ) : (
                initial.tasksToday.filter((t: any) => !t.done).map((t: any) => {
                  const isSelected = workflowSelectedTasks.includes(t.id);
                  const isPriority = workflowPriorities.includes(t.id);
                  return (
                    <div key={t.id} className={`p-4 rounded-xl border text-sm flex flex-col gap-2.5 transition-all ${isSelected ? 'border-teal bg-teal/5' : 'border-edge bg-raised hover:border-edge/80'}`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 w-4 h-4 rounded border-edge text-teal focus:ring-teal/20"
                          checked={isSelected}
                          // COO rule: a workflow holds at most 3 tasks; pick order = priority (1, 2, 3).
                          disabled={!isSelected && workflowSelectedTasks.length >= 3}
                          onChange={(e) => {
                            if(e.target.checked) setWorkflowSelectedTasks(prev => (prev.length >= 3 ? prev : [...prev, t.id]));
                            else {
                               setWorkflowSelectedTasks(prev => prev.filter(id => id !== t.id));
                               setWorkflowPriorities(prev => prev.filter(id => id !== t.id));
                            }
                          }}
                        />
                        <div className="flex-1 leading-tight mt-0.5">
                          {isSelected && (
                            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal text-[11px] font-bold text-white" title="Priority in this workflow">
                              {workflowSelectedTasks.indexOf(t.id) + 1}
                            </span>
                          )}
                          <span className="font-mono text-xs text-muted mr-2">{t.code}</span>
                          <span className={isSelected ? 'text-ink font-semibold' : 'text-muted'}>{t.title}</span>
                          {t.assignees && t.assignees.length > 0 && <span className="text-[10px] ml-2 text-muted/70">assigned to you</span>}
                        </div>
                      </div>

                      {isSelected && (
                        <div className="ml-7 flex items-center justify-between pt-1 border-t border-edge">
                          <label className="flex items-center gap-2 text-xs cursor-pointer text-muted hover:text-ink">
                            <input
                               type="checkbox"
                               className="w-3.5 h-3.5 rounded border-edge text-amber focus:ring-amber/20"
                               checked={isPriority}
                               onChange={(e) => {
                                 if(e.target.checked) {
                                   if(workflowPriorities.length >= 3) {
                                     alert("Select up to 3 priorities max");
                                     return;
                                   }
                                   setWorkflowPriorities(prev => [...prev, t.id]);
                                 } else {
                                   setWorkflowPriorities(prev => prev.filter(id => id !== t.id));
                                 }
                               }}
                            />
                            Mark as Top 3 Priority
                          </label>
                          {isPriority && <span className="bg-amber/20 text-amber text-[10px] font-bold px-2 py-0.5 rounded">PRIORITY</span>}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div className="p-4 border-t border-edge bg-raised flex justify-end gap-3 flex-shrink-0">
              <button
                 onClick={() => setWorkflowLaunchStream(null)}
                 className="px-5 py-2.5 text-sm font-semibold text-muted hover:text-ink transition"
              >Cancel</button>
              <button
                 onClick={async () => {
                   // T8: the tapped order is the rank the block stores, so the employee picks
                   // the 1-2-3 order just by tapping.
                   const ok = await startFocusBlock(workflowSelectedTasks);
                   if (ok) {
                     setWorkflowLaunchStream(null);
                     setWorkflowSelectedTasks([]);
                     setWorkflowPriorities([]);
                   }
                 }}
                 disabled={workflowSelectedTasks.length < 1 || workflowSelectedTasks.length > 3}
                 title={
                   workflowSelectedTasks.length > 3
                     ? `A focus block holds up to 3 tasks — you picked ${workflowSelectedTasks.length}`
                     : "Run one combined timer over these tasks"
                 }
                 className="px-4 py-2.5 text-sm font-semibold border border-teal text-teal hover:bg-teal/10 rounded-xl flex items-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                 <Layers className="h-4 w-4" />
                 Focus Block ({workflowSelectedTasks.length}/3)
              </button>
              <button
                 onClick={() => { setWorkflowModeActive(true); }}
                 className="px-6 py-2.5 text-sm font-semibold bg-teal hover:bg-tealhi text-white rounded-xl flex items-center gap-2 shadow-sm transition"
              >
                 Start Workflow
              </button>
            </div>
          </div>
        </div>
      )}
</div>
</div>
  );
}
