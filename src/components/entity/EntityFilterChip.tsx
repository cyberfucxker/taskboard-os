"use client";

import { X } from "lucide-react";
import { EntityLink } from "./EntityLink";
import type { EntityRef } from "@/types";

/**
 * EntityFilterChip — a removable pill showing an active list filter (e.g.
 * "Client: Acme Developers"). Links the name to the entity's detail page and
 * shows a × that clears the filter from the URL.
 */
export function EntityFilterChip({ entity, onRemove }: { entity: EntityRef; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal/15 py-0.5 pl-2.5 pr-1 text-[12px]">
      <span className="label !tracking-normal !text-[11px] normal-case opacity-80">
        {entity.type}
      </span>
      <EntityLink entity={entity} />
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${entity.type} filter`}
          title="Clear filter"
          className="rounded-full p-0.5 text-muted transition hover:bg-hover hover:text-ink"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}