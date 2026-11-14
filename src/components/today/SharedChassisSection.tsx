"use client";

import { useState, useEffect, useMemo } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import {
  Target,
  AlertTriangle,
  FileCheck,
  CheckCircle,
  ShieldAlert,
  Sparkles,
  Pin,
  ExternalLink,
  RefreshCw,
  Calendar,
  Clock,
  Video,
  ChevronDown,
  ChevronUp,
  User,
  Users,
  Building2,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  TrendingUp,
  PhoneCall,
  Link2,
  Layers,
  Code2,
  Palette,
  Search,
  Hourglass,
  Sliders,
  Send,
  Plus,
  X,
  Flame,
  Globe,
  MonitorCheck,
  Smartphone,
  ShieldCheck,
  Play,
  UploadCloud
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/Toast";
import { ScheduleMeetingModal } from "@/components/meetings/ScheduleMeetingModal";

interface SharedChassisSectionProps {
  initialTasks?: any[];
  currentUserId?: string;
  onTaskSelect?: (task: any) => void;
  canViewAllOps?: boolean;
}

export function SharedChassisSection({ initialTasks = [], currentUserId, onTaskSelect, canViewAllOps = false }: SharedChassisSectionProps) {
  const toast = useToast();
  const [personConfig, setPersonConfig] = useState<any>(null);
  const [allConfigs, setAllConfigs] = useState<any[]>([]);
  const [commitments, setCommitments] = useState<any[]>([]);
  const [blockers, setBlockers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSlotModal, setActiveSlotModal] = useState<number | null>(null);
  const [pickableTasks, setPickableTasks] = useState<any[]>([]);
  const [pickableLoading, setPickableLoading] = useState(false);
  const [activeBlockerModal, setActiveBlockerModal] = useState(false);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");
  const [expandedPersonEmail, setExpandedPersonEmail] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [scheduleMeetingOpen, setScheduleMeetingOpen] = useState(false);
  // Hydration-safe: time/locale strings render only after mount so server HTML
  // and browser HTML match (React #418). Server renders stable placeholders.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Blocker form state
  const [blockerReason, setBlockerReason] = useState("");
  const [blockerSeverity, setBlockerSeverity] = useState<"MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [blockerTaskId, setBlockerTaskId] = useState<string>("");

  // Submit gate form state
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitTaskId, setSubmitTaskId] = useState<string>("");
  const [submitArtifactUrl, setSubmitArtifactUrl] = useState("");
  const [submitArtifactType, setSubmitArtifactType] = useState("DRIVE");
  const [submitVerifying, setSubmitVerifying] = useState(false);

  async function loadMeetings() {
    try {
      const res = await fetch("/api/meetings?mine=true&upcoming=true&limit=5").then((r) => r.json());
      if (res?.ok) setCalendarEvents(res.data || []);
    } catch (err) {
      console.error("Failed to load meetings", err);
    } finally {
      setCalendarLoading(false);
    }
  }

  async function deleteMeeting(id: string) {
    try {
      const res = await fetch(`/api/meetings?id=${id}`, { method: "DELETE" }).then((r) => r.json());
      if (res?.ok) {
        toast("Meeting cancelled", "success");
        loadMeetings();
      } else {
        toast(res?.error || "Failed to cancel meeting", "error");
      }
    } catch {
      toast("Failed to cancel meeting", "error");
    }
  }

  const live = useLiveVersion();
  // Fetch chassis data on mount, and again whenever anything changes (realtime)
  useEffect(() => {
    loadMeetings();
    async function loadChassisData() {
      try {
        const [cfgRes, commRes, blockRes] = await Promise.all([
          fetch(canViewAllOps ? "/api/person-config?scope=all" : "/api/person-config").then((r) => r.json()),
          fetch("/api/commitments").then((r) => r.json()),
          fetch("/api/blockers").then((r) => r.json())
        ]);

        if (cfgRes?.ok) {
          setPersonConfig(cfgRes.data);
          if (cfgRes.allConfigs) setAllConfigs(cfgRes.allConfigs);
        }
        if (commRes?.ok) setCommitments(commRes.data || []);
        if (blockRes?.ok) setBlockers(blockRes.data || []);
      } catch (err) {
        console.error("Failed to load chassis data", err);
      } finally {
        setLoading(false);
      }
    }
    loadChassisData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const configJson = personConfig?.configJson || {};
  const roleTitle = configJson.role || personConfig?.moduleType || "Team Member";
  const userDept = configJson.department || "Operations";
  const focusAreas: string[] = configJson.focusAreas || [];
  const targets: Record<string, any> = configJson.targets || {};
  const userClients: string[] = configJson.clients || [];
  const operationalSections: any[] = configJson.operationalSections || [];

  // Pinned priorities handler
  async function openSlotModal(slot: number) {
    setActiveSlotModal(slot);
    setPickableLoading(true);
    try {
      const res = await fetch("/api/tasks").then((r) => r.json());
      if (res?.ok) {
        setPickableTasks((res.tasks || []).filter((t: any) => t.status !== "DONE"));
      }
    } catch (err) {
      console.error("Failed to load open tasks", err);
    } finally {
      setPickableLoading(false);
    }
  }

  async function clearSlot(slot: number) {
    try {
      const res = await fetch(`/api/commitments?slot=${slot}`, { method: "DELETE" }).then((r) => r.json());
      if (res?.ok) {
        setCommitments((prev) => prev.filter((c) => c.slot !== slot));
        toast("Priority slot cleared", "success");
      } else {
        toast(res?.error || "Failed to clear slot", "error");
      }
    } catch {
      toast("Failed to clear slot", "error");
    }
  }

  const handlePinSlot = async (slot: number, taskId: string) => {
    try {
      const res = await fetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, taskId })
      });
      const data = await res.json();
      if (data.ok) {
        toast("Priority commitment updated", "success");
        setCommitments((prev) => {
          const filtered = prev.filter((c) => c.slot !== slot);
          return [...filtered, data.data];
        });
        setActiveSlotModal(null);
      } else {
        toast(data.error || "Failed to update commitment", "error");
      }
    } catch {
      toast("Network error updating commitment", "error");
    }
  };

  // Blocker creation handler
  const handleCreateBlocker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockerReason.trim()) return;
    try {
      const res = await fetch("/api/blockers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: blockerTaskId || null,
          reason: blockerReason.trim(),
          severity: blockerSeverity
        })
      });
      const data = await res.json();
      if (data.ok) {
        toast("Blocker logged and team alerted", "success");
        setBlockers((prev) => [data.data, ...prev]);
        setBlockerReason("");
        setBlockerTaskId("");
        setActiveBlockerModal(false);
      } else {
        toast(data.error || "Failed to log blocker", "error");
      }
    } catch {
      toast("Error submitting blocker", "error");
    }
  };

  // Deliverable verification & submit gate
  const handleVerifyAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitArtifactUrl.trim() || !submitTaskId) return;

    setSubmitVerifying(true);
    try {
      const verifyRes = await fetch("/api/artifacts/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: submitArtifactUrl.trim(), taskId: submitTaskId })
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.ok && verifyData.data?.status === "FAILED") {
        toast("Artifact URL verification failed: " + (verifyData.data?.error || "Inaccessible"), "error");
        setSubmitVerifying(false);
        return;
      }

      toast("Artifact verified! Task submitted to review gate.", "success");
      setSubmitModalOpen(false);
      setSubmitArtifactUrl("");
      setSubmitTaskId("");
    } catch {
      toast("Artifact submission error", "error");
    } finally {
      setSubmitVerifying(false);
    }
  };

  // Real upcoming meetings (host or attendee), formatted for the rail.
  // Hydration-safe (T2): server renders stable placeholders; locale time + live
  // badges compute only after mount so server HTML == first client HTML (#418).
  const formattedCalendarEvents = useMemo(() => {
    if (!mounted) {
      return calendarEvents.map((m: any) => ({
        id: m.id,
        title: m.title,
        time: "",
        duration: `${m.durationMinutes}m`,
        client: m.client?.name || m.project?.name || (m.isHost ? "You're hosting" : m.host?.name) || "Internal",
        link: m.meetingUrl || "",
        isLiveSoon: false,
        canManage: !!m.isHost,
      }));
    }
    const now = Date.now();
    return calendarEvents.map((m: any) => {
      const scheduled = new Date(m.scheduledAt);
      return {
        id: m.id,
        title: m.title,
        time: scheduled.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }),
        duration: `${m.durationMinutes}m`,
        client: m.client?.name || m.project?.name || (m.isHost ? "You're hosting" : m.host?.name) || "Internal",
        link: m.meetingUrl || "",
        isLiveSoon: scheduled.getTime() - now < 30 * 60 * 1000 && scheduled.getTime() - now > -30 * 60 * 1000,
        canManage: !!m.isHost,
      };
    });
  }, [calendarEvents, mounted]);

  // Review Tray tasks
  const reviewTasks = useMemo(() => {
    return initialTasks.filter((t) => t.status === "IN_REVIEW" || t.status === "PENDING_APPROVAL");
  }, [initialTasks]);

  return (
    <div className="space-y-6 mb-8 font-sans">
      {/* =========================================================================
          PART 1: THE 6-PART SHARED CHASSIS
      ========================================================================= */}
      <div className="bg-raised border border-edge rounded-2xl p-5 shadow-2xl space-y-6 text-ink">

        {/* 1.1 Live State & Operational Header Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-hover">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center text-teal font-bold shadow-inner">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-bold text-lg text-ink tracking-tight">{roleTitle}</h3>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-teal/20 border border-teal/30 text-[#52B3BA] font-mono font-medium">
                  {personConfig?.moduleType || "ACME_MEMBER"}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold uppercase">
                  ● Live Active
                </span>
              </div>
              <p className="text-xs text-muted mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-[#52B3BA] font-medium">Focus Areas:</span>
                {focusAreas.length > 0 ? focusAreas.join(" • ") : "Core Operational Delivery"}
              </p>
            </div>
          </div>

          {/* Quick Target KPI Chips */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {Object.entries(targets).slice(0, 4).map(([key, val]: [string, any], idx) => (
              <div key={idx} className="bg-bg border border-edge rounded-xl px-3 py-1.5 text-center min-w-[90px]">
                <div className="text-[9px] text-muted uppercase tracking-wider font-mono truncate max-w-[130px]">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </div>
                <div className="text-xs font-bold text-[#52B3BA] mt-0.5">
                  {typeof val === "boolean" ? (val ? "PASS" : "PENDING") : String(val)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 1.2 Top Grid: Today's Three Priorities (Left 2 cols) & Calendar Rail (Right col) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Today's Three Priority Commitments (2 Cols) */}
          <div className="lg:col-span-2 bg-bg border border-hover rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-bold text-ink">Today's Three Priorities</h4>
                  <span className="text-[11px] text-muted">(Non-negotiable daily delivery)</span>
                </div>
                <span className="text-[10px] text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 font-mono">
                  MAX 3 COMMITTED
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[1, 2, 3].map((slot) => {
                  const commitment = commitments.find((c) => c.slot === slot);
                  const task = commitment?.task;

                  return (
                    <div
                      key={slot}
                      onClick={() => openSlotModal(slot)}
                      className={cn(
                        "group relative border rounded-xl p-3.5 flex flex-col justify-between cursor-pointer transition-all duration-200 min-h-[110px]",
                        task
                          ? "bg-raised border-edge hover:border-teal/60 shadow-sm"
                          : "bg-raised/40 border-dashed border-edge hover:border-teal/40 hover:bg-raised/80"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                          <Pin className="w-3 h-3" /> Slot #{slot}
                        </span>
                        {task ? (
                          <div className="flex items-center gap-1">
                            <span
                              className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                                task.status === "DONE"
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  : task.status === "IN_PROGRESS"
                                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                  : "bg-hover text-muted"
                              )}
                            >
                              {task.status}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                clearSlot(slot);
                              }}
                              className="p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-300"
                              title="Clear this slot"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted group-hover:text-[#52B3BA] flex items-center gap-0.5 font-medium">
                            <Plus className="w-3 h-3" /> Pin
                          </span>
                        )}
                      </div>

                      {task ? (
                        <div>
                          <h5 className="text-xs font-semibold text-ink line-clamp-2 group-hover:text-[#7ECAD0] transition-colors">
                            {task.title}
                          </h5>
                          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted truncate">
                            {task.client?.name && (
                              <span className="text-[#52B3BA] font-medium">{task.client.name}</span>
                            )}
                            {task.project?.name && <span>• {task.project.name}</span>}
                          </div>
                        </div>
                      ) : (
                        <div className="py-3 text-center text-xs text-muted group-hover:text-ink">
                          Click to select priority
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Clients Coverage Badge Strip */}
            {userClients.length > 0 && (
              <div className="mt-3 pt-3 border-t border-hover flex items-center gap-2 text-[11px] text-muted overflow-x-auto">
                <Building2 className="w-3.5 h-3.5 text-teal shrink-0" />
                <span className="shrink-0 text-slate-400 font-medium">Active Accounts:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {userClients.map((c, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-raised border border-edge text-ink text-[10px]">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Calendar Rail (1 Col) */}
          <div className="bg-bg border border-hover rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <h4 className="text-sm font-bold text-ink">Calendar Rail</h4>
                </div>
                <button
                  onClick={() => setScheduleMeetingOpen(true)}
                  className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Meeting
                </button>
              </div>

              <div className="space-y-2.5">
                {calendarLoading ? (
                  <p className="text-xs text-muted text-center py-4">Loading meetings…</p>
                ) : formattedCalendarEvents.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-muted">No upcoming meetings</p>
                  </div>
                ) : (
                  formattedCalendarEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="bg-raised border border-edge rounded-xl p-2.5 flex items-center justify-between gap-2 hover:border-blue-500/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span suppressHydrationWarning className="text-[10px] font-bold text-blue-400 font-mono">{ev.time}</span>
                          <span className="text-[9px] px-1 rounded bg-hover text-muted">{ev.duration}</span>
                          {ev.isLiveSoon && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold animate-pulse">
                              SOON
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-ink truncate mt-0.5">{ev.title}</p>
                        <span className="text-[10px] text-[#52B3BA]/80">{ev.client}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {ev.link ? (
                          <a
                            href={ev.link}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 transition-colors"
                            title="Join meeting"
                          >
                            <Video className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span
                            className="p-2 rounded-lg bg-hover text-muted border border-edge"
                            title="No meeting link on file yet"
                          >
                            <Video className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {ev.canManage && (
                          <button
                            onClick={() => deleteMeeting(ev.id)}
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 transition-colors"
                            title="Cancel meeting"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-3 pt-2 text-right">
              <span className="text-[10px] text-muted font-mono">Synced with Google Calendar & Acme Meets</span>
            </div>
          </div>
        </div>

        {/* 1.3 Bottom Grid: Blockers & Aging (Left) + Review Tray & Typed Submit Gate (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Blockers & Aging */}
          <div className="bg-bg border border-hover rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-4 h-4" />
                <h4 className="text-sm font-bold text-ink">Blockers & Aging Escalations</h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 font-mono font-bold">
                  {blockers.length} ACTIVE
                </span>
              </div>
              <button
                onClick={() => setActiveBlockerModal(true)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> Raise Blocker
              </button>
            </div>

            {blockers.length === 0 ? (
              <div className="py-6 text-center border border-dashed border-hover rounded-xl bg-raised/30">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1 opacity-75" />
                <p className="text-xs text-muted">Zero active blockers across your workflows</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {blockers.map((b: any) => (
                  <div
                    key={b.id}
                    className="bg-raised border border-rose-900/30 rounded-xl p-3 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-ink truncate">{b.task?.title || "Operational Blocker"}</span>
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                          b.severity === "CRITICAL"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        )}>
                          {b.severity}
                        </span>
                        <span className="text-[9px] font-mono text-rose-400/90 bg-rose-950/40 px-1.5 rounded">
                          &gt;24h Aging
                        </span>
                      </div>
                      <p className="text-muted text-[11px] line-clamp-2">{b.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Review Tray & Typed Submit Gate */}
          <div className="bg-bg border border-hover rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-teal">
                  <FileCheck className="w-4 h-4" />
                  <h4 className="text-sm font-bold text-ink">Review Tray & Submit Gate</h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal/10 border border-teal/20 font-mono font-bold">
                    {reviewTasks.length} PENDING
                  </span>
                </div>
                <button
                  onClick={() => setSubmitModalOpen(true)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-teal/10 hover:bg-[#34767D]/20 text-[#52B3BA] border border-teal/30 flex items-center gap-1 transition-colors"
                >
                  <UploadCloud className="w-3 h-3" /> Submit Deliverable
                </button>
              </div>

              {reviewTasks.length === 0 ? (
                <div className="py-6 text-center border border-dashed border-hover rounded-xl bg-raised/30">
                  <CheckCircle2 className="w-6 h-6 text-teal mx-auto mb-1 opacity-75" />
                  <p className="text-xs text-muted">All deliverables reviewed and cleared</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {reviewTasks.map((t) => (
                    <div
                      key={t.id}
                      className="bg-raised border border-edge rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink truncate">{t.title}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal/20 text-[#52B3BA] font-mono font-bold">
                            {t.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted mt-0.5">
                          {t.client?.name ? `Client: ${t.client.name}` : "Internal Delivery"} • Waiting Review
                        </p>
                      </div>
                      <span className="text-[10px] px-2 py-1 rounded bg-hover text-[#52B3BA] font-mono font-semibold">
                        Awaiting Lead
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-hover flex items-center justify-between text-[10px] text-muted">
              <span>Tier 0 & Tier 1 Automated Validation Gate</span>
              <span className="text-teal font-mono">Enforced before IN_REVIEW</span>
            </div>
          </div>

        </div>

      </div>

      {/* =========================================================================
          PART 2: INTERACTIVE 20-PERSON ROLE OPERATIONS ACCORDION — leadership only
      ========================================================================= */}
      {canViewAllOps && (
      <div className="bg-raised border border-edge rounded-2xl p-5 shadow-xl space-y-5 text-ink">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-ink">Role Operations & Departmental Workspaces</h3>
              <p className="text-xs text-muted">
                Personalized operational modules for all 20 active team members across 6 departments
              </p>
            </div>
          </div>

          {/* Department Filter Pills */}
          <div className="flex items-center gap-1.5 bg-bg p-1 rounded-xl border border-hover overflow-x-auto max-w-full">
            {[
              { key: "ALL", label: "All (20)" },
              { key: "Leadership", label: "Leadership (3)" },
              { key: "Sales & Servicing", label: "Sales (5)" },
              { key: "Development", label: "Dev (3)" },
              { key: "Design", label: "Design (3)" },
              { key: "Digital Marketing", label: "Marketing & SEO (5)" },
              { key: "HR & Operations", label: "HR (1)" }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSelectedDeptFilter(tab.key)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap",
                  selectedDeptFilter === tab.key
                    ? "bg-teal text-white shadow"
                    : "text-muted hover:text-ink hover:bg-raised"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Accordion Cards List */}
        <div className="space-y-3">
          {allConfigs
            .filter((c) => {
              if (selectedDeptFilter === "ALL") return true;
              return c.configJson?.department === selectedDeptFilter;
            })
            .map((item) => {
              const emp = item.employee || {};
              const empConfig = item.configJson || {};
              const isExpanded = expandedPersonEmail === emp.email || (!expandedPersonEmail && emp.email === personConfig?.employee?.email);
              const empSections: any[] = empConfig.operationalSections || [];
              const empTargets: Record<string, any> = empConfig.targets || {};
              const empClients: string[] = empConfig.clients || [];

              return (
                <div
                  key={item.id || emp.email}
                  className={cn(
                    "border rounded-xl transition-all overflow-hidden",
                    isExpanded
                      ? "bg-bg border-teal/50 shadow-lg"
                      : "bg-bg/60 border-edge hover:border-muted/40"
                  )}
                >
                  {/* Card Header (Click to toggle) */}
                  <div
                    onClick={() => setExpandedPersonEmail(isExpanded ? "" : emp.email)}
                    className="p-4 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-raised border border-edge flex items-center justify-center text-sm font-bold text-[#52B3BA]">
                        {emp.name ? emp.name.charAt(0) : "U"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-ink truncate">{emp.name}</span>
                          <span className="text-[10px] text-muted font-mono truncate">&lt;{emp.email}&gt;</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal/10 border border-teal/20 text-[#52B3BA] font-mono">
                            {item.moduleType}
                          </span>
                        </div>
                        <p className="text-xs text-muted truncate mt-0.5">
                          {empConfig.role} • <span className="text-slate-400">{empConfig.department}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Target Mini Badges */}
                      <div className="hidden md:flex items-center gap-2">
                        {Object.entries(empTargets).slice(0, 2).map(([k, v]: [string, any], idx) => (
                          <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-raised border border-edge text-muted">
                            {k.replace(/([A-Z])/g, " $1").trim()}: <strong className="text-[#52B3BA]">{String(v)}</strong>
                          </span>
                        ))}
                      </div>

                      <div className="p-1 rounded-lg bg-raised text-muted">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Operational Workspace */}
                  {isExpanded && (
                    <div className="p-4 pt-0 border-t border-hover space-y-4 mt-2">

                      {/* Focus Areas & Clients Strip */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-raised p-3 rounded-xl border border-hover text-xs">
                        <div>
                          <span className="font-semibold text-[#52B3BA]">Core Focus Areas:</span>
                          <p className="text-muted mt-0.5">
                            {empConfig.focusAreas?.join(" • ") || "General execution"}
                          </p>
                        </div>
                        <div>
                          <span className="font-semibold text-[#52B3BA]">Active Accounts:</span>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            {empClients.length > 0 ? (
                              empClients.map((cl, i) => (
                                <span key={i} className="px-2 py-0.5 rounded bg-bg border border-edge text-[10px] text-slate-300">
                                  {cl}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted">Organization-wide</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Operational Sections Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {empSections.map((sec, sIdx) => (
                          <div
                            key={sIdx}
                            className="bg-raised border border-edge rounded-xl p-3.5 space-y-2 hover:border-teal/40 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-teal" />
                                {sec.title}
                              </span>
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-bg text-muted">
                                {sec.type}
                              </span>
                            </div>

                            <div className="py-3 px-3 rounded-lg bg-bg/80 border border-hover text-[11px] text-muted flex items-center justify-between">
                              <span>Active Queue & Live Signal Status</span>
                              <span className="font-mono font-bold text-emerald-400 text-[10px]">● OPERATIONAL</span>
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
      )}

      {/* =========================================================================
          MODALS & DRAWERS
      ========================================================================= */}

      {scheduleMeetingOpen && (
        <ScheduleMeetingModal
          isOpen={scheduleMeetingOpen}
          onClose={() => setScheduleMeetingOpen(false)}
          onSuccess={() => {
            setScheduleMeetingOpen(false);
            loadMeetings();
          }}
        />
      )}

      {/* Pin Priority Commitment Modal */}
      {activeSlotModal !== null && (
        <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-raised border border-edge rounded-2xl p-5 max-w-lg w-full text-ink shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-hover">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-amber-400" />
                <h4 className="font-bold text-sm text-ink">Pin Priority Commitment #{activeSlotModal}</h4>
              </div>
              <button onClick={() => setActiveSlotModal(null)} className="text-muted hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {pickableLoading ? (
                <p className="text-xs text-muted text-center py-6">Loading your open tasks…</p>
              ) : pickableTasks.length === 0 ? (
                <p className="text-xs text-muted text-center py-6">No open tasks available to pin.</p>
              ) : (
                pickableTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handlePinSlot(activeSlotModal, t.id)}
                    className="p-3 rounded-xl border border-edge bg-bg hover:border-teal/60 cursor-pointer flex items-center justify-between gap-2 text-xs transition-colors"
                  >
                    <div>
                      <h5 className="font-semibold text-ink">{t.title}</h5>
                      <span className="text-[10px] text-[#52B3BA]">{t.client?.name || "No client"}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-raised text-amber-400 font-bold">
                      Pin Slot #{activeSlotModal}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Raise Blocker Modal */}
      {activeBlockerModal && (
        <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateBlocker} className="bg-raised border border-edge rounded-2xl p-5 max-w-md w-full text-ink shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-hover">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-4 h-4" />
                <h4 className="font-bold text-sm text-ink">Log Task Blocker</h4>
              </div>
              <button type="button" onClick={() => setActiveBlockerModal(false)} className="text-muted hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">Related Task (Optional)</label>
                <select
                  value={blockerTaskId}
                  onChange={(e) => setBlockerTaskId(e.target.value)}
                  className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-xs text-ink focus:border-rose-500 outline-none"
                >
                  <option value="">-- General Operational Blocker --</option>
                  {initialTasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">Severity</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["MEDIUM", "HIGH", "CRITICAL"] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setBlockerSeverity(sev)}
                      className={cn(
                        "py-1.5 rounded-lg font-bold text-[10px] border transition-all",
                        blockerSeverity === sev
                          ? "bg-rose-500/20 text-rose-300 border-rose-500"
                          : "bg-bg text-muted border-edge"
                      )}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">Reason / What's blocked?</label>
                <textarea
                  required
                  rows={3}
                  value={blockerReason}
                  onChange={(e) => setBlockerReason(e.target.value)}
                  placeholder="e.g. Waiting on client TRF asset approval, staging DB query timeout..."
                  className="w-full bg-bg border border-edge rounded-xl p-3 text-xs text-ink focus:border-rose-500 outline-none resize-none"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveBlockerModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow"
              >
                Log Blocker
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Deliverable Submit Gate Modal */}
      {submitModalOpen && (
        <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleVerifyAndSubmit} className="bg-raised border border-edge rounded-2xl p-5 max-w-md w-full text-ink shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-hover">
              <div className="flex items-center gap-2 text-teal">
                <UploadCloud className="w-4 h-4" />
                <h4 className="font-bold text-sm text-ink">Submit Deliverable to Review Gate</h4>
              </div>
              <button type="button" onClick={() => setSubmitModalOpen(false)} className="text-muted hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">Select Task</label>
                <select
                  required
                  value={submitTaskId}
                  onChange={(e) => setSubmitTaskId(e.target.value)}
                  className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-xs text-ink focus:border-teal outline-none"
                >
                  <option value="">-- Choose task to submit --</option>
                  {initialTasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title} ({t.client?.name || "Acme"})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">Artifact Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "DRIVE", label: "Google Drive" },
                    { id: "URL", label: "Live Staging URL" },
                    { id: "GITHUB", label: "Commit / PR" }
                  ].map((typ) => (
                    <button
                      key={typ.id}
                      type="button"
                      onClick={() => setSubmitArtifactType(typ.id)}
                      className={cn(
                        "py-1.5 rounded-lg font-bold text-[10px] border transition-all",
                        submitArtifactType === typ.id
                          ? "bg-teal/20 text-[#52B3BA] border-teal"
                          : "bg-bg text-muted border-edge"
                      )}
                    >
                      {typ.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">Deliverable URL / Reference</label>
                <input
                  required
                  type="url"
                  value={submitArtifactUrl}
                  onChange={(e) => setSubmitArtifactUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/... or https://staging.example.com"
                  className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-xs text-ink focus:border-teal outline-none"
                />
                <span className="text-[10px] text-muted mt-1 block">
                  Automated HTTP/HTTPS HEAD & Drive permission probe will run before submission.
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSubmitModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitVerifying}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-teal hover:bg-[#34767D] text-white shadow flex items-center gap-1.5 disabled:opacity-50"
              >
                {submitVerifying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" /> Verify & Submit
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
