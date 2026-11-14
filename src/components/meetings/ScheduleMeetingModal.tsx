import React, { useState } from "react";
import {
  Video,
  Calendar,
  Clock,
  User,
  Users,
  Briefcase,
  Layers,
  X,
  Plus,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  AlertCircle,
} from "lucide-react";

interface ScheduleMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultTaskId?: string;
  defaultTaskTitle?: string;
  defaultLeadId?: string;
  defaultLeadTitle?: string;
  defaultClientId?: string;
  defaultClientTitle?: string;
}

export const ScheduleMeetingModal: React.FC<ScheduleMeetingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultTaskId,
  defaultTaskTitle,
  defaultLeadId,
  defaultLeadTitle,
  defaultClientId,
  defaultClientTitle,
}) => {
  const [title, setTitle] = useState(
    defaultTaskTitle
      ? `Sync on Task: ${defaultTaskTitle}`
      : defaultLeadTitle
      ? `Discovery Call: ${defaultLeadTitle}`
      : defaultClientTitle
      ? `Client Review: ${defaultClientTitle}`
      : "Acme Team / Client Sync"
  );
  const [platform, setPlatform] = useState<
    "GOOGLE_MEET" | "ZOOM" | "MICROSOFT_TEAMS"
  >("GOOGLE_MEET");
  const [startDate, setStartDate] = useState(() => {
    // A <input type="datetime-local"> value is timezone-naive: the browser
    // displays and later re-parses it as LOCAL wall-clock time. Building the
    // default from toISOString() (UTC) mislabels UTC-now as local-now, which
    // then gets converted a second time on submit — shifting the stored time
    // by the viewer's UTC offset. Use local getters so the round trip is correct
    // for every employee's timezone, not just UTC+0.
    const d = new Date();
    d.setMinutes(d.getMinutes() + 15);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [attendees, setAttendees] = useState<
    { name: string; email: string }[]
  >([]);
  const [customMeetingUrl, setCustomMeetingUrl] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState<any>(null);

  // ── Validation state ─────────────────────────────────────────────────────
  // `submitted` is set to true only on the first submit attempt.
  // Validation messages are hidden until then.
  const [submitted, setSubmitted] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const titleMissing = submitted && !title.trim();
  const dateMissing = submitted && !startDate;

  if (!isOpen) return null;

  const handleAddAttendee = () => {
    if (!attendeeEmail.trim() || !attendeeEmail.includes("@")) return;
    const name = attendeeEmail.split("@")[0];
    setAttendees([...attendees, { name, email: attendeeEmail.trim() }]);
    setAttendeeEmail("");
  };

  const handleRemoveAttendee = (idx: number) => {
    setAttendees(attendees.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mark form as submitted so validation messages become visible
    setSubmitted(true);

    // Client-side validation
    if (!title.trim() || !startDate) {
      // errors will render via titleMissing / dateMissing
      return;
    }

    setLoading(true);
    setApiError(null);

    try {
      const start = new Date(startDate);

      // Field names here must match what POST /api/meetings actually reads
      // (scheduledAt, durationMinutes, clientId) — a previous version sent
      // startTime/endTime/leadId/clientAccountId, none of which the API or
      // the MeetingSchedule model recognize, so every submission failed.
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          platform,
          scheduledAt: start.toISOString(),
          durationMinutes: parseInt(durationMinutes, 10) || 30,
          taskId: defaultTaskId,
          clientId: defaultClientId,
          attendees,
          customMeetingUrl: customMeetingUrl || undefined,
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to schedule meeting");
      }

      setCreatedMeeting(json.data);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setApiError(err.message || "Failed to create meeting room");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-surface backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-surface border border-edge rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-edge bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal flex items-center justify-center text-white shadow-md">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink tracking-tight">
                Instant Google Meet &amp; Sync
              </h3>
              <p className="text-xs text-muted">
                Generate deterministic room or schedule with team &amp; clients
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {createdMeeting ? (
          <div className="p-6 space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald/20 border border-emerald/30 text-emerald flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h4 className="text-lg font-bold text-ink">
                Meeting Scheduled!
              </h4>
              <p className="text-xs text-muted mt-1 max-w-md mx-auto">
                {createdMeeting.meetingUrl
                  ? "Synchronized across all dashboards."
                  : "No meeting link is on file for the host yet — add one in Settings, or edit this meeting to paste a link."}
              </p>
            </div>

            {createdMeeting.meetingUrl ? (
              <div className="p-4 rounded-xl bg-surface border border-edge text-left space-y-2">
                <div className="text-xs font-semibold text-muted">
                  Meeting URL:
                </div>
                <div className="flex items-center justify-between gap-2 p-2 bg-surface rounded-lg border border-edge font-mono text-xs text-emerald break-all">
                  <span>{createdMeeting.meetingUrl}</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber/30 border border-amber/40 text-left">
                <p className="text-xs text-amber">
                  No link yet. Attendees can't join until one is added — the meeting
                  is still saved and shows on the calendar.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              {createdMeeting.meetingUrl && (
                <a
                  href={createdMeeting.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 px-4 bg-emerald hover:bg-emerald text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-lg"
                >
                  <Video className="w-4 h-4" />
                  Launch Meeting
                  <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                </a>
              )}
              <button
                onClick={onClose}
                className="py-2.5 px-5 bg-hover hover:bg-hover text-ink rounded-xl text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="p-6 space-y-4 overflow-y-auto flex-1"
          >
            {/* API error — shown only after submit */}
            {apiError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-crimson/10 border border-crimson/20 text-crimson text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}

            {/* Meeting Title */}
            <div>
              <label className="block text-xs font-medium text-ink2 mb-1.5">
                Meeting / Room Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Design Feedback Sync with Sam"
                className={`w-full bg-surface border rounded-xl px-3.5 py-2 text-xs text-white placeholder-muted focus:outline-none transition-colors ${
                  titleMissing
                    ? "border-crimson focus:border-crimson"
                    : "border-edge focus:border-teal"
                }`}
              />
              {titleMissing && (
                <p className="mt-1 text-[11px] text-crimson">
                  Title is required.
                </p>
              )}
            </div>

            {/* Platform Selection */}
            <div>
              <label className="block text-xs font-medium text-ink2 mb-1.5">
                Platform
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "GOOGLE_MEET", label: "Google Meet", icon: Video },
                  { key: "ZOOM", label: "Zoom Room", icon: Users },
                  { key: "MICROSOFT_TEAMS", label: "Teams", icon: Layers },
                ].map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      type="button"
                      key={p.key}
                      onClick={() =>
                        setPlatform(p.key as typeof platform)
                      }
                      className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 transition-all ${
                        platform === p.key
                          ? "bg-teal/20 border-teal text-tealhi"
                          : "bg-surface border-edge text-muted hover:border-edge hover:text-ink"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date and Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink2 mb-1.5">
                  Date &amp; Start Time
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`w-full bg-surface border rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none transition-colors ${
                    dateMissing
                      ? "border-crimson focus:border-crimson"
                      : "border-edge focus:border-teal"
                  }`}
                />
                {dateMissing && (
                  <p className="mt-1 text-[11px] text-crimson">
                    Scheduled time is required.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink2 mb-1.5">
                  Duration
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full bg-surface border border-edge rounded-xl px-3.5 py-2 text-xs text-ink focus:outline-none focus:border-teal transition-colors"
                >
                  <option value="15">15 Minutes (Speed Sync)</option>
                  <option value="30">30 Minutes (Standard)</option>
                  <option value="45">45 Minutes (Deep Dive)</option>
                  <option value="60">60 Minutes (Review / Workshop)</option>
                </select>
              </div>
            </div>

            {/* Attendees Input */}
            <div>
              <label className="block text-xs font-medium text-ink2 mb-1.5">
                Invite Attendees (Email)
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={attendeeEmail}
                  onChange={(e) => setAttendeeEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddAttendee();
                    }
                  }}
                  placeholder="colleague@example.com or client@company.com"
                  className="flex-1 bg-surface border border-edge rounded-xl px-3.5 py-2 text-xs text-ink placeholder-muted focus:outline-none focus:border-teal transition-colors"
                />
                <button
                  type="button"
                  onClick={handleAddAttendee}
                  className="px-3.5 py-2 bg-hover hover:bg-hover text-ink text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>

              {attendees.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {attendees.map((att, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-hover border border-edge text-ink text-xs flex items-center gap-1.5"
                    >
                      <User className="w-3 h-3 text-muted" />
                      {att.email}
                      <button
                        type="button"
                        onClick={() => handleRemoveAttendee(idx)}
                        className="text-muted hover:text-crimson ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-teal hover:bg-tealhi text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Google Meet Room...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create Instant Meeting Room
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
