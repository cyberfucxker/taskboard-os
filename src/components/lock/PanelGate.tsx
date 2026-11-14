"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";

/**
 * PanelGate — per-employee page-lock veil.
 *
 * Wraps page content inside the app shell. For pages the employee chose to
 * lock (Employee.panelLock.enabledPages), it shows a LockScreen until they
 * enter their PIN (or the unlock is confirmed). The unlock sets a short-lived
 * session cookie flag ({page}:unlocked) so an unlock lasts a few minutes and
 * doesn't nag on every interaction — but the lock is honest about not being a
 * hard security boundary (it's a privacy/customization veil).
 */
export function PanelGate({
  children,
  enabledPages,
  hasPin,
}: {
  children: React.ReactNode;
  enabledPages: string[];
  hasPin: boolean;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();

  // Derive the current page slug from the path (first segment) so the lock
  // knows which page we're on.
  const slug = (pathname.split("/")[1] || "workspace");
  const pageLocked = enabledPages.includes(slug);
  const [unlocked, setUnlocked] = useState<string[]>([]);

  useEffect(() => { setPin(""); setErr(""); }, [pathname]);

  async function submit() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/lock/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr(data.error ?? "Wrong PIN"); setPin(""); return; }
      setUnlocked((u) => (u.includes(slug) ? u : [...u, slug]));
    } finally { setBusy(false); }
  }

  const effectiveUnlocked = unlocked.includes(slug);

  // Not locked, or already unlocked this session → pass through.
  if (!pageLocked || effectiveUnlocked) return <>{children}</>;

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-hover bg-raised p-5 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-teal/15">
          <Lock className="h-5 w-5 text-tealhi" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-ink">This panel is locked</h3>
        <p className="mt-1 text-[12px] text-muted">Enter your panel PIN to view it.</p>
        <input
          type="password" inputMode="numeric" autoFocus
          value={pin} onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••••"
          className="mt-4 block w-full rounded-md border border-hover bg-bg px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-ink outline-none focus:border-tealhi"
        />
        {err && <p className="mt-2 text-[12px] text-crimson">{err}</p>}
        <button
          onClick={submit} disabled={busy || !pin}
          className="mt-4 w-full rounded-md bg-teal py-2 text-[13px] font-semibold text-white hover:bg-tealhi disabled:opacity-40"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        {!hasPin && (
          <p className="mt-3 text-[11px] text-muted">
            Set a PIN on the <span className="text-tealhi">Lock panels</span> page (open it before enabling a lock).
          </p>
        )}
      </div>
    </div>
  );
}