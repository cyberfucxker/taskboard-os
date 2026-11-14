"use client";

import { useState } from "react";
import { ListToolbar, NoMatches, matchesTokens, useListFilter } from "@/components/list";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Avatar, Card, SectionLabel } from "@/components/ui";
import { EntityLink } from "@/components/entity/EntityLink";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/rbac";
import { HrmsAttendanceRegister, type AttendanceRecord } from "@/components/hrms/HrmsAttendanceRegister";

/**
 * HRMS Workbench — 5-tab client surface (Attendance / People / Devices / Performance / Access)
 * maintained in-app by HR and leadership.
 *
 * The server page passes fully-expanded `people` rows (including HR profile
 * fields + the three Json arrays) + refs. This component renders the tables
 * and — only when `canManage` is true — add/edit/delete controls that call the
 * RBAC-gated PATCH /api/employees/[id], then router.refresh() to re-read.
 * `includeExited` reveals EXITED people for HR to maintain resignees.
 */

export interface Device { deviceType?: string; assetId?: string; deviceId?: string; serialNo?: string; mobile?: string; mobileModel?: string; companySim?: string; returned?: boolean; }
export interface Review { reviewDate?: string; position?: string; response?: string; improvements?: string; goals?: string; nextReviewDate?: string; }
export interface Access { platform?: string; accessType?: string; companyEmail?: string; otherAccess?: string; mailIdUsed?: string; }

interface HrmsPerson {
  id: string; name: string; title: string | null; role: string; status: string;
  departmentId: string | null; departmentName: string | null; managerId: string | null;
  weeklyCapacityHrs: number | null;
  dob: string | null; joinedAt: string | null; employmentType: string | null;
  personalPhone: string | null; personalEmail: string | null; workEmail: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null;
  annualCtc: number | null; exitReason: string | null; exitedAt: string | null;
  devices: Device[] | null; performanceReviews: Review[] | null; toolAccess: Access[] | null;
}

type Tab = "attendance" | "people" | "devices" | "performance" | "access";

const inputCls =
  "w-full rounded-md border border-edge bg-transparent px-2 py-1.5 text-[13px] text-ink outline-none focus:border-teal";
const labelCls = "mb-1 block text-[11px] text-muted";
const btn = "rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white transition hover:bg-tealhi";
const ghost = "rounded-md border border-edge px-3 py-1.5 text-[12px] text-muted transition hover:text-ink";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtCtc(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}
function statusCls(s: string): string {
  switch (s) {
    case "ACTIVE": return "text-emerald";
    case "PROBATION": return "text-amber";
    case "ON_LEAVE": return "text-amber";
    case "OVERLOADED": return "text-crimson";
    default: return "text-muted";
  }
}

