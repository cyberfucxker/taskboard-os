"use client";

import { createContext, useContext } from "react";
import type { ModuleSlug } from "@/lib/nav";

/**
 * The granted-page list (`Employee.pageAccess` via `effectivePages`) exposed to
 * client components that AppShell does not already hand it to — today only
 * `MobileBottomNav`. `Sidebar` gets the same list as its `pages` prop.
 *
 * The default is `[]` = "nothing granted", never "everything": a missing
 * provider can only hide navigation, it can never surface a link the page
 * guard would reject.
 */
const PageAccessContext = createContext<readonly ModuleSlug[]>([]);

export function PageAccessProvider({
  pages,
  children,
}: {
  pages: readonly ModuleSlug[];
  children: React.ReactNode;
}) {
  return <PageAccessContext.Provider value={pages}>{children}</PageAccessContext.Provider>;
}

export function usePageAccess(): readonly ModuleSlug[] {
  return useContext(PageAccessContext);
}

/**
 * Who is looking (role + OWN department) for the sidebar / bottom bar / tab strips.
 * Default = nobody: the department row stays hidden and Insights stays hidden, so a
 * missing provider can only hide navigation, never expose another department.
 */
export interface NavUserInfo {
  role?: string;
  deptSlug?: string | null;
  deptName?: string | null;
}

const NavUserContext = createContext<NavUserInfo>({});

export function NavUserProvider({ user, children }: { user: NavUserInfo; children: React.ReactNode }) {
  return <NavUserContext.Provider value={user}>{children}</NavUserContext.Provider>;
}

export function useNavUser(): NavUserInfo {
  return useContext(NavUserContext);
}
