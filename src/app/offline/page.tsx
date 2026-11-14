"use client";

import { useEffect, useState } from "react";

/**
 * Offline shell — precached by the service worker (see public/sw.js) so a dropped
 * connection shows this instead of the browser's dinosaur. Deliberately outside the
 * (app) group: it must render with no session, because there is no network to
 * resolve one with.
 */
export default function OfflinePage() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-[var(--bg-canvas)] text-[var(--fg-default)]">
      <div className="w-16 h-16 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] flex items-center justify-center">
        <span className="text-2xl font-bold text-[var(--tealhi)]">T</span>
      </div>

      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold mb-2">You are offline</h1>
        <p className="text-[var(--fg-muted)]">
          TaskBoard could not reach the server. Anything you have already opened still works, and
          anything you save will be waiting when the connection is back.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] font-medium"
        >
          Try again
        </button>
        <a href="/today" className="px-4 py-2 rounded-lg border border-[var(--border-default)] text-[var(--fg-muted)]">
          Go to Today
        </a>
      </div>

      {offline ? (
        <p className="text-xs text-[var(--faint)]">Still offline — we will keep trying.</p>
      ) : (
        <p className="text-xs text-[var(--faint)]">Connection is back.</p>
      )}
    </main>
  );
}