export function HrmsWorkbench({
  people,
  departments,
  managers,
  canManage,
  currentUserId,
  initialAttendance,
  todayDateStr,
}: {
  people: HrmsPerson[];
  departments: { id: string; name: string }[];
  managers: { id: string; name: string }[];
  canManage: boolean;
  currentUserId: string;
  initialAttendance?: Record<string, AttendanceRecord>;
  todayDateStr?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("people");
  const [includeExited, setIncludeExited] = useState(true);

  // Quick text filter for the People / Devices / Performance / Access tabs
  // (the attendance register has its own bar).
  const hf = useListFilter(people, (p) =>
    [p.name, p.title, p.role, p.status, p.departmentName, p.workEmail, p.personalEmail].filter(Boolean).join(" "),
    { urlSync: tab !== "attendance" }
  );
  const rowText = (name: string, o: unknown) => `${name} ${Object.values((o ?? {}) as Record<string, unknown>).join(" ")}`;
  const allDevices = people
    .flatMap((p) => (p.devices ?? []).map((d, idx) => ({ person: p, device: d, idx })))
    .filter((r) => matchesTokens(rowText(r.person.name, r.device), hf.tokens));
  const allReviews = people
    .flatMap((p) => (p.performanceReviews ?? []).map((r, idx) => ({ person: p, review: r, idx })))
    .filter((r) => matchesTokens(rowText(r.person.name, r.review), hf.tokens));
  const allAccess = people
    .flatMap((p) => (p.toolAccess ?? []).map((a, idx) => ({ person: p, access: a, idx })))
    .filter((r) => matchesTokens(rowText(r.person.name, r.access), hf.tokens));
  const peopleRows = hf.filtered.filter((p) => includeExited || p.status !== "EXITED");
  const tabTotal =
    tab === "people" ? people.filter((p) => includeExited || p.status !== "EXITED").length
    : tab === "devices" ? people.reduce((n, p) => n + (p.devices?.length ?? 0), 0)
    : tab === "performance" ? people.reduce((n, p) => n + (p.performanceReviews?.length ?? 0), 0)
    : people.reduce((n, p) => n + (p.toolAccess?.length ?? 0), 0);
  const tabRows = tab === "people" ? peopleRows.length : tab === "devices" ? allDevices.length : tab === "performance" ? allReviews.length : tab === "access" ? allAccess.length : 0;

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) {
      window.alert(json.error ?? "Save failed");
      return false;
    }
    router.refresh();
    return true;
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "attendance", label: "Daily Attendance", count: people.filter((p) => p.status !== "EXITED").length },
    { key: "people", label: "People", count: people.length },
    { key: "devices", label: "Devices", count: allDevices.length },
    { key: "performance", label: "Performance", count: allReviews.length },
    { key: "access", label: "Access", count: allAccess.length },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
              tab === t.key
                ? "bg-teal text-white"
                : "border border-edge text-muted hover:text-ink"
            }`}
          >
            {t.label} <span className="opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {tab !== "attendance" && (
        <ListToolbar filter={hf} shown={tabRows} total={tabTotal} sticky className="rounded-lg border border-line" placeholder="Filter this tab…" />
      )}
      {tab !== "attendance" && hf.active && tabRows === 0 && <NoMatches filter={hf} />}

      {!canManage && (
        <p className="label">Read-only — you can view HRMS data but not modify it.</p>
      )}

      {tab === "attendance" && (
        <HrmsAttendanceRegister people={people} canManage={canManage} initialAttendance={initialAttendance} todayDateStr={todayDateStr} />
      )}

      {tab === "people" && (
        <PeopleTab
          people={peopleRows}
          includeExited={includeExited}
          onToggleExited={() => setIncludeExited((v) => !v)}
          departments={departments}
          managers={managers}
          canManage={canManage}
          currentUserId={currentUserId}
          patch={patch}
        />
      )}
      {tab === "devices" && (
        <DevicesTab rows={allDevices} people={people} canManage={canManage} patch={patch} />
      )}
      {tab === "performance" && (
        <ReviewsTab rows={allReviews} people={people} canManage={canManage} patch={patch} />
      )}
      {tab === "access" && (
        <AccessTab rows={allAccess} people={people} canManage={canManage} patch={patch} />
      )}
    </div>
  );
}

/* ---------------- People ---------------- */

function PeopleTab({
  people, includeExited, onToggleExited, departments, managers, canManage, currentUserId, patch,
}: {
  people: HrmsPerson[]; includeExited: boolean; onToggleExited: () => void;
  departments: { id: string; name: string }[]; managers: { id: string; name: string }[];
  canManage: boolean; currentUserId: string;
  patch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<HrmsPerson | null>(null);

  async function remove(p: HrmsPerson) {
    if (!window.confirm(`Remove ${p.name}? They stay in the directory but are flagged as exited.`)) return;
    await fetch(`/api/employees/${p.id}`, { method: "DELETE" });
    window.location.reload();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>People</SectionLabel>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" checked={includeExited} onChange={onToggleExited} className="h-3.5 w-3.5" />
          Include exited
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-muted">
              <th className="py-1.5 pr-2">Employee</th>
              <th className="py-1.5 pr-2">Dept / Designation</th>
              <th className="py-1.5 pr-2">Type</th>
              <th className="py-1.5 pr-2">Status</th>
              <th className="py-1.5 pr-2">DOB</th>
              <th className="py-1.5 pr-2">Joined</th>
              <th className="py-1.5 pr-2">CTC</th>
              <th className="py-1.5 pr-2">Phone</th>
              <th className="py-1.5 pr-4">Work email</th>
              {canManage && <th className="py-1.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {people.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={p.name} size={26} />
                    <div className="min-w-0">
                      <EntityLink entity={{ type: "person", id: p.id, name: p.name }} className="font-medium text-ink" />
                      <div className="text-[11px] text-muted">{p.title ?? "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-2 text-muted">{p.departmentName ?? "—"}</td>
                <td className="py-2 pr-2 text-muted">{p.employmentType ?? "—"}</td>
                <td className="py-2 pr-2">
                  <span className={`tnum ${statusCls(p.status)}`}>{p.status}</span>
                  {p.status === "EXITED" && p.exitReason && (
                    <div className="text-[11px] text-muted">{p.exitReason}</div>
                  )}
                </td>
                <td className="py-2 pr-2 text-muted">{fmtDate(p.dob)}</td>
                <td className="py-2 pr-2 text-muted">{fmtDate(p.joinedAt)}</td>
                <td className="py-2 pr-2 tnum text-ink">{fmtCtc(p.annualCtc)}</td>
                <td className="py-2 pr-2 text-muted">{p.personalPhone ?? "—"}</td>
                <td className="py-2 pr-4 text-muted">{p.workEmail ?? "—"}</td>
                {canManage && (
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} className="rounded p-1 text-muted hover:bg-hover hover:text-ink">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(p)} aria-label={`Remove ${p.name}`} className="rounded p-1 text-muted hover:bg-hover hover:text-crimson">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {people.length === 0 && (
              <tr><td colSpan={10} className="py-6 text-center text-muted">No people match this view.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <PersonEditor
          person={editing}
          departments={departments}
          managers={managers}
          isOwn={editing.id === currentUserId}
          onClose={() => setEditing(null)}
          patch={patch}
        />
      )}
    </div>
  );
}

function PersonEditor({
  person, departments, managers, isOwn, onClose, patch,
}: {
  person: HrmsPerson; departments: { id: string; name: string }[];
  managers: { id: string; name: string }[]; isOwn: boolean; onClose: () => void;
  patch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState(person.role);
  const [title, setTitle] = useState(person.title ?? "");
  const [departmentId, setDepartmentId] = useState(person.departmentId ?? "");
  const [managerId, setManagerId] = useState(person.managerId ?? "");
  const [status, setStatus] = useState(person.status);
  const [weeklyCapacityHrs, setWeeklyCapacityHrs] = useState(person.weeklyCapacityHrs === null ? "" : String(person.weeklyCapacityHrs));
  const [employmentType, setEmploymentType] = useState(person.employmentType ?? "");
  const [dob, setDob] = useState(person.dob ? person.dob.slice(0, 10) : "");
  const [joinedAt, setJoinedAt] = useState(person.joinedAt ? person.joinedAt.slice(0, 10) : "");
  const [personalPhone, setPersonalPhone] = useState(person.personalPhone ?? "");
  const [personalEmail, setPersonalEmail] = useState(person.personalEmail ?? "");
  const [workEmail, setWorkEmail] = useState(person.workEmail ?? "");
  const [emergencyName, setEmergencyName] = useState(person.emergencyContactName ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(person.emergencyContactPhone ?? "");
  const [annualCtc, setAnnualCtc] = useState(person.annualCtc === null ? "" : String(person.annualCtc));
  const [exitReason, setExitReason] = useState(person.exitReason ?? "");
  const [exitedAt, setExitedAt] = useState(person.exitedAt ? person.exitedAt.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, unknown> = {
      name,
      role,
      title: title === "" ? null : title,
      departmentId: departmentId === "" ? null : departmentId,
      managerId: managerId === "" ? null : managerId,
      status,
      weeklyCapacityHrs: weeklyCapacityHrs === "" ? null : Number(weeklyCapacityHrs),
      employmentType: employmentType === "" ? null : employmentType,
      dob: dob === "" ? null : new Date(dob).toISOString(),
      joinedAt: joinedAt === "" ? null : new Date(joinedAt).toISOString(),
      personalPhone: personalPhone === "" ? null : personalPhone,
      personalEmail: personalEmail === "" ? null : personalEmail,
      workEmail: workEmail === "" ? null : workEmail,
      emergencyContactName: emergencyName === "" ? null : emergencyName,
      emergencyContactPhone: emergencyPhone === "" ? null : emergencyPhone,
      annualCtc: annualCtc === "" ? null : Number(annualCtc),
      exitReason: exitReason === "" ? null : exitReason,
      exitedAt: exitedAt === "" ? null : new Date(exitedAt).toISOString(),
    };
    const ok = await patch(person.id, payload);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-edge bg-bg p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[14px] font-semibold text-ink">Edit {person.name}</div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:bg-hover hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>Title / Designation</label>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Role{isOwn ? " (locked)" : ""}</label>
              <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} disabled={isOwn}>
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Employment type</label>
              <input className={inputCls} value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} placeholder="Full time" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Department</label>
              <select className={inputCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Reports to</label>
              <select className={inputCls} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">None</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {["ACTIVE", "OVERLOADED", "ON_LEAVE", "PROBATION", "EXITED"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Weekly capacity (hrs)</label>
              <input className={inputCls} type="number" min={0} value={weeklyCapacityHrs} onChange={(e) => setWeeklyCapacityHrs(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date of birth</label>
              <input className={inputCls} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Date of joining</label>
              <input className={inputCls} type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Personal phone</label>
              <input className={inputCls} value={personalPhone} onChange={(e) => setPersonalPhone(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Annual CTC</label>
              <input className={inputCls} type="number" step="any" value={annualCtc} onChange={(e) => setAnnualCtc(e.target.value)} placeholder="e.g. 360000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Personal email</label>
              <input className={inputCls} value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Work email</label>
              <input className={inputCls} value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Emergency contact</label>
              <input className={inputCls} value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} placeholder="Name" />
            </div>
            <div>
              <label className={labelCls}>Emergency phone</label>
              <input className={inputCls} value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
            </div>
          </div>
          {status === "EXITED" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Exit reason</label>
                <input className={inputCls} value={exitReason} onChange={(e) => setExitReason(e.target.value)} placeholder="Resigned / Terminated / Completed Internship / …" />
              </div>
              <div>
                <label className={labelCls}>Date of leaving</label>
                <input className={inputCls} type="date" value={exitedAt} onChange={(e) => setExitedAt(e.target.value)} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={ghost}>Cancel</button>
            <button type="submit" disabled={saving} className={btn}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Devices / Performance / Access ---------------- */

function DeviceEditor({ person, index, device, people, onClose, patch }: {
  person: HrmsPerson; index: number; device: Device;
  people: HrmsPerson[]; onClose: () => void;
  patch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [personId, setPersonId] = useState(person.id);
  const [d, setD] = useState<Device>({ ...device });
  const [saving, setSaving] = useState(false);
  const target = people.find((p) => p.id === personId) ?? person;
  const set = (k: keyof Device) => (e: React.ChangeEvent<HTMLInputElement>) => setD((v) => ({ ...v, [k]: e.target.value || undefined }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const arr = [...(target.devices ?? [])];
    if (index >= 0) arr[index] = d; else arr.push(d);
    const ok = await patch(target.id, { devices: arr });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <RowEditorModal title={index >= 0 ? "Edit device" : "Add device"} onClose={onClose} submit={submit} saving={saving}>
      <div>
        <label className={labelCls}>Employee</label>
        <select className={inputCls} value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Device type</label><input className={inputCls} value={d.deviceType ?? ""} onChange={set("deviceType")} placeholder="HP / Mac / Own" /></div>
        <div><label className={labelCls}>Asset ID</label><input className={inputCls} value={d.assetId ?? ""} onChange={set("assetId")} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Device ID</label><input className={inputCls} value={d.deviceId ?? ""} onChange={set("deviceId")} /></div>
        <div><label className={labelCls}>Serial no.</label><input className={inputCls} value={d.serialNo ?? ""} onChange={set("serialNo")} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Mobile phone</label><input className={inputCls} value={d.mobile ?? ""} onChange={set("mobile")} /></div>
        <div><label className={labelCls}>Mobile model / serial</label><input className={inputCls} value={d.mobileModel ?? ""} onChange={set("mobileModel")} /></div>
      </div>
      <div>
        <label className={labelCls}>Company SIM</label>
        <input className={inputCls} value={d.companySim ?? ""} onChange={set("companySim")} placeholder="Yes / No" />
      </div>
    </RowEditorModal>
  );
}

function ReviewEditor({ person, index, review, people, onClose, patch }: {
  person: HrmsPerson; index: number; review: Review;
  people: HrmsPerson[]; onClose: () => void;
  patch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [personId, setPersonId] = useState(person.id);
  const [r, setR] = useState<Review>({ ...review });
  const [saving, setSaving] = useState(false);
  const target = people.find((p) => p.id === personId) ?? person;
  const set = (k: keyof Review) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setR((v) => ({ ...v, [k]: e.target.value || undefined }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const arr = [...(target.performanceReviews ?? [])];
    if (index >= 0) arr[index] = r; else arr.push(r);
    const ok = await patch(target.id, { performanceReviews: arr });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <RowEditorModal title={index >= 0 ? "Edit review" : "Add review"} onClose={onClose} submit={submit} saving={saving}>
      <div>
        <label className={labelCls}>Employee</label>
        <select className={inputCls} value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Review date</label><input className={inputCls} type="date" value={r.reviewDate ? r.reviewDate.slice(0, 10) : ""} onChange={(e) => setR((v) => ({ ...v, reviewDate: e.target.value }))} /></div>
        <div><label className={labelCls}>Next review</label><input className={inputCls} type="date" value={r.nextReviewDate ? r.nextReviewDate.slice(0, 10) : ""} onChange={(e) => setR((v) => ({ ...v, nextReviewDate: e.target.value }))} /></div>
      </div>
      <div><label className={labelCls}>Position</label><input className={inputCls} value={r.position ?? ""} onChange={set("position")} /></div>
      <div><label className={labelCls}>Response / notes</label><textarea className={inputCls} rows={2} value={r.response ?? ""} onChange={set("response")} /></div>
      <div><label className={labelCls}>Areas for improvement</label><textarea className={inputCls} rows={2} value={r.improvements ?? ""} onChange={set("improvements")} /></div>
      <div><label className={labelCls}>Goals for next period</label><textarea className={inputCls} rows={2} value={r.goals ?? ""} onChange={set("goals")} /></div>
    </RowEditorModal>
  );
}

function AccessEditor({ person, index, access, people, onClose, patch }: {
  person: HrmsPerson; index: number; access: Access;
  people: HrmsPerson[]; onClose: () => void;
  patch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [personId, setPersonId] = useState(person.id);
  const [a, setA] = useState<Access>({ ...access });
  const [saving, setSaving] = useState(false);
  const target = people.find((p) => p.id === personId) ?? person;
  const set = (k: keyof Access) => (e: React.ChangeEvent<HTMLInputElement>) => setA((v) => ({ ...v, [k]: e.target.value || undefined }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const arr = [...(target.toolAccess ?? [])];
    if (index >= 0) arr[index] = a; else arr.push(a);
    const ok = await patch(target.id, { toolAccess: arr });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <RowEditorModal title={index >= 0 ? "Edit access" : "Add access"} onClose={onClose} submit={submit} saving={saving}>
      <div>
        <label className={labelCls}>Employee</label>
        <select className={inputCls} value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Platform / tool</label><input className={inputCls} value={a.platform ?? ""} onChange={set("platform")} placeholder="GitHub" /></div>
        <div><label className={labelCls}>Access type</label><input className={inputCls} value={a.accessType ?? ""} onChange={set("accessType")} placeholder="Admin / User" /></div>
      </div>
      <div><label className={labelCls}>Email / username</label><input className={inputCls} value={a.companyEmail ?? ""} onChange={set("companyEmail")} /></div>
      <div><label className={labelCls}>Other access / notes</label><input className={inputCls} value={a.otherAccess ?? ""} onChange={set("otherAccess")} /></div>
    </RowEditorModal>
  );
}

function RowEditorModal({ title, onClose, submit, saving, children }: {
  title: string; onClose: () => void; submit: (e: React.FormEvent) => void; saving: boolean; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-edge bg-bg p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[14px] font-semibold text-ink">{title}</div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:bg-hover hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {children}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={ghost}>Cancel</button>
            <button type="submit" disabled={saving} className={btn}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DevicesTab({ rows, people, canManage, patch }: {
  rows: { person: HrmsPerson; device: Device; idx: number }[];
  people: HrmsPerson[]; canManage: boolean;
  patch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<{ person: HrmsPerson; idx: number; device: Device } | null>(null);
  const [adding, setAdding] = useState<boolean>(false);
  const addPerson = people[0];

  async function del(row: { person: HrmsPerson; device: Device; idx: number }) {
    if (!window.confirm(`Remove this device from ${row.person.name}?`)) return;
    const arr = [...(row.person.devices ?? [])];
    arr.splice(row.idx, 1);
    await patch(row.person.id, { devices: arr });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Devices assigned</SectionLabel>
        {canManage && people.length > 0 && (
          <button className={btn} onClick={() => setAdding(true)}><Plus className="mr-1 inline h-3.5 w-3.5" />Add device</button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-muted">
              <th className="py-1.5 pr-2">Employee</th>
              <th className="py-1.5 pr-2">Device</th>
              <th className="py-1.5 pr-2">Asset ID</th>
              <th className="py-1.5 pr-2">Serial</th>
              <th className="py-1.5 pr-2">Mobile</th>
              <th className="py-1.5 pr-2">Model</th>
              <th className="py-1.5 pr-2">SIM</th>
              {canManage && <th className="py-1.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="py-2 pr-2 text-ink">{row.person.name}</td>
                <td className="py-2 pr-2 text-muted">{row.device.deviceType ?? "—"}</td>
                <td className="py-2 pr-2 font-mono text-muted">{row.device.assetId ?? "—"}</td>
                <td className="py-2 pr-2 font-mono text-muted">{row.device.serialNo ?? row.device.deviceId ?? "—"}</td>
                <td className="py-2 pr-2 text-muted">{row.device.mobile ?? "—"}</td>
                <td className="py-2 pr-2 text-muted">{row.device.mobileModel ?? "—"}</td>
                <td className="py-2 pr-2 text-muted">{row.device.companySim ?? "—"}</td>
                {canManage && (
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(row)} aria-label="Edit device" className="rounded p-1 text-muted hover:bg-hover hover:text-ink"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => del(row)} aria-label="Delete device" className="rounded p-1 text-muted hover:bg-hover hover:text-crimson"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-muted">No devices recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <DeviceEditor person={editing.person} index={editing.idx} device={editing.device} people={people} onClose={() => setEditing(null)} patch={patch} />
      )}
      {adding && addPerson && (
        <DeviceEditor person={addPerson} index={-1} device={{}} people={people} onClose={() => setAdding(false)} patch={patch} />
      )}
    </div>
  );
}

function ReviewsTab({ rows, people, canManage, patch }: {
  rows: { person: HrmsPerson; review: Review; idx: number }[];
  people: HrmsPerson[]; canManage: boolean;
  patch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<{ person: HrmsPerson; idx: number; review: Review } | null>(null);
  const [adding, setAdding] = useState(false);
  const addPerson = people[0];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Performance reviews</SectionLabel>
        {canManage && people.length > 0 && (
          <button className={btn} onClick={() => setAdding(true)}><Plus className="mr-1 inline h-3.5 w-3.5" />Add review</button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-muted">
              <th className="py-1.5 pr-2">Employee</th>
              <th className="py-1.5 pr-2">Review date</th>
              <th className="py-1.5 pr-2">Position</th>
              <th className="py-1.5 pr-2">Response</th>
              <th className="py-1.5 pr-2">Next review</th>
              {canManage && <th className="py-1.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="py-2 pr-2 text-ink">{row.person.name}</td>
                <td className="py-2 pr-2 text-muted">{fmtDate(row.review.reviewDate)}</td>
                <td className="py-2 pr-2 text-muted">{row.review.position ?? "—"}</td>
                <td className="py-2 pr-2 text-muted">
                  {row.review.improvements || row.review.response ? (
                    <span title={row.review.response ?? ""}>{row.review.improvements ?? row.review.response}</span>
                  ) : "—"}
                </td>
                <td className="py-2 pr-2 text-muted">{fmtDate(row.review.nextReviewDate)}</td>
                {canManage && (
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(row)} aria-label="Edit review" className="rounded p-1 text-muted hover:bg-hover hover:text-ink"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => {
                        if (!window.confirm("Remove this review?")) return;
                        const arr = [...(row.person.performanceReviews ?? [])]; arr.splice(row.idx, 1);
                        void patch(row.person.id, { performanceReviews: arr });
                      }} aria-label="Delete review" className="rounded p-1 text-muted hover:bg-hover hover:text-crimson"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-muted">No reviews recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <ReviewEditor person={editing.person} index={editing.idx} review={editing.review} people={people} onClose={() => setEditing(null)} patch={patch} />
      )}
      {adding && addPerson && (
        <ReviewEditor person={addPerson} index={-1} review={{}} people={people} onClose={() => setAdding(false)} patch={patch} />
      )}
    </div>
  );
}

function AccessTab({ rows, people, canManage, patch }: {
  rows: { person: HrmsPerson; access: Access; idx: number }[];
  people: HrmsPerson[]; canManage: boolean;
  patch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<{ person: HrmsPerson; idx: number; access: Access } | null>(null);
  const [adding, setAdding] = useState(false);
  const addPerson = people[0];

  async function del(row: { person: HrmsPerson; access: Access; idx: number }) {
    if (!window.confirm("Remove this access row?")) return;
    const arr = [...(row.person.toolAccess ?? [])]; arr.splice(row.idx, 1);
    await patch(row.person.id, { toolAccess: arr });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Tool & platform access</SectionLabel>
        {canManage && people.length > 0 && (
          <button className={btn} onClick={() => setAdding(true)}><Plus className="mr-1 inline h-3.5 w-3.5" />Add access</button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-muted">
              <th className="py-1.5 pr-2">Employee</th>
              <th className="py-1.5 pr-2">Platform</th>
              <th className="py-1.5 pr-2">Access type</th>
              <th className="py-1.5 pr-2">Email / username</th>
              <th className="py-1.5 pr-2">Other</th>
              {canManage && <th className="py-1.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="py-2 pr-2 text-ink">{row.person.name}</td>
                <td className="py-2 pr-2 text-muted">{row.access.platform ?? "—"}</td>
                <td className="py-2 pr-2 text-muted">{row.access.accessType ?? "—"}</td>
                <td className="py-2 pr-2 tnum text-muted">{row.access.companyEmail ?? "—"}</td>
                <td className="py-2 pr-2 text-muted" title={row.access.otherAccess ?? ""}>{row.access.otherAccess ?? "—"}</td>
                {canManage && (
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(row)} aria-label="Edit access" className="rounded p-1 text-muted hover:bg-hover hover:text-ink"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => del(row)} aria-label="Delete access" className="rounded p-1 text-muted hover:bg-hover hover:text-crimson"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-muted">No access recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <AccessEditor person={editing.person} index={editing.idx} access={editing.access} people={people} onClose={() => setEditing(null)} patch={patch} />
      )}
      {adding && addPerson && (
        <AccessEditor person={addPerson} index={-1} access={{}} people={people} onClose={() => setAdding(false)} patch={patch} />
      )}
    </div>
  );
}