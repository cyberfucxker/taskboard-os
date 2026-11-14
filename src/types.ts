/**
 * Entity deep-linking types (CORE task #12 extended).
 *
 * Every entity name anywhere in TaskBoard is a clickable link to that entity's
 * canonical detail. Filtering a list by an entity is a separate, composable
 * concern (`?clientId=`, `?projectId=`, `?assigneeId=`). RBAC scoping is
 * enforced in the data-access layer (`src/lib/data/*`), not in page files.
 */

export type EntityType = "task" | "client" | "project" | "person" | "department";

/** A reference to any linkable entity, with just enough to render a link. */
export interface EntityRef {
  type: EntityType;
  id: string;
  /** display label — client name, project name, person name, task code, dept slug */
  name: string;
  code?: string;
  meta?: {
    avatarUrl?: string;
    color?: string; // department color dot, status badge color
    status?: string;
  };
}

export interface EntityLinkProps {
  entity: EntityRef;
  className?: string;
  showIcon?: boolean;
  truncate?: boolean;
}

export interface EntityFilterChipProps {
  entity: EntityRef;
  onRemove?: () => void;
}

export interface PeekTarget {
  type: EntityType;
  id: string;
}

/** Lifecycle filter state for task lists, parsed from URL search params. */
export interface TaskFilters {
  dept?: string;
  assigneeId?: string;
  clientId?: string;
  projectId?: string;
  status?: string;
  priority?: string;
  search?: string;
}