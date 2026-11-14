"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Video,
  Clock,
  Users,
  Briefcase,
  Loader2,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  LayoutGrid,
  ExternalLink,
  List,
  Zap,
  Calendar,
  ChevronDown,
  Flag,
  Target,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ScheduleMeetingModal } from "@/components/meetings/ScheduleMeetingModal";
import { createTask as openCreateTaskDrawer, openTask } from "@/lib/task-drawer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  type:
    | "TASK_DEADLINE"
    | "MEETING"
    | "LEAD_DISCOVERY"
    | "PROJECT_MILESTONE"
    | "HR_LEAVE"
    | "PERSONAL_CALENDAR";
  startTime: string;
  endTime: string;
  allDay: boolean;
  status: string;
  priority?: string;
  url?: string;
  joinUrl?: string;
  location?: string;
  platform?: string;
  attendees?: { name: string; email?: string }[];
  associatedEntity?: {
    type: "TASK" | "LEAD" | "CLIENT" | "PROJECT" | "EMPLOYEE";
    id: string;
    label: string;
  };
}

type TabView = "month" | "week" | "today" | "tomorrow" | "next-week";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
type Priority = (typeof PRIORITIES)[number];

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const PRIORITY_BADGE: Record<Priority, string> = {
  LOW: "text-muted",
  MEDIUM: "text-amber",
  HIGH: "text-amber",
  URGENT: "text-crimson",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isOverdue(event: CalendarEvent): boolean {
  return (
    (event.type === "TASK_DEADLINE" || event.type === "LEAD_DISCOVERY") &&
    event.status !== "DONE" &&
    event.status !== "COMPLETED" &&
    new Date(event.startTime) < new Date()
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateFull(d: Date): string {
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function eventPillClasses(event: CalendarEvent): string {
  if (event.type === "MEETING")
    return "bg-teal/80 text-ink";
  if (isOverdue(event))
    return "bg-crimson/20 text-crimson border border-crimson/40";
  if (event.type === "TASK_DEADLINE")
    return "bg-amber/15 text-amber border border-amber/30";
  if (event.type === "PROJECT_MILESTONE")
    return "bg-violet/20 text-violet border border-violet/30";
  if (event.type === "HR_LEAVE")
    return "bg-teal/20 text-teal border border-teal/30";
  if (event.type === "PERSONAL_CALENDAR")
    return "bg-hover text-ink2 border border-edge";
  return "bg-surface text-muted border border-edge";
}

function eventDotColor(event: CalendarEvent): string {
  if (event.type === "MEETING") return "bg-[var(--accent-blue)]";
  if (isOverdue(event)) return "bg-crimson";
  if (event.type === "TASK_DEADLINE") return "bg-amber";
  if (event.type === "PROJECT_MILESTONE") return "bg-violet";
  if (event.type === "HR_LEAVE") return "bg-teal";
  if (event.type === "PERSONAL_CALENDAR") return "bg-muted";
  return "bg-muted";
}

function eventTypeLabel(event: CalendarEvent): string {
  if (event.type === "MEETING") return "Meeting";
  if (isOverdue(event)) return "Overdue";
  if (event.type === "TASK_DEADLINE") return "Task";
  if (event.type === "PROJECT_MILESTONE") return "Milestone";
  if (event.type === "HR_LEAVE") return "Leave";
  if (event.type === "PERSONAL_CALENDAR") return "Personal";
  return event.type.replace(/_/g, " ");
}

function buildMonthCells(
  year: number,
  month: number
): { date: Date; isCurrentMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push({
      date: new Date(year, month - 1, daysInPrev - startOffset + i + 1),
      isCurrentMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 35) {
    cells.push({
      date: new Date(
        year,
        month + 1,
        cells.length - startOffset - daysInMonth + 1
      ),
      isCurrentMonth: false,
    });
  }
  return cells;
}

/** Match events to a calendar day using date-only comparison (strips time). */
function getEventsForDay(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const target = stripTime(date).getTime();
  return events
    .filter((e) => {
      const eDate = stripTime(new Date(e.startTime)).getTime();
      return eDate === target;
    })
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
}

/** Returns the Monday that starts "next week" relative to today. */
function getNextWeekStart(today: Date): Date {
  const dow = today.getDay(); // 0=Sun
  let daysUntilMon = (1 - dow + 7) % 7;
  if (daysUntilMon === 0) daysUntilMon = 7; // if today is Mon, go 7 days ahead
  const d = new Date(today);
  d.setDate(today.getDate() + daysUntilMon);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── CalendarSkeleton ─────────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="grid grid-cols-7 border-b border-edge">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-muted"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            className="border-r border-b border-edge p-2 min-h-[80px] bg-bg"
          >
            <div className="w-6 h-6 rounded-full bg-surface animate-pulse mb-2" />
            {i % 3 === 0 && (
              <div className="h-4 rounded bg-surface animate-pulse mb-1" />
            )}
            {i % 5 === 0 && (
              <div className="h-4 rounded bg-surface animate-pulse" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── OverflowPopover ──────────────────────────────────────────────────────────

function OverflowPopover({
  events,
  onEventClick,
  onClose,
}: {
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-40 top-full left-0 mt-1 w-56 bg-raised border border-edge rounded-lg shadow-xl p-2 flex flex-col gap-1"
    >
      {events.map((evt) => (
        <button
          key={evt.id}
          onClick={(e) => {
            e.stopPropagation();
            onEventClick(evt);
            onClose();
          }}
          className={cn(
            "w-full text-left px-2 py-1 rounded text-[11px] truncate hover:opacity-80 transition-opacity",
            eventPillClasses(evt)
          )}
        >
          {!evt.allDay && (
            <span className="opacity-70 mr-1">{formatTime(evt.startTime)}</span>
          )}
          {evt.title}
        </button>
      ))}
    </div>
  );
}

// ─── DayActionPopup ───────────────────────────────────────────────────────────

function DayActionPopup({
  date,
  onClose,
  onOpenMeeting,
  onRefresh,
}: {
  date: Date;
  onClose: () => void;
  onOpenMeeting: (date: Date) => void;
  onRefresh: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function handleOpenTaskDrawer() {
    onClose();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    openCreateTaskDrawer({ dueDate: `${y}-${m}-${d}` });
  }

  return (
    <div
      ref={ref}
      className="bg-raised border border-edge rounded-xl shadow-2xl w-64 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-edge">
        <span className="text-xs font-semibold text-ink">
          {date.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-hover text-muted hover:text-ink transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-2 flex flex-col gap-1.5">
          <button
            onClick={handleOpenTaskDrawer}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg hover:bg-hover text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-amber/15 flex items-center justify-center shrink-0">
              <Flag className="w-4 h-4 text-amber" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink">+ Task</p>
              <p className="text-[10px] text-muted">Opens the full task form, due this day</p>
            </div>
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenMeeting(date);
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg hover:bg-hover text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-blue)]/15 flex items-center justify-center shrink-0">
              <Video className="w-4 h-4 text-[var(--accent-blue)]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink">+ Meeting</p>
              <p className="text-[10px] text-muted">Google Meet, Zoom, or Teams</p>
            </div>
          </button>
      </div>
    </div>
  );
}

// ─── EventDetailPanel ─────────────────────────────────────────────────────────

function EventDetailPanel({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const overdue = isOverdue(event);
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-surface border-l border-edge flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-edge flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mb-2",
                eventPillClasses(event)
              )}
            >
              {eventTypeLabel(event)}
            </span>
            {event.priority && (
              <span
                className={cn(
                  "ml-2 text-xs font-medium",
                  PRIORITY_BADGE[event.priority as Priority] || "text-muted"
                )}
              >
                {event.priority}
              </span>
            )}
            <h2 className="text-base font-semibold text-ink leading-snug mt-1">
              {event.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-hover text-muted hover:text-ink transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Time */}
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-ink">
                {event.allDay
                  ? "All day"
                  : `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`}
                {!event.allDay && (
                  <span className="text-muted ml-2 text-xs">
                    ({formatDuration(event.startTime, event.endTime)})
                  </span>
                )}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {formatDateFull(new Date(event.startTime))}
              </p>
            </div>
          </div>

          {/* Platform / location */}
          {(event.platform || event.location) && (
            <div className="flex items-start gap-3">
              <Video className="w-4 h-4 text-muted mt-0.5 shrink-0" />
              <p className="text-sm text-ink2">
                {event.platform || event.location}
              </p>
            </div>
          )}

          {/* Join button */}
          {event.joinUrl && (
            <a
              href={event.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-teal hover:bg-tealhi text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Join Meeting
            </a>
          )}

          {/* Task deep link */}
          {event.type === "TASK_DEADLINE" && event.url && (
            <a
              href={event.url}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber/15 hover:bg-amber/25 text-amber transition-colors"
            >
              <Target className="w-4 h-4" />
              Open Task
            </a>
          )}

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-start gap-3">
              <Users className="w-4 h-4 text-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted mb-1.5">
                  Attendees
                </p>
                <ul className="space-y-1">
                  {event.attendees.map((a, i) => (
                    <li key={i} className="text-sm text-ink2">
                      {a.name}
                      {a.email && (
                        <span className="text-faint ml-1.5 text-xs">
                          {a.email}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Associated entity */}
          {event.associatedEntity && (
            <div className="flex items-start gap-3">
              <Briefcase className="w-4 h-4 text-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted mb-0.5">
                  {event.associatedEntity.type}
                </p>
                <p className="text-sm text-ink2">
                  {event.associatedEntity.label}
                </p>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2 pt-3 border-t border-edge">
            {overdue ? (
              <AlertCircle className="w-4 h-4 text-crimson shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald shrink-0" />
            )}
            <span
              className={cn(
                "text-sm",
                overdue ? "text-crimson font-medium" : "text-muted"
              )}
            >
              {overdue ? "Overdue" : event.status}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── AgendaList ───────────────────────────────────────────────────────────────

function AgendaList({
  dates,
  events,
  onEventClick,
  today,
}: {
  dates: Date[];
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  today: Date;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {dates.map((date, idx) => {
        const dayEvents = getEventsForDay(events, date);
        const isToday = isSameDay(date, today);
        return (
          <div key={idx}>
            {/* Day header row */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className={cn(
                  "w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0",
                  isToday
                    ? "bg-teal text-white"
                    : "bg-surface border border-edge text-ink"
                )}
              >
                <span className="text-[10px] font-semibold leading-none">
                  {DAY_HEADERS[(date.getDay() + 6) % 7]}
                </span>
                <span className="text-sm font-bold leading-none mt-0.5">
                  {date.getDate()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {MONTH_NAMES[date.getMonth()]} {date.getDate()},{" "}
                  {date.getFullYear()}
                </p>
                <p className="text-[11px] text-muted">
                  {isToday
                    ? "Today"
                    : isSameDay(
                        date,
                        new Date(today.getTime() + 86400000)
                      )
                    ? "Tomorrow"
                    : dayEvents.length === 0
                    ? "No events"
                    : `${dayEvents.length} event${dayEvents.length > 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            {dayEvents.length === 0 ? (
              <div className="ml-14 py-3 text-xs text-faint italic">
                Nothing scheduled
              </div>
            ) : (
              <div className="ml-14 flex flex-col gap-2">
                {dayEvents.map((evt) => (
                  <button
                    key={evt.id}
                    onClick={() => onEventClick(evt)}
                    className="w-full text-left group"
                  >
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all hover:shadow-sm",
                        evt.type === "MEETING"
                          ? "bg-[var(--accent-blue)]/5 border-[var(--accent-blue)]/20 hover:bg-[var(--accent-blue)]/10"
                          : isOverdue(evt)
                          ? "bg-crimson/5 border-crimson/20 hover:bg-crimson/10"
                          : evt.type === "TASK_DEADLINE"
                          ? "bg-amber/5 border-amber/20 hover:bg-amber/10"
                          : evt.type === "PROJECT_MILESTONE"
                          ? "bg-violet/5 border-violet/20 hover:bg-violet/10"
                          : "bg-surface border-edge hover:bg-hover"
                      )}
                    >
                      {/* Color dot */}
                      <span
                        className={cn(
                          "w-2.5 h-2.5 rounded-full shrink-0",
                          eventDotColor(evt)
                        )}
                      />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-ink truncate group-hover:text-teal transition-colors">
                          {evt.title}
                        </p>
                        <p className="text-[10px] text-muted mt-0.5">
                          {evt.allDay
                            ? eventTypeLabel(evt)
                            : `${formatTime(evt.startTime)} · ${eventTypeLabel(evt)}`}
                          {evt.associatedEntity &&
                            ` · ${evt.associatedEntity.label}`}
                        </p>
                      </div>

                      {/* Priority */}
                      {evt.priority && (
                        <span
                          className={cn(
                            "text-[10px] font-semibold shrink-0",
                            PRIORITY_BADGE[evt.priority as Priority] ||
                              "text-muted"
                          )}
                        >
                          {evt.priority}
                        </span>
                      )}

                      {/* Join button for meetings */}
                      {evt.joinUrl && (
                        <a
                          href={evt.joinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 px-2 py-0.5 rounded-md bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] text-[10px] font-semibold hover:bg-[var(--accent-blue)]/30 transition-colors"
                        >
                          Join
                        </a>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MonthGrid ────────────────────────────────────────────────────────────────

function MonthGrid({
  year,
  month,
  events,
  today,
  onDayClick,
  onEventClick,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  today: Date;
  onDayClick: (date: Date, anchor: DOMRect) => void;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const cells = buildMonthCells(year, month);
  const [overflowKey, setOverflowKey] = useState<string | null>(null);

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-edge">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-muted"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div
        className="grid grid-cols-7 flex-1"
        style={{
          gridTemplateRows: `repeat(${cells.length / 7}, minmax(88px, 1fr))`,
        }}
      >
        {cells.map((cell, idx) => {
          const dayEvents = getEventsForDay(events, cell.date);
          const isToday = isSameDay(cell.date, today);
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.slice(3);
          const cellKey = cell.date.toDateString();
          const showOverflow = overflowKey === cellKey;

          return (
            <div
              key={idx}
              onClick={(e) => {
                if (!cell.isCurrentMonth) return;
                setOverflowKey(null);
                onDayClick(
                  cell.date,
                  (e.currentTarget as HTMLElement).getBoundingClientRect()
                );
              }}
              className={cn(
                "border-r border-b border-edge p-1.5 flex flex-col relative",
                cell.isCurrentMonth
                  ? "bg-bg cursor-pointer hover:bg-hover transition-colors"
                  : "bg-bg cursor-default opacity-35",
                isToday &&
                  cell.isCurrentMonth &&
                  "bg-teal/[0.06] ring-1 ring-inset ring-teal/30"
              )}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium",
                    isToday && cell.isCurrentMonth
                      ? "bg-teal text-white"
                      : "text-ink2"
                  )}
                >
                  {cell.date.getDate()}
                </span>
              </div>

              {/* Event pills */}
              <div className="flex flex-col gap-0.5 flex-1">
                {visible.map((evt) => (
                  <button
                    key={evt.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(evt);
                    }}
                    title={evt.title}
                    className={cn(
                      "w-full text-left px-1.5 py-0.5 rounded text-[10px] leading-tight truncate hover:opacity-80 transition-opacity",
                      eventPillClasses(evt)
                    )}
                  >
                    {!evt.allDay && (
                      <span className="opacity-70 mr-1">
                        {formatTime(evt.startTime)}
                      </span>
                    )}
                    {evt.title}
                  </button>
                ))}

                {overflow.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOverflowKey(showOverflow ? null : cellKey);
                      }}
                      className="text-[10px] text-muted hover:text-ink pl-1 flex items-center gap-0.5 transition-colors"
                    >
                      +{overflow.length} more
                      <ChevronDown
                        className={cn(
                          "w-2.5 h-2.5 transition-transform",
                          showOverflow && "rotate-180"
                        )}
                      />
                    </button>
                    {showOverflow && (
                      <OverflowPopover
                        events={overflow}
                        onEventClick={(evt) => {
                          setOverflowKey(null);
                          onEventClick(evt);
                        }}
                        onClose={() => setOverflowKey(null)}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WeekGrid ─────────────────────────────────────────────────────────────────

function WeekGrid({
  weekStart,
  events,
  today,
  onDayClick,
  onEventClick,
}: {
  weekStart: Date;
  events: CalendarEvent[];
  today: Date;
  onDayClick: (date: Date, anchor: DOMRect) => void;
  onEventClick: (event: CalendarEvent) => void;
}) {
  // Align to Monday
  const monStart = new Date(weekStart);
  const dow = monStart.getDay();
  monStart.setDate(monStart.getDate() - ((dow + 6) % 7));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monStart);
    d.setDate(monStart.getDate() + i);
    return d;
  });

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-edge">
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div key={i} className="py-3 text-center">
              <p className="text-xs text-muted">
                {DAY_HEADERS[i]}
              </p>
              <p
                className={cn(
                  "mt-1 mx-auto w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold",
                  isToday ? "bg-teal text-white" : "text-ink2"
                )}
              >
                {day.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      {/* Day columns */}
      <div
        className="grid grid-cols-7 flex-1"
        style={{ minHeight: "420px" }}
      >
        {days.map((day, i) => {
          const dayEvents = getEventsForDay(events, day);
          const isToday = isSameDay(day, today);
          return (
            <div
              key={i}
              onClick={(e) =>
                onDayClick(
                  day,
                  (e.currentTarget as HTMLElement).getBoundingClientRect()
                )
              }
              className={cn(
                "border-r border-b border-edge p-1.5 flex flex-col gap-1 cursor-pointer transition-colors",
                isToday
                  ? "bg-teal/[0.06] ring-1 ring-inset ring-teal/30"
                  : "bg-bg hover:bg-hover"
              )}
            >
              {dayEvents.map((evt) => (
                <button
                  key={evt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(evt);
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1 rounded-md text-xs leading-snug hover:opacity-80 transition-opacity",
                    eventPillClasses(evt)
                  )}
                >
                  <span className="font-medium block truncate">{evt.title}</span>
                  {!evt.allDay && (
                    <span className="opacity-70 text-[10px]">
                      {formatTime(evt.startTime)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CalendarHub ──────────────────────────────────────────────────────────────

export function CalendarHub() {
  const today = new Date();

  const [tabView, setTabView] = useState<TabView>("month");
  const [currentDate, setCurrentDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);

  // Day popup: positioned relative to popupContainerRef
  const [dayPopup, setDayPopup] = useState<{
    date: Date;
    top: number;
    left: number;
  } | null>(null);
  const popupContainerRef = useRef<HTMLDivElement>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const weekStart = (() => {
    const d = new Date(currentDate);
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return d;
  })();

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let start: Date;
      let end: Date;

      if (tabView === "today") {
        start = stripTime(today);
        end = new Date(start.getTime() + 86400000);
      } else if (tabView === "tomorrow") {
        start = stripTime(new Date(today.getTime() + 86400000));
        end = new Date(start.getTime() + 86400000);
      } else if (tabView === "next-week") {
        start = getNextWeekStart(today);
        end = new Date(start.getTime() + 7 * 86400000);
      } else if (tabView === "week") {
        start = new Date(weekStart);
        end = new Date(weekStart);
        end.setDate(end.getDate() + 7);
      } else {
        // month: fetch a 3-month window centred on current month
        start = new Date(year, month - 1, 1);
        end = new Date(year, month + 2, 0);
      }

      // Note: omitting `type` param so the API returns ALL event types
      const res = await fetch(
        `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setEvents(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      console.error("[CalendarHub] fetch error:", e);
      setError("Could not load calendar events.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, tabView, weekStart.toDateString()]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  function prev() {
    if (tabView === "month") {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (tabView === "week") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    }
    setDayPopup(null);
  }

  function next() {
    if (tabView === "month") {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (tabView === "week") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    }
    setDayPopup(null);
  }

  function goToday() {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setDayPopup(null);
  }

  // ── Header label ───────────────────────────────────────────────────────────

  const headerLabel = (() => {
    if (tabView === "today")
      return (
        "Today — " +
        today.toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      );
    if (tabView === "tomorrow") {
      const t = new Date(today.getTime() + 86400000);
      return (
        "Tomorrow — " +
        t.toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      );
    }
    if (tabView === "next-week") {
      const ns = getNextWeekStart(today);
      const ne = new Date(ns.getTime() + 6 * 86400000);
      return `${MONTH_NAMES[ns.getMonth()]} ${ns.getDate()} – ${ne.getDate()}, ${ns.getFullYear()}`;
    }
    if (tabView === "week") {
      const we = new Date(weekStart);
      we.setDate(we.getDate() + 6);
      if (weekStart.getMonth() === we.getMonth()) {
        return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()}–${we.getDate()}, ${year}`;
      }
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTH_NAMES[we.getMonth()]} ${we.getDate()}, ${year}`;
    }
    return `${MONTH_NAMES[month]} ${year}`;
  })();

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleDayClick(date: Date, anchor: DOMRect) {
    setSelectedEvent(null);
    if (!popupContainerRef.current) return;
    const container = popupContainerRef.current.getBoundingClientRect();
    let left = anchor.left - container.left;
    let top = anchor.bottom - container.top;
    // clamp right edge
    if (left + 264 > container.width) left = container.width - 268;
    if (left < 4) left = 4;
    setDayPopup((prev) =>
      prev && isSameDay(prev.date, date) ? null : { date, top, left }
    );
  }

  function handleEventClick(event: CalendarEvent) {
    setDayPopup(null);
    // Task pills open the same global task panel used everywhere else in
    // TaskBoard (Tasks board, My Work, Directory, ...) on top of the calendar,
    // instead of navigating away to /tasks.
    if (event.type === "TASK_DEADLINE" && event.associatedEntity) {
      openTask(event.associatedEntity.id);
      return;
    }
    setSelectedEvent(event);
  }

  function handleOpenMeetingModal() {
    setMeetingModalOpen(true);
  }

  // ── Agenda dates ───────────────────────────────────────────────────────────

  const agendaDates: Date[] = (() => {
    if (tabView === "today") return [stripTime(today)];
    if (tabView === "tomorrow")
      return [stripTime(new Date(today.getTime() + 86400000))];
    if (tabView === "next-week") {
      const ns = getNextWeekStart(today);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ns);
        d.setDate(ns.getDate() + i);
        return d;
      });
    }
    return [];
  })();

  const isAgendaView =
    tabView === "today" || tabView === "tomorrow" || tabView === "next-week";
  const showNavArrows = tabView === "month" || tabView === "week";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-[600px] bg-surface border border-edge rounded-lg overflow-hidden relative">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge gap-3 flex-wrap bg-raised">
        {/* Left: nav arrows + title */}
        <div className="flex items-center gap-2">
          {showNavArrows && (
            <>
              <button
                onClick={goToday}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-default)] text-muted hover:text-ink hover:bg-hover transition-colors"
              >
                Today
              </button>
              <button
                onClick={prev}
                className="p-1.5 rounded-md hover:bg-hover text-muted hover:text-ink transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={next}
                className="p-1.5 rounded-md hover:bg-hover text-muted hover:text-ink transition-colors"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          <h2 className="text-sm font-semibold text-ink truncate max-w-xs">
            {headerLabel}
          </h2>
          {loading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted shrink-0" />
          )}
        </div>

        {/* Right: view tabs + new meeting */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick-view tab strip */}
          <div className="flex items-center bg-bg border border-edge rounded-md p-0.5 gap-0.5">
            {(
              [
                { key: "month", label: "Month", Icon: LayoutGrid },
                { key: "week", label: "Week", Icon: CalendarDays },
                { key: "today", label: "Today", Icon: Zap },
                { key: "tomorrow", label: "Tomorrow", Icon: Calendar },
                { key: "next-week", label: "Next Week", Icon: List },
              ] as { key: TabView; label: string; Icon: React.FC<any> }[]
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setTabView(key);
                  setDayPopup(null);
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap",
                  tabView === key
                    ? "bg-raised text-ink shadow-sm"
                    : "text-muted hover:text-ink hover:bg-hover"
                )}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {label}
              </button>
            ))}
          </div>

          {/* New Meeting button */}
          <button
            onClick={handleOpenMeetingModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal hover:bg-tealhi text-white text-xs font-semibold rounded-md transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            New Meeting
          </button>
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-5 px-4 py-2 border-b border-edge flex-wrap bg-raised">
        {[
          { label: "Meeting", dot: "bg-[var(--accent-blue)]" },
          { label: "Task", dot: "bg-amber" },
          { label: "Overdue", dot: "bg-crimson" },
          { label: "Milestone", dot: "bg-violet" },
          { label: "Leave", dot: "bg-teal" },
        ].map((l) => (
          <span
            key={l.label}
            className="flex items-center gap-1.5 text-[11px] text-muted"
          >
            <span className={cn("w-2 h-2 rounded-full shrink-0", l.dot)} />
            {l.label}
          </span>
        ))}
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-crimson/20 bg-crimson/10 text-sm text-crimson">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={fetchEvents}
            className="text-xs underline underline-offset-2 hover:text-ink transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Calendar body ─────────────────────────────────────────────────── */}
      <div ref={popupContainerRef} className="flex-1 flex flex-col overflow-auto relative">
        {loading ? (
          <CalendarSkeleton />
        ) : isAgendaView ? (
          <AgendaList
            dates={agendaDates}
            events={events}
            onEventClick={handleEventClick}
            today={today}
          />
        ) : tabView === "month" ? (
          <MonthGrid
            year={year}
            month={month}
            events={events}
            today={today}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
          />
        ) : (
          <WeekGrid
            weekStart={weekStart}
            events={events}
            today={today}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
          />
        )}

        {/* Day action popup — absolutely positioned within body */}
        {dayPopup && (
          <div
            style={{
              position: "absolute",
              top: dayPopup.top,
              left: dayPopup.left,
              zIndex: 30,
            }}
          >
            <DayActionPopup
              date={dayPopup.date}
              onClose={() => setDayPopup(null)}
              onOpenMeeting={() => {
                setDayPopup(null);
                handleOpenMeetingModal();
              }}
              onRefresh={() => {
                fetchEvents();
                setDayPopup(null);
              }}
            />
          </div>
        )}
      </div>

      {/* ── Event detail panel ───────────────────────────────────────────── */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* ── Meeting modal ────────────────────────────────────────────────── */}
      <ScheduleMeetingModal
        isOpen={meetingModalOpen}
        onClose={() => setMeetingModalOpen(false)}
        onSuccess={() => {
          setMeetingModalOpen(false);
          fetchEvents();
        }}
      />
    </div>
  );
}
