"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, setNavigating] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // When URL or search params change, transition is complete
    setNavigating(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore external links, mailto, target="_blank", downloads (a file
      // response never changes the pathname, which used to leave this
      // full-screen overlay stuck forever — e.g. the export/download links
      // in TaskReports.tsx and TeamTimesheet.tsx), or anchors on the exact
      // same page.
      if (
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        target.hasAttribute("download") ||
        target.getAttribute("target") === "_blank" ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // If clicking the current path, no need to show heavy overlay
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (href === currentUrl) return;

      startTransition(() => {
        setNavigating(true);
      });
      // Safety net: if something we didn't anticipate never changes the
      // pathname/search params (the only thing that clears this normally),
      // don't leave the app covered by a blocking overlay indefinitely.
      window.setTimeout(() => setNavigating(false), 8000);
    };

    document.addEventListener("click", handleAnchorClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleAnchorClick, { capture: true });
    };
  }, []);

  // Also listen to custom global navigation event if dispatched
  useEffect(() => {
    const onStartNav = () => setNavigating(true);
    const onEndNav = () => setNavigating(false);

    window.addEventListener("taskboard:nav-start", onStartNav);
    window.addEventListener("taskboard:nav-end", onEndNav);

    return () => {
      window.removeEventListener("taskboard:nav-start", onStartNav);
      window.removeEventListener("taskboard:nav-end", onEndNav);
    };
  }, []);

  if (!navigating) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex cursor-wait items-center justify-center bg-black/40 transition-all duration-150 select-none pointer-events-auto"
      style={{ animation: "fadeIn 0.1s ease-out forwards" }}
    >
      <div className="flex items-center gap-3 rounded-[10px] border border-edge bg-raised px-5 py-3.5 shadow-popover">
        <Loader2 className="h-5 w-5 animate-spin text-teal" />
        <div className="flex flex-col">
          <span className="text-[13px] font-medium text-ink">Loading page...</span>
          <span className="font-mono text-[10px] text-muted">Please wait</span>
        </div>
      </div>
    </div>
  );
}
