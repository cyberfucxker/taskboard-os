"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { FAVS_EVENT, readFavs, toggleFav } from "@/lib/useFavorites";

/**
 * Star toggle for a record or a saved view. Adds/removes {label, path} in
 * `taskboard3_favs`, which the sidebar Favorites section renders. A real <button>
 * with aria-pressed, so Tab + Enter/Space work.
 */
export function StarButton({
  label,
  path,
  className,
}: {
  label: string;
  path: string;
  className?: string;
}) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(readFavs().some((f) => f.path === path));
    sync();
    window.addEventListener(FAVS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FAVS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [path]);

  return (
    <button
      type="button"
      onClick={() => setOn(toggleFav({ label, path }))}
      aria-pressed={on}
      aria-label={on ? "Remove from favorites" : "Add to favorites"}
      title={on ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-teal",
        on && "text-amber",
        className
      )}
    >
      <Star className={cn("h-4 w-4", on && "fill-current")} aria-hidden />
    </button>
  );
}
