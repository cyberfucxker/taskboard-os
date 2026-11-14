import type { DeptWidget } from "./types";
import { devWidgets } from "./widgets/dev";
import { designWidgets } from "./widgets/design";
import { dmWidgets } from "./widgets/dm";
import { genericWidgets } from "./widgets/generic";
import { widgets as workloadWidgets } from "./widgets/workload";

/**
 * Department slug -> widgets. Slugs are Department.slug (seed keys:
 * leadership, sales, design, dev, dm, hr, finance).
 *
 * Lane D ships src/components/dept/widgets/{sales,hr,finance,leadership}/index.ts,
 * each exporting `export const widgets: DeptWidget[]` (a default export of the same
 * array also works). They are loaded with a guarded require so that this file
 * still type-checks and builds before/without them; a missing barrel falls back to
 * the generic widgets.
 */
function fromBarrel(load: () => unknown): DeptWidget[] | null {
  try {
    const mod = load() as { widgets?: DeptWidget[]; default?: DeptWidget[] } | null;
    const list = mod?.widgets ?? mod?.default;
    return Array.isArray(list) && list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

/** Lane I: every department also gets the Workload widget, appended after its own widgets. */
export function registerWidgets(slug: string): DeptWidget[] {
  return [...baseWidgets(slug), ...workloadWidgets];
}

function baseWidgets(slug: string): DeptWidget[] {
  switch (slug) {
    case "dev":
      return devWidgets;
    case "design":
      return designWidgets;
    case "dm":
      return dmWidgets;
    /* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports */
    case "sales":
      return fromBarrel(() => require("./widgets/sales")) ?? genericWidgets;
    case "hr":
      return fromBarrel(() => require("./widgets/hr")) ?? genericWidgets;
    case "finance":
      return fromBarrel(() => require("./widgets/finance")) ?? genericWidgets;
    case "leadership":
      return fromBarrel(() => require("./widgets/leadership")) ?? genericWidgets;
    /* eslint-enable */
    default:
      return genericWidgets;
  }
}
