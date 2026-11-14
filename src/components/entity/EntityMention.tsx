"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import { EntityLink } from "./EntityLink";
import { filterUrl } from "@/lib/url";
import { cn } from "@/lib/cn";
import type { EntityRef } from "@/types";

/** Map an entity type to its list-filter search-param key. */
export function filterKeyForType(type: EntityRef["type"]): string | null {
  switch (type) {
    case "client": return "clientId";
    case "project": return "projectId";
    case "person": return "assigneeId";
    case "department": return "dept";
    default: return null; // task has no "list by task" filter
  }
}

/**
 * EntityMention — a hyperlink to the entity's detail page PLUS a small funnel
 * icon that filters the current list by that entity. Two distinct, visually
 * separate affordances: clicking the name *navigates*, clicking the funnel
 * *filters the list you're on* by adding `?clientId=<id>` etc. to the URL.
 */
export function EntityMention({ entity }: { entity: EntityRef }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const filterKey = filterKeyForType(entity.type);
  const isActive = filterKey ? searchParams.get(filterKey) === entity.id : false;

  function handleFilter(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!filterKey) return;
    const next = filterUrl(pathname, {
      [filterKey]: isActive ? undefined : entity.id,
    } as Partial<Record<string, string>>);
    router.push(next, { scroll: false });
  }

  if (!filterKey) {
    return <EntityLink entity={entity} />;
  }

  return (
    <span className="group inline-flex items-center gap-1">
      <EntityLink entity={entity} />
      <button
        onClick={handleFilter}
        aria-label={isActive ? `Remove ${entity.name} filter` : `Filter by ${entity.name}`}
        title={isActive ? "Remove filter" : "Filter current list"}
        className={cn(
          "rounded p-0.5 transition-opacity",
          "opacity-0 group-hover:opacity-100",
          isActive ? "opacity-100 text-tealhi" : "text-muted hover:bg-hover"
        )}
      >
        <Filter className="h-3 w-3" />
      </button>
    </span>
  );
}