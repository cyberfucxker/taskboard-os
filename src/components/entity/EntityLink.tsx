"use client";

import Link from "next/link";
import { Building2, FolderKanban, User, CheckSquare, Hash } from "lucide-react";
import { entityUrl } from "@/lib/url";
import { cn } from "@/lib/cn";
import type { EntityRef, EntityLinkProps, EntityType } from "@/types";

const ICON: Record<EntityType, React.ComponentType<{ className?: string }>> = {
  task: CheckSquare,
  client: Building2,
  project: FolderKanban,
  person: User,
  department: Hash,
};

/**
 * EntityLink — renders an entity name as a link to its canonical detail page.
 * Always goes to the same destination regardless of the page it appears on, so
 * the reader can build a predictable mental model of where each link goes.
 *
 * Deliberately plain — no nested interactive elements. A quick-view trigger
 * (PeekDrawer, ?peek=type:id) was tried here and reverted: several call sites
 * render this inside an already-clickable card/link, and a nested <button>
 * inside an <a> is invalid HTML that caused real hydration errors and a
 * request storm in testing. Wire peek entry points at call sites that are
 * verified not to already be inside an anchor/button, not here.
 */
export function EntityLink({ entity, className, showIcon, truncate }: EntityLinkProps) {
  const href = entityUrl(entity.type, entity.id);
  const Icon = ICON[entity.type];

  return (
    <Link
      href={href}
      className={cn(
        "font-medium text-tealhi transition-colors hover:text-ink hover:underline underline-offset-2",
        truncate && "inline-block max-w-[200px] truncate align-bottom",
        className
      )}
      title={entity.name}
    >
      {showIcon && <Icon className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-muted" />}
      <span style={entity.meta?.color ? { color: entity.meta.color } : undefined}>{entity.name}</span>
    </Link>
  );
}

export type { EntityRef };
