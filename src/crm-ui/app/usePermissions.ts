import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { CRM_NAV, CRM_SETTINGS_NAV, type ModuleKey, type NavChild } from './navConfig';

/**
 * What the signed-in TaskBoard user may open inside the CRM. Reaching `/crm` at all already
 * required the CRM page grant (guardPage), so every CRM tab is open; only the settings
 * area needs `canAdmin`. This is a UI courtesy — the `/api/crm/*` routes enforce the rest.
 */
export function usePermissions() {
  const { session } = useAuth();

  return useMemo(() => {
    const isFullAccess = !!session?.isFullAccess;
    const canAdmin = !!session?.canAdmin;

    const can = (module: ModuleKey) => {
      if (module === 'settings') return canAdmin;
      if (module === 'crm.advanced') return isFullAccess;
      return true;
    };

    const navItems: NavChild[] = CRM_NAV.filter((c) => !c.module || can(c.module));
    const settingsItems: NavChild[] = CRM_SETTINGS_NAV.filter((c) => !c.module || can(c.module));

    return {
      isFullAccess,
      canAdmin,
      canManage: !!session?.canManage,
      can,
      navItems,
      settingsItems,
      landingPath: '/crm',
      roleName: session?.role,
    };
  }, [session]);
}
