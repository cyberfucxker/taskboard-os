"use client";

import { usePathname, useRouter } from "next/navigation";
import { PillTabs } from "@/components/ui";
import { usePageAccess } from "@/components/PageAccessContext";
import { TAB_GROUPS, type TabItem } from "@/lib/spaces";

/**
 * Shared pill-tab strip for a merged nav group (Tasks, Clients, Team, ...).
 * Only tabs whose page the user holds are shown (same grant list as the sidebar
 * and guardPage), and the strip hides itself when fewer than two remain.
 */
export function SectionTabs({ group, items }: { group?: string; items?: readonly TabItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const pages = usePageAccess();
  const list = items ?? (group ? TAB_GROUPS[group] : undefined) ?? [];
  const tabs = list.filter((t) => pages.includes(t.slug));
  if (tabs.length < 2) return null;
  const current = tabs.find((t) => pathname === t.href || pathname.startsWith(t.href + "/"));
  return (
    <div className="shrink-0 border-b border-edge bg-bg px-4 py-2 sm:px-6" data-section-tabs={group}>
      <PillTabs
        tabs={tabs.map((t) => ({ id: t.href, label: t.label }))}
        value={current?.href ?? ""}
        onChange={(href) => router.push(href)}
      />
    </div>
  );
}

/** Finds the tab group the current top-level page belongs to and shows its strip above
 *  the page. Detail routes (/clients/abc) and pages outside every group render untouched. */
export function SectionTabsFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const group = Object.keys(TAB_GROUPS).find((g) => TAB_GROUPS[g].some((t) => t.href === pathname));
  if (!group) return <>{children}</>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionTabs group={group} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
