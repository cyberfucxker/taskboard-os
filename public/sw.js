/* TaskBoard OS — service worker v3
 *
 * v2 (kept): Documents (HTML pages) are network-first so they always get the
 * current build's chunk hashes. Only immutable static assets (/_next/static/*)
 * are cached. The shell cache from v1 caused stale chunk 404s after rebuilds.
 *
 * v3 adds: an offline shell, a real update handshake, and proper PWA icons.
 *  1. The offline shell (/offline + icons + manifest) is precached on install, so
 *     a dropped connection still shows TaskBoard instead of the browser's error page.
 *  2. install no longer calls skipWaiting(). PushSetup.tsx already renders an
 *     "Update available — Reload" prompt that posts {type:"SKIP_WAITING"} to a
 *     waiting worker; v2 activated instantly on install, so that worker never
 *     reached the "waiting" state and the Reload button did nothing. v3 waits,
 *     and the message below completes the handshake the UI already expects.
 *  3. On activate, clients are told ({type:"TASKBOARD_SW_ACTIVATED"}) so the app can
 *     refresh itself if it wants to.
 *
 * Web push is byte-for-byte unchanged from v2.
 */

const CACHE = "taskboard-v3";

// Precache only what an offline page needs. Never an authenticated response.
const OFFLINE_SHELL = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/maskable-192.png",
];

self.addEventListener("install", (event) => {
  // Wait for the user (PushSetup's "Update available — Reload") instead of
  // activating under them — see the v3 note above.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_SHELL).catch(() => undefined))
  );
});

// PushSetup.applyUpdate() posts this to the waiting worker.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  // Delete ALL old caches (v1, v2, etc.) so stale shells are purged.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => {
        for (const client of clients) client.postMessage({ type: "TASKBOARD_SW_ACTIVATED" });
      })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // API calls: network only (never cache)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Immutable static assets (content-hashed by Next.js): cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // Everything else (HTML pages): NETWORK ONLY, offline shell as fallback.
  // Logged-in pages carry leads, salaries and finance data — never keep copies of them in the
  // browser cache (shared office PCs), so only the precached /offline shell is ever served offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
  }
});

// ---- Web Push -------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = { title: "TaskBoard OS", body: "", url: "/overview", tag: "taskboard" };
  try {
    const parsed = event.data ? event.data.json() : {};
    data = { ...data, ...parsed };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.tag,
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/overview";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
