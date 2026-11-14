"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);

  // Clear transition spinner whenever route or query change settles
  useEffect(() => {
    setIsNavigating(false);
  }, [pathname, searchParams]);

  // Intercept anchor and navigation clicks
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("a, button[data-nav=true]");
      if (!target) return;

      const href = target.getAttribute("href");
      if (href && (href.startsWith("/") || href.startsWith(window.location.origin))) {
        // Only trigger for different paths
        const currentUrl = window.location.pathname + window.location.search;
        if (href !== currentUrl && !href.startsWith("#") && !e.ctrlKey && !e.metaKey) {
          setIsNavigating(true);
        }
      }
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  if (!isNavigating) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/40 transition-all animate-in fade-in duration-150">
      <div className="flex items-center gap-3 rounded-[10px] border border-edge bg-raised px-5 py-3 shadow-popover">
        <Loader2 className="h-5 w-5 animate-spin text-teal" />
        <span className="text-[13px] font-medium text-ink">Loading page...</span>
      </div>
      {/* Top progress line */}
      <div className="fixed top-0 left-0 right-0 h-[2px] bg-teal animate-pulse" />
    </div>
  );
}
