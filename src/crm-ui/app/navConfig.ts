/**
 * The CRM's own sub-navigation, derived from the the legacy CRM navConfig CRM group. In TaskBoard the
 * CRM is one sidebar entry (`/crm`); these are the tabs rendered inside it by `CrmApp`.
 */

/** CRM's own tabs. `crm` alone means the section itself (Overview). */
export type CrmSubmoduleKey =
  | 'crm.leads' | 'crm.pipeline' | 'crm.followups' | 'crm.forms' | 'crm.reports'
  | 'crm.activities' | 'crm.automation' | 'crm.conversations'
  | 'crm.calls' | 'crm.sdr' | 'crm.stagegroups' | 'crm.integrations' | 'crm.advanced';

/** `settings` covers the admin-only CRM settings pages. */
export type TopModuleKey = 'crm' | 'settings';

export type ModuleKey = TopModuleKey | CrmSubmoduleKey;

export interface NavChild {
  label: string;
  to: string;
  /** The sub-permission this tab needs. Absent means the parent's is enough. */
  module?: ModuleKey;
  /** Extra path prefixes that should light this tab up (e.g. Kanban under Pipeline). */
  match?: string[];
}

export const CRM_NAV: NavChild[] = [
  // Overview carries no sub-permission: it is where the section opens.
  { label: 'Overview', to: '/crm' },
  { label: 'Leads', to: '/crm/leads', module: 'crm.leads' },
  { label: 'Pipeline', to: '/crm/pipeline', module: 'crm.pipeline', match: ['/crm/pipeline/kanban'] },
  { label: 'Manage Stages', to: '/crm/pipeline/manage', module: 'crm.pipeline' },
  { label: 'Follow-ups', to: '/crm/follow-ups', module: 'crm.followups' },
  { label: 'Calendar', to: '/crm/calendar', module: 'crm.followups' },
  { label: 'Activities', to: '/crm/activities', module: 'crm.activities' },
  { label: 'Reports', to: '/crm/report-center', module: 'crm.advanced' },
  { label: 'Automations', to: '/crm/automation', module: 'crm.advanced' },
  { label: 'Forms', to: '/crm/forms', module: 'crm.advanced' },
  { label: 'AI SDR Agents', to: '/crm/sdr-agents', module: 'crm.advanced' },
  { label: 'Calls', to: '/crm/calls', module: 'crm.advanced' },
  { label: 'Conversations', to: '/crm/conversations', module: 'crm.advanced' },
  { label: 'Stage Groups', to: '/crm/stage-groups', module: 'crm.advanced' },
  { label: 'Integrations', to: '/crm/integrations', module: 'crm.advanced' },
];

/** Admin-only CRM settings (the server enforces the same). */
export const CRM_SETTINGS_NAV: NavChild[] = [
  { label: 'Business Hours', to: '/crm/settings/business-hours', module: 'settings' },
  { label: 'Telephony', to: '/crm/settings/telephony', module: 'settings' },
  { label: 'WhatsApp', to: '/crm/settings/whatsapp', module: 'settings' },
  { label: 'Email Delivery', to: '/crm/settings/email', module: 'settings' },
  { label: 'Workspace Access', to: '/crm/settings/workspace-access', module: 'settings' },
];
