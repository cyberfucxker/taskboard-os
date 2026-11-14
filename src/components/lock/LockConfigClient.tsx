"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SectionLabel, Card } from "@/components/ui";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";

const ALL_SLUGS = [
  "overview", "tasks", "standup", "crm",
  "projects", "clients", "directory", "hrms", "finance", "lms",
  "team", "access", "control", "ai",
];

export function LockConfigClient({ enabledPages, hasPin }: {
  enabledPages: string[];
  hasPin: boolean;
}) {
  const router = useRouter();
  const [lock, setLock] = useState<string[]>(enabledPages);
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true); setMsg("");
    try {
      const res = await fetch("/api/lock/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledPages: lock, pin: pin || null }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Save failed"); return; }
      setMsg("Saved successfully.");
      router.refresh();
    } finally { setSaving(false); }
  }

  function toggle(slug: string) {
    setLock((l) => (l.includes(slug) ? l.filter((x) => x !== slug) : [...l, slug]));
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <SectionLabel>Lock panels</SectionLabel>
      <h1 className="mt-1 text-xl font-semibold text-[var(--fg-default)]">Privacy veil for your TaskBoard</h1>
      <p className="mt-1 text-[13px] text-[var(--fg-muted)]">
        Pick the panels you want to password-lock on <em>your</em> TaskBoard. Works for you
        only — your colleagues&apos; views are unaffected.
      </p>

      <Card className="!bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-5 mt-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {ALL_SLUGS.map((slug) => {
            const isLocked = lock.includes(slug);
            return (
              <label
                key={slug}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] transition-all ${
                  isLocked
                    ? "border-teal/40 bg-teal/10 text-[var(--fg-default)] font-medium"
                    : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--fg-muted)] hover:border-[var(--border-default)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isLocked}
                  onChange={() => toggle(slug)}
                  className="accent-blue-500 rounded"
                />
                {isLocked ? (
                  <Lock className="h-4 w-4 text-tealhi shrink-0" />
                ) : (
                  <LockOpen className="h-4 w-4 text-[var(--fg-muted)] shrink-0" />
                )}
                <span className="capitalize">{slug}</span>
              </label>
            );
          })}
        </div>

        <div className="mt-6 border-t border-[var(--border-subtle)] pt-4">
          <label className="text-[13px] font-semibold text-[var(--fg-default)] flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-tealhi" />
            Panel PIN {hasPin ? "(Configured)" : ""}
          </label>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={hasPin ? "Leave blank to keep current PIN" : "Enter 4–8 digits PIN"}
            className="mt-2 block w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2.5 text-[14px] text-[var(--fg-default)] outline-none focus:border-teal transition-all"
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-teal px-4 py-2 text-[13px] font-semibold text-white hover:bg-tealhi disabled:opacity-40 transition-all cursor-pointer shadow-sm"
            >
              {saving ? "Saving…" : "Save lock settings"}
            </button>
            {msg && <span className="text-[12px] text-emerald font-medium">{msg}</span>}
          </div>
        </div>
        <p className="mt-4 text-[11px] text-[var(--fg-muted)] leading-relaxed">
          This is a privacy veil, not a security boundary. It hides each locked panel
          behind your PIN until you unlock it this session.
        </p>
      </Card>
    </div>
  );
}
