"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

/**
 * PWA + Web Push bootstrapper.
 *  • Registers the service worker (enables "Install app" + offline shell).
 *  • Captures the browser's beforeinstallprompt event to show a persistent
 *    "Install TaskBoard" banner — reappears if the PWA was previously uninstalled.
 *  • If the user has already granted notifications, silently re-subscribes.
 *  • Otherwise shows a compact one-time "Enable notifications" pill; clicking it
 *    requests permission and registers the push subscription for desktop
 *    notifications that fire even when the tab is closed.
 */
export default function PushSetup() {
  const toast = useToast();
  const [supported, setSupported] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // PWA install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installable, setInstallable] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);

  // SW update state
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    // Skip SW in development to avoid stale-cache issues during rebuilds
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) r.unregister();
      });
      return;
    }
    setSupported(true);
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Detect if there is already a waiting SW on first load
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setUpdateReady(true);
      }

      // Watch for a new SW installing
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          // When the new SW finishes installing and is waiting to activate
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setUpdateReady(true);
          }
        });
      });
    }).catch(() => {});

    // Capture the browser's install prompt.
    // If the PWA was uninstalled, Chrome re-fires this event on next visit —
    // so the banner reappears automatically without any server-side state.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // If already running as installed PWA, don't show install banner
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) setInstallDismissed(true);

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  // Decide once whether a notification prompt is worth showing.
  useEffect(() => {
    if (!supported) return;
    const state = Notification.permission;
    if (state === "granted") {
      subscribe();
    } else if (state === "default") {
      setCanPrompt(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  async function subscribe(): Promise<boolean> {
    try {
      const reg = await navigator.serviceWorker.ready;
      const res = await fetch("/api/push/vapid-key");
      const { key } = await res.json();
      if (!key) {
        toast("Notifications aren't set up on the server yet — ask an admin to configure push.", "error");
        return false;
      }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
        });
      }
      if (sub) {
        const subRes = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: {
              p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!))),
              auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!))),
            },
            userAgent: navigator.userAgent,
          }),
        });
        if (!subRes.ok) {
          toast("Couldn't save your notification subscription — try again.", "error");
          return false;
        }
        return true;
      }
      return false;
    } catch {
      // Silent on the initial "already granted" auto-resubscribe (every page
      // load) — but enable() below still tells the user explicitly when this
      // path is the direct result of clicking "Enable".
      return false;
    }
  }

  async function enable() {
    setDismissed(true);
    if (!("Notification" in window)) {
      toast("This browser doesn't support desktop notifications.", "error");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "denied") {
      toast("Notifications blocked — enable them in your browser's site settings to turn this on later.", "error");
      return;
    }
    if (permission !== "granted") return; // user dismissed the browser prompt
    const ok = await subscribe();
    if (ok) toast("Desktop notifications enabled.", "success");
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    // Tell the waiting SW to skip waiting and activate immediately
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    // Reload once the new SW has taken control
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
    setUpdateReady(false);
  }

  async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // Regardless of accepted/dismissed, don't show again this session
    setDeferredPrompt(null);
    setInstallable(false);
    setInstallDismissed(true);
  }

  const showInstall = installable && !installDismissed;
  const showNotifications = canPrompt && !dismissed;

  if (!showInstall && !showNotifications && !updateReady) return null;

  return (
    <div className="fixed bottom-20 right-4 lg:bottom-4 lg:right-4 z-50 flex flex-col items-end gap-2">
      {updateReady && (
        <div className="flex items-center gap-3 rounded-lg border border-amber/40 bg-raised px-3 py-2.5 shadow-popover anim-up">
          <div className="text-[12px] text-ink">
            <div className="font-semibold text-ink">Update available</div>
            <div className="text-muted">A new version of TaskBoard is ready.</div>
          </div>
          <button
            onClick={applyUpdate}
            className="rounded-md bg-amber px-3 py-1.5 text-[12px] font-semibold text-bg transition hover:opacity-90"
          >
            Reload
          </button>
          <button onClick={() => setUpdateReady(false)} className="text-muted hover:text-ink" aria-label="Dismiss">
            x
          </button>
        </div>
      )}
      {showInstall && (
        <div className="flex items-center gap-3 rounded-lg border border-teal/40 bg-raised px-3 py-2.5 shadow-popover anim-up">
          <div className="text-[12px] text-ink">
            <div className="font-semibold text-ink">📱 Install TaskBoard</div>
            <div className="text-muted">Add to your home screen for quick access.</div>
          </div>
          <button
            onClick={installApp}
            className="rounded-md bg-teal px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-tealhi"
          >
            Install
          </button>
          <button onClick={() => setInstallDismissed(true)} className="text-muted hover:text-ink" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {showNotifications && (
        <div className="flex items-center gap-3 rounded-lg border border-teal/40 bg-raised px-3 py-2.5 shadow-popover anim-up">
          <div className="text-[12px] text-ink">
            <div className="font-semibold text-ink">Get desktop notifications</div>
            <div className="text-muted">Task updates even when this tab is closed.</div>
          </div>
          <button
            onClick={enable}
            className="rounded-md bg-teal px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-tealhi"
          >
            Enable
          </button>
          <button onClick={() => setDismissed(true)} className="text-muted hover:text-ink" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/** Encode a base64url VAPID key into the Uint8Array the PushManager expects. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
