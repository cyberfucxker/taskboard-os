"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Pencil, X, Save } from "lucide-react";

/**
 * Self-service profile editor — lets a logged-in employee update their OWN
 * directory + HR-profile fields (dob, personal phone/email, emergency contact,
 * work email, title). Role/department/status are deliberately NOT editable
 * here (those are HR's job in HRMS). Calls the same RBAC-gated
 * PATCH /api/employees/[id].
 */

const inputCls =
  "w-full rounded-md border border-edge bg-transparent px-2.5 py-1.5 text-[13px] text-ink focus:border-teal focus:outline-none";
const labelCls = "mb-1 block text-[11px] font-medium text-muted";

interface SelfEditFields {
  name: string;
  title: string | null;
  dob: string | null;
  personalPhone: string | null;
  personalEmail: string | null;
  workEmail: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

interface SelfEditForm {
  name: string;
  title: string;
  dob: string;
  personalPhone: string;
  personalEmail: string;
  workEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export function EmployeeSelfEdit({ data }: { data: SelfEditFields }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<SelfEditForm>({
    name: data.name,
    title: data.title ?? "",
    dob: data.dob ? data.dob.slice(0, 10) : "",
    personalPhone: data.personalPhone ?? "",
    personalEmail: data.personalEmail ?? "",
    workEmail: data.workEmail ?? "",
    emergencyContactName: data.emergencyContactName ?? "",
    emergencyContactPhone: data.emergencyContactPhone ?? "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.id) return;
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/employees/${session.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name,
        title: f.title === "" ? null : f.title,
        dob: f.dob ? new Date(f.dob).toISOString() : null,
        personalPhone: f.personalPhone === "" ? null : f.personalPhone,
        personalEmail: f.personalEmail === "" ? null : f.personalEmail,
        workEmail: f.workEmail === "" ? null : f.workEmail,
        emergencyContactName: f.emergencyContactName === "" ? null : f.emergencyContactName,
        emergencyContactPhone: f.emergencyContactPhone === "" ? null : f.emergencyContactPhone,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!body.ok) {
      setErr(body.error ?? "Save failed");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
 className="flex items-center gap-1.5 rounded-md border border-teal h-8 px-3 text-[13px] font-medium text-teal transition hover:bg-teal hover:text-white"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit my details
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-[10px] border border-edge bg-raised p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-ink">Edit my details</h3>
          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className={labelCls}>Full name</label>
            <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Job title</label>
            <input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Senior Executive" />
          </div>
          <div>
            <label className={labelCls}>Date of birth</label>
            <input className={inputCls} type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Personal phone</label>
            <input className={inputCls} value={f.personalPhone} onChange={(e) => setF({ ...f, personalPhone: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Personal email</label>
            <input className={inputCls} value={f.personalEmail} onChange={(e) => setF({ ...f, personalEmail: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Work email</label>
            <input className={inputCls} value={f.workEmail} onChange={(e) => setF({ ...f, workEmail: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Emergency contact name</label>
            <input className={inputCls} value={f.emergencyContactName} onChange={(e) => setF({ ...f, emergencyContactName: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Emergency contact phone</label>
            <input className={inputCls} value={f.emergencyContactPhone} onChange={(e) => setF({ ...f, emergencyContactPhone: e.target.value })} />
          </div>
        </div>
        {err && <p className="mt-3 text-[12px] text-crimson">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-edge px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink">
            Cancel
          </button>
 <button type="submit" disabled={saving} className="flex items-center gap-1.5 rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white hover:bg-tealhi">
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
