"use client";

import { useEffect, useState } from "react";
import { SectionLabel, Badge } from "@/components/ui";
import { useToast } from "@/components/Toast";

type Device = {
  id: string; hostname: string | null; os: string | null; agentVersion: string | null;
  lastSeenAt: string | null; activityToday: number;
  employee: { name: string; title: string | null; department: string | null } | null;
};

type Activity = {
  id: string; timestamp: string; activeApp: string | null; activeWindow: string | null;
  category: string | null; keystrokes: number; mouseClicks: number; url: string | null;
  hostname: string | null; employeeName: string | null;
};

type Screenshot = {
  id: string; filename: string; createdAt: string; storageUrl: string | null;
  hostname: string | null; employeeName: string | null;
};

export function MonitoringPanel() {
  const toast = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [shots, setShots] = useState<Screenshot[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function loadDevices() {
    try {
      const r = await fetch("/api/monitoring/devices");
      if (!r.ok) throw new Error(`Failed to load devices (${r.status})`);
      setDevices((await r.json()).devices ?? []);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }
  async function loadActivity(deviceId?: string) {
    const q = deviceId ? `?deviceId=${deviceId}&limit=100` : "?limit=100";
    try {
      const r = await fetch(`/api/monitoring/activity${q}`);
      if (!r.ok) throw new Error(`Failed to load activity (${r.status})`);
      setActivities((await r.json()).activities ?? []);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }
  async function loadShots(deviceId?: string) {
    const q = deviceId ? `?deviceId=${deviceId}` : "";
    try {
      const r = await fetch(`/api/monitoring/screenshot${q}`);
      if (!r.ok) throw new Error(`Failed to load screenshots (${r.status})`);
      setShots((await r.json()).screenshots ?? []);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  useEffect(() => {
    loadDevices(); loadActivity(); loadShots();
  }, []);

  async function requestShot(deviceId: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/monitoring/screenshot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      if (!r.ok) throw new Error("Failed to issue screenshot command");
      // Honest wording: a 200 here means the command was queued, not that a
      // screenshot exists yet — the device may be offline and never capture one.
      toast("Screenshot requested — it will appear below once the device captures it (if it's online).", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function pick(deviceId: string) {
    setSelectedDevice(deviceId);
    loadActivity(deviceId); loadShots(deviceId);
  }

  return (
    <div className="grid gap-4">
      {/* Devices */}
      <div>
        <SectionLabel>Registered Devices · {devices.length}</SectionLabel>
        <div className="mt-2 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {devices.length === 0 && <p className="text-[13px] text-muted">No agents installed yet. Distribute the installer to employees.</p>}
          {devices.map((d) => (
            <div key={d.id} className="rounded-xl border border-edge bg-raised/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink">{d.employee?.name ?? d.hostname}</span>
                <Badge text={d.os ?? "?"} kind="info" />
              </div>
              <div className="mt-1 text-[11px] text-muted">{d.employee?.department ?? ""}{d.employee?.title ? " · " + d.employee.title : ""}</div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className={d.activityToday > 0 ? "text-emerald" : "text-amber"}>
                  {d.activityToday > 0 ? "● Live" : "○ Idle"} · {d.activityToday} events today
                </span>
                <span className="text-muted">
                  {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : "never"}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => pick(d.id)} className="rounded bg-hover px-2 py-1 text-[11px] text-ink hover:bg-edge">View</button>
                <button onClick={() => requestShot(d.id)} disabled={busy} className="rounded bg-emerald px-2 py-1 text-[11px] text-white hover:bg-emerald disabled:opacity-50">Screenshot</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity log */}
      <div>
        <SectionLabel>Activity Log{selectedDevice ? ` · filtered` : ""}</SectionLabel>
        <div className="mt-2 max-h-96 overflow-y-auto rounded-xl border border-edge bg-raised/40">
          {activities.length === 0 && <p className="p-3 text-[12px] text-muted">No activity recorded yet.</p>}
          {activities.slice(0, 60).map((a) => (
            <div key={a.id} className="flex items-center justify-between border-b border-edge/60 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-[12px] text-ink">{a.activeWindow || a.activeApp || "—"}</div>
                <div className="text-[11px] text-muted">
                  {a.employeeName ?? ""}{a.hostname ? " @ " + a.hostname : ""} · {a.activeApp ?? ""}{a.url ? " · " + a.url : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted">
                <span>⌨ {a.keystrokes}</span>
                <span>🖱 {a.mouseClicks}</span>
                <span>{a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : ""}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Screenshots */}
      <div>
        <SectionLabel>Captured Screenshots · {shots.length}</SectionLabel>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          {shots.length === 0 && <p className="text-[12px] text-muted">No screenshots captured. Screenshots are only taken on explicit leadership command and the employee is notified.</p>}
          {shots.map((s) => (
            <div key={s.id} className="rounded-xl border border-edge bg-raised/60 p-3">
              <div className="text-[12px] text-ink">{s.employeeName ?? s.hostname}</div>
              <div className="text-[11px] text-muted">{s.filename} · {s.createdAt ? new Date(s.createdAt).toLocaleString() : ""}</div>
              {s.storageUrl && (
                <a href={s.storageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-[var(--accent-blue)]">View screenshot</a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}