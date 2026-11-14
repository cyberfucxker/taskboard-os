"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Coffee,
  XCircle,
  TrendingUp,
  UserCheck,
  Search,
  Filter,
  ArrowRight
} from "lucide-react";
import { Avatar, Card, Badge, SectionLabel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { ListToolbar, NoMatches, useListFilter } from "@/components/list";

export interface AttendanceRecord {
  employeeId: string;
  name: string;
  department: string;
  role: string;
  status: "PRESENT" | "HALF_DAY" | "ON_LEAVE" | "ABSENT";
  clockInTime: string | null;
  lastActiveTime: string | null;
  hoursWorked: number; // e.g. 7.5
  otHours: number; // e.g. 1.2
  notes?: string;
}

export function HrmsAttendanceRegister({
  people,
  canManage = true,
  initialAttendance,
  todayDateStr,
}: {
  people: { id: string; name: string; departmentName: string | null; role: string; status: string }[];
  canManage?: boolean;
  initialAttendance?: Record<string, AttendanceRecord>;
  /** The server's own IST-day-boundary date string — must match exactly what
   *  the attendance-override API reads/writes, or a saved correction silently
   *  never applies. Never compute "today" independently on the client here. */
  todayDateStr?: string;
}) {
  const [selectedDate, setSelectedDate] = useState<string>(
    todayDateStr ?? new Date().toISOString().slice(0, 10)
  );
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Attendance state initialized from live database session records when available
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>(() => {
    if (initialAttendance && Object.keys(initialAttendance).length > 0) {
      return initialAttendance;
    }
    const initial: Record<string, AttendanceRecord> = {};
    people.forEach((p, idx) => {
      const isLeave = p.status === "ON_LEAVE";
      const isHalf = idx % 7 === 0;
      const hours = isLeave ? 0 : isHalf ? 4.0 : 7.2 + (idx % 3) * 0.4;
      const ot = hours > 8 ? Number((hours - 8).toFixed(1)) : 0;

      initial[p.id] = {
        employeeId: p.id,
        name: p.name,
        department: p.departmentName || "General",
        role: p.role,
        status: isLeave ? "ON_LEAVE" : isHalf ? "HALF_DAY" : "PRESENT",
        clockInTime: isLeave ? null : "09:30 AM IST",
        lastActiveTime: isLeave ? null : "Active now",
        hoursWorked: Number(hours.toFixed(1)),
        otHours: ot,
        notes: isLeave ? "Approved Leave" : undefined,
      };
    });
    return initial;
  });

  const records = useMemo(() => {
    return people
      .filter((p) => p.status !== "EXITED")
      .map((p) => {
        const record = attendance[p.id] || {
          employeeId: p.id,
          name: p.name,
          department: p.departmentName || "General",
          role: p.role,
          status: p.status === "ON_LEAVE" ? "ON_LEAVE" : "PRESENT",
          clockInTime: "09:30 AM IST",
          lastActiveTime: "Active now",
          hoursWorked: 8.0,
          otHours: 0.0,
        };
        return record;
      });
  }, [people, attendance]);

  const rf = useListFilter(records, (r) => `${r.name} ${r.department} ${r.role}`);
  const filteredRecords = useMemo(
    () => rf.filtered.filter((r) => statusFilter === "ALL" || r.status === statusFilter),
    [rf.filtered, statusFilter]
  );

  const metrics = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.status === "PRESENT").length;
    const halfDay = records.filter((r) => r.status === "HALF_DAY").length;
    const onLeave = records.filter((r) => r.status === "ON_LEAVE").length;
    const absent = records.filter((r) => r.status === "ABSENT").length;
    const totalHours = records.reduce((acc, r) => acc + r.hoursWorked, 0);
    const avgHours = total > 0 ? (totalHours / (present + halfDay || 1)).toFixed(1) : "0";

    return { total, present, halfDay, onLeave, absent, avgHours };
  }, [records]);

  const toast = useToast();

  const updateStatus = async (employeeId: string, status: AttendanceRecord["status"]) => {
    if (!canManage) return;
    const prevRecord = attendance[employeeId];
    if (!prevRecord) return;
    const hoursWorked = status === "ON_LEAVE" || status === "ABSENT" ? 0 : status === "HALF_DAY" ? 4.0 : 8.0;

    // Optimistic update, rolled back if the save fails — this used to only
    // ever update local state and silently lose the change on refresh.
    setAttendance((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], status, hoursWorked },
    }));

    try {
      const res = await fetch("/api/hrms/attendance-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, dateStr: selectedDate, status, hoursWorked }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to save (${res.status})`);
      }
    } catch (err) {
      setAttendance((prev) => ({ ...prev, [employeeId]: prevRecord }));
      toast((err as Error).message || "Could not save attendance change", "error");
    }
  };

  const getStatusBadge = (status: AttendanceRecord["status"]) => {
    switch (status) {
      case "PRESENT":
        return <Badge text="Present" kind="DONE" />;
      case "HALF_DAY":
        return <Badge text="Half Day" kind="P1" />;
      case "ON_LEAVE":
        return <Badge text="On Leave" kind="TODO" />;
      case "ABSENT":
        return <Badge text="Absent" kind="BLOCKED" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Attendance Metrics Overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <div className="text-[11px] font-semibold text-muted">Total Headcount</div>
          <div className="mt-1 text-xl font-bold text-ink">{metrics.total}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-emerald">Present Today</div>
          <div className="mt-1 text-xl font-bold text-emerald">{metrics.present}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-amber">Half Day</div>
          <div className="mt-1 text-xl font-bold text-amber">{metrics.halfDay}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-tealhi">On Leave</div>
          <div className="mt-1 text-xl font-bold text-tealhi">{metrics.onLeave}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-crimson">Absent</div>
          <div className="mt-1 text-xl font-bold text-crimson">{metrics.absent}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-amber">Avg Daily Hours</div>
          <div className="mt-1 text-xl font-bold text-amber">{metrics.avgHours}h</div>
        </div>
      </div>

      {/* Controls Bar */}
      <ListToolbar
        sticky
        filter={rf}
        shown={filteredRecords.length}
        total={records.length}
        noun="people"
        placeholder="Filter by name, department, role…"
        className="rounded-lg border border-line"
        pills={(["ALL", "PRESENT", "HALF_DAY", "ON_LEAVE", "ABSENT"] as const).map((st) => ({
          id: st,
          label: st === "ALL" ? "All" : st.replace("_", " "),
          active: statusFilter === st,
          onClick: () => setStatusFilter(st),
        }))}
      >
        <div className="flex h-8 items-center gap-1.5 rounded-md border border-edge bg-transparent px-2.5 text-[13px] text-ink">
          <Calendar className="h-3.5 w-3.5 text-teal" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-xs text-ink outline-none"
          />
        </div>
      </ListToolbar>

      {/* Attendance Table */}
      <div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-edge bg-bg text-[11px] font-semibold text-muted">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Shift Status</th>
                <th className="px-4 py-3">Clock In</th>
                <th className="px-4 py-3">Last Active</th>
                <th className="px-4 py-3">Logged Work</th>
                <th className="px-4 py-3">OT / Extra</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/50 text-ink">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-muted">
                    {rf.active ? <NoMatches filter={rf} className="py-6" /> : "No attendance records found matching filters."}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => (
                  <tr key={r.employeeId} className="transition hover:bg-raised/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.name} size={24} />
                        <div>
                          <div className="font-medium text-ink">{r.name}</div>
                          <div className="text-[11px] text-muted">{r.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{r.department}</td>
                    <td className="px-4 py-3">{getStatusBadge(r.status)}</td>
                    <td className="px-4 py-3 tnum text-xs text-ink">
                      {r.clockInTime ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-emerald" />
                          {r.clockInTime}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tnum text-xs text-ink">
                      {r.lastActiveTime === "Active now" ? (
                        <span className="flex items-center gap-1.5 text-emerald">
                          <span className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
                          Active now
                        </span>
                      ) : (
                        <span className="text-muted">{r.lastActiveTime || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tnum text-xs font-semibold text-ink">
                      {r.hoursWorked > 0 ? `${r.hoursWorked} hrs` : "0.0 hrs"}
                    </td>
                    <td className="px-4 py-3 tnum text-xs">
                      {r.otHours > 0 ? (
                        <span className="text-emerald">+{r.otHours} hrs</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            title="Mark Present"
                            onClick={() => updateStatus(r.employeeId, "PRESENT")}
                            className="rounded p-1 text-muted hover:bg-hover hover:text-emerald"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Mark Half Day"
                            onClick={() => updateStatus(r.employeeId, "HALF_DAY")}
                            className="rounded p-1 text-muted hover:bg-hover hover:text-amber"
                          >
                            <Coffee className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Mark On Leave"
                            onClick={() => updateStatus(r.employeeId, "ON_LEAVE")}
                            className="rounded p-1 text-muted hover:bg-hover hover:text-tealhi"
                          >
                            <AlertCircle className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Mark Absent"
                            onClick={() => updateStatus(r.employeeId, "ABSENT")}
                            className="rounded p-1 text-muted hover:bg-hover hover:text-crimson"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
