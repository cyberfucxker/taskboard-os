import { useAuth } from '../context/AuthContext';

/**
 * Element-level RBAC derived from the CRM session.
 *
 * Tiers:
 *   view   → canView only (crm.view cap, any authenticated user)
 *   manage → canManage  (crm.manage cap — sales team and above)
 *   admin  → canAdmin   (full-access role: SUPER_ADMIN or DEPARTMENT_HEAD)
 */
export function usePermissions() {
  const { session } = useAuth();

  const canView = !!session;
  const canManage = !!session?.canManage;
  const canAdmin = !!session?.canAdmin;
  const canSeeRevenue = !!session?.canSeeRevenue;

  return {
    // Lead CRUD
    canCreateLead: canManage,
    canEditLead: canManage,
    canDeleteLead: canAdmin,

    // Bulk operations
    canBulkEdit: canManage,
    canBulkDelete: canAdmin,

    // Lead assignment
    canAssignLead: canManage,

    // Stage movement — sales team can do this (manage tier)
    canMoveStage: canManage,

    // Notes and activity
    canAddNote: canManage,
    canLogActivity: canManage,
    canManageFollowUp: canManage,

    // Star (bookmark)
    canToggleStar: canView,

    // Pipeline configuration
    canManagePipelines: canAdmin,
    // Stage CRUD is now manage-tier (server enforces this in access.ts)
    canManageStages: canManage,

    // Advanced configuration
    canManageAutomations: canAdmin,
    canManageForms: canAdmin,

    // Reports and revenue
    canViewReports: canManage,
    canViewRevenue: canSeeRevenue,

    // Admin-only settings
    canAccessAdvanced: canAdmin,

    // Import / export
    canImport: canManage,
    canExport: canManage,
  };
}
