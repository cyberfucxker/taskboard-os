import React, { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  Video,
  Clock,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Users,
  ExternalLink,
  Plus,
  Loader2,
  CalendarDays,
  ListTodo
} from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  type: "TASK_DEADLINE" | "MEETING" | "LEAD_DISCOVERY" | "PROJECT_MILESTONE" | "HR_LEAVE";
  startTime: string;
  endTime: string;
  allDay: boolean;
  status: string;
  priority?: string;
  url?: string;
  joinUrl?: string;
  location?: string;
  attendees?: { name: string; email?: string }[];
  associatedEntity?: {
    type: "TASK" | "LEAD" | "CLIENT" | "PROJECT" | "EMPLOYEE";
    id: string;
    label: string;
  };
}

interface CalendarTimelineViewProps {
  initialFilter?: "ALL" | "TASK" | "MEETING";
  employeeId?: string;
  onSelectTask?: (taskId: string) => void;
  onScheduleMeetingClick?: () => void;
  compact?: boolean;
}

export const CalendarTimelineView: React.FC<CalendarTimelineViewProps> = ({
  initialFilter = "ALL",
  employeeId,
  onSelectTask,
  onScheduleMeetingClick,
  compact = false,
}) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"ALL" | "TASK" | "MEETING">(initialFilter);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"TIMELINE" | "MONTH" | "AGENDA">("TIMELINE");

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0).toISOString();

      const params = new URLSearchParams({
        start: startOfMonth,
        end: endOfMonth,
        type: filterType,
      });
      if (employeeId) params.append("employeeId", employeeId);

      const res = await fetch(`/api/calendar/events?${params.toString()}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setEvents(json.data);
      }
    } catch (e) {
      console.error("Failed to load calendar events", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentDate, filterType, employeeId]);

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const resetToday = () => setCurrentDate(new Date());

  // Group events by Day
  const groupedEvents = events.reduce((acc, ev) => {
    const dayKey = new Date(ev.startTime).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(ev);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  const getPriorityBadge = (p?: string) => {
    switch (p) {
      case "URGENT":
        return "bg-crimson/20 text-crimson border-crimson/30";
      case "HIGH":
        return "bg-amber/20 text-amber border-amber/30";
      case "MEDIUM":
        return "bg-teal/20 text-tealhi border-teal/30";
      default:
        return "bg-hover text-ink2 border-edge";
    }
  };

  return (
    <div className={`bg-surface border border-edge rounded-2xl backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden ${compact ? "p-4" : "p-6"}`}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-edge">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal/10 flex items-center justify-center text-teal">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink tracking-tight flex items-center gap-2">
              Universal Timeline & Calendar
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald/10 text-emerald border border-emerald/20 font-medium">
                Live Feed
              </span>
            </h2>
            <p className="text-xs text-muted">
              Synchronized view of task deadlines, client calls, Google Meet rooms, and deliverable milestones.
            </p>
          </div>
        </div>

        {/* Controls & Mode Selectors */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Month Stepper */}
          <div className="flex items-center bg-surface border border-edge rounded-xl p-1">
            <button
              onClick={prevMonth}
              className="p-1.5 hover:bg-hover rounded-lg text-muted hover:text-ink transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={resetToday}
              className="px-3 py-1 text-xs font-semibold text-ink hover:text-ink"
            >
              {currentDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 hover:bg-hover rounded-lg text-muted hover:text-ink transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center bg-surface border border-edge rounded-xl p-1 gap-1">
            <button
              onClick={() => setFilterType("ALL")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                filterType === "ALL" ? "bg-teal text-white shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              All Events
            </button>
            <button
              onClick={() => setFilterType("MEETING")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                filterType === "MEETING" ? "bg-teal text-white shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              Syncs & Meets
            </button>
            <button
              onClick={() => setFilterType("TASK")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                filterType === "TASK" ? "bg-teal text-white shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              <ListTodo className="w-3.5 h-3.5" />
              Deadlines
            </button>
          </div>

          {/* Action: 1-Click Meeting creation */}
          {onScheduleMeetingClick && (
            <button
              onClick={onScheduleMeetingClick}
              className="px-3.5 py-1.5 bg-teal hover:bg-tealhi text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg transition-all border border-emerald/20"
            >
              <Plus className="w-3.5 h-3.5" />
              New Meeting / Room
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="mt-5 flex-1 min-h-[360px] overflow-y-auto pr-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 text-teal animate-spin" />
            <p className="text-xs text-muted">Aggregating timeline events from database & Google Meet...</p>
          </div>
        ) : Object.keys(groupedEvents).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-edge rounded-2xl bg-surface">
            <CalendarDays className="w-12 h-12 text-muted mb-3" />
            <h3 className="text-sm font-semibold text-ink2">No scheduled events or deadlines found</h3>
            <p className="text-xs text-muted mt-1 max-w-sm">
              No tasks due or meetings scheduled for this period. Use the button above to schedule an instant Google Meet room.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([dayString, dayEvents]) => (
              <div key={dayString} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal"></span>
                  <h4 className="text-xs font-bold text-muted">{dayString}</h4>
                  <div className="flex-1 h-px bg-hover"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {dayEvents.map((ev) => {
                    const isMeeting = ev.type === "MEETING";
                    const isTask = ev.type === "TASK_DEADLINE";

                    return (
                      <div
                        key={ev.id}
                        className={`group relative p-4 rounded-xl border transition-all hover:scale-[1.01] flex flex-col justify-between ${
                          isMeeting
                            ? "bg-teal border-teal/20 hover:border-teal/40 hover:shadow-lg"
                            : "bg-surface border-edge hover:border-edge hover:shadow-lg hover:shadow-black/40"
                        }`}
                      >
                        <div>
                          {/* Top Tag Row */}
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                                isMeeting
                                  ? "bg-teal/20 text-tealhi border-teal/30"
                                  : "bg-amber/20 text-amber border-amber/30"
                              }`}
                            >
                              {isMeeting ? <Video className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {isMeeting ? "SYNC / MEETING" : "TASK DEADLINE"}
                            </span>

                            {ev.priority && (
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getPriorityBadge(
                                  ev.priority
                                )}`}
                              >
                                {ev.priority}
                              </span>
                            )}
                          </div>

                          {/* Event Title */}
                          <h5 className="text-sm font-semibold text-ink group-hover:text-ink line-clamp-2">
                            {ev.title}
                          </h5>

                          {/* Entity Context pill */}
                          {ev.associatedEntity && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-hover text-ink2">
                                {ev.associatedEntity.type}
                              </span>
                              <span className="truncate max-w-[200px] text-ink2 font-medium">
                                {ev.associatedEntity.label}
                              </span>
                            </div>
                          )}

                          {/* Time & Attendees */}
                          <div className="mt-3 flex items-center justify-between text-xs text-muted">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-muted" />
                              <span>
                                {new Date(ev.startTime).toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </span>
                            </div>

                            {ev.attendees && ev.attendees.length > 0 && (
                              <div className="flex items-center gap-1 text-[11px] text-muted">
                                <Users className="w-3 h-3 text-muted" />
                                <span>{ev.attendees.length} joined</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bottom Actions */}
                        <div className="mt-4 pt-3 border-t border-edge flex items-center justify-between gap-2">
                          {isMeeting && ev.joinUrl ? (
                            <a
                              href={ev.joinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full py-1.5 px-3 rounded-lg bg-emerald hover:bg-emerald text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                            >
                              <Video className="w-3.5 h-3.5" />
                              Join Google Meet
                              <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                            </a>
                          ) : isTask && ev.associatedEntity?.id && onSelectTask ? (
                            <button
                              onClick={() => onSelectTask(ev.associatedEntity!.id)}
                              className="w-full py-1.5 px-3 rounded-lg bg-hover hover:bg-hover text-ink text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <ListTodo className="w-3.5 h-3.5" />
                              Open Task Drawer
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted italic">No direct action required</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
