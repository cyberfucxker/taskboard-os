import type { MetadataRoute } from "next";

/** PWA web manifest — enables "Install app" for TaskBoard OS. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable identity so an installed app is never treated as a second app,
    // and scope covers the whole app so every route opens in the installed window.
    id: "/",
    scope: "/",
    name: "TaskBoard OS",
    short_name: "TaskBoard",
    description: "Acme Inc — tasks, standup, CRM and delivery in one place.",
    start_url: "/today",
    // Desktop Chrome/Edge on Windows uses window-controls-overlay; Android and
    // the installed mobile app fall back to standalone.
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    // Telecallers and the sales desk rotate phones/tablets; do not lock rotation.
    orientation: "any",
    background_color: "#0C0E13",
    theme_color: "#0C0E13",
    categories: ["business", "productivity"],
    icons: [
      // "any" — the full-bleed logo, transparent rounded corners.
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      // "maskable" — same logo padded onto a full-bleed background so Android's
      // circle/squircle/teardrop masks never clip it. These must be separate files.
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-1024.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Today",
        short_name: "Today",
        description: "View your today's tasks and agenda",
        url: "/today",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "New Task",
        short_name: "New Task",
        description: "Create a new task quickly",
        url: "/tasks?new=1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "My Work",
        short_name: "My Work",
        description: "View tasks assigned to me",
        url: "/my-work",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Calendar",
        short_name: "Calendar",
        description: "Open the calendar view",
        url: "/calendar",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}