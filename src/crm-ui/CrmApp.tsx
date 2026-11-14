'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon, ShieldAlert } from 'lucide-react';
import { AuthProvider, type CrmSession } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ReferenceDataProvider } from './context/ReferenceDataContext';
import { usePermissions } from './app/usePermissions';
import type { NavChild } from './app/navConfig';
import { cn } from './utils/cn';

import { CrmOverview } from './pages/crm/CrmOverview';
import { StageGroups } from './pages/crm/StageGroups';
import { LeadList } from './pages/crm/LeadList';
import { AddLead } from './pages/crm/AddLead';
import { ImportLeads } from './pages/crm/ImportLeads';
import { LeadDetail } from './pages/crm/LeadDetail';
import { Pipelines } from './pages/crm/Pipelines';
import { PipelineBoard } from './pages/crm/PipelineBoard';
import { FollowUps } from './pages/crm/FollowUps';
import { TaskCalendar } from './pages/crm/TaskCalendar';
import { Forms } from './pages/crm/Forms';
import { FormBuilder } from './pages/crm/FormBuilder';
import { FormView } from './pages/crm/FormView';
import { ReportCenter } from './pages/crm/reports/ReportCenter';
import { LeadActivities } from './pages/crm/LeadActivities';
import { Automations } from './pages/crm/Automations';
import { AutomationBuilder } from './pages/crm/AutomationBuilder';
import { AiSdrAgents } from './pages/crm/AiSdrAgents';
import { AiSdrAgentBuilder } from './pages/crm/AiSdrAgentBuilder';
import { AiSdrAgentDetail } from './pages/crm/AiSdrAgentDetail';
import { CallHistory } from './pages/crm/CallHistory';
import { Conversations } from './pages/crm/Conversations';
import { Integrations } from './pages/crm/Integrations';
import { AddConnection } from './pages/crm/AddConnection';
import { BusinessHoursSettings } from './pages/settings/BusinessHoursSettings';
import { TelephonySettingsPage } from './pages/settings/TelephonySettingsPage';
import { EmailSettingsPage } from './pages/settings/EmailSettingsPage';
import { WhatsAppSettingsPage } from './pages/settings/WhatsAppSettingsPage';
import { WorkspaceAccessPage } from './pages/settings/WorkspaceAccessPage';

/**
 * The the legacy CRM CRM, hosted inside TaskBoard at `/crm/*`. Next serves every `/crm/...` URL to the
 * optional catch-all page, which renders this; react-router takes it from there.
 *
 * Rendered only after mount: BrowserRouter and several screens read `window`/`localStorage`
 * during render, which a server render cannot provide.
 */
export function CrmApp({ initialSession }: { initialSession?: CrmSession | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="px-4 py-5 text-sm text-ink-faint sm:px-6">Loading CRM…</div>;

  return (
    <BrowserRouter>
      <AuthProvider initialSession={initialSession}>
        <ToastProvider>
          <ReferenceDataProvider>
            <CrmShell />
          </ReferenceDataProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function isActive(pathname: string, item: NavChild): boolean {
  if (item.to === '/crm') return pathname === '/crm' || pathname === '/crm/';
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function CrmSubNav() {
  const { pathname } = useLocation();
  const { navItems, settingsItems } = usePermissions();
  const inSettings = pathname.startsWith('/crm/settings');

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface-subtle">
      <nav aria-label="CRM" className="scrollbar-none flex items-center gap-1 overflow-x-auto px-4 sm:px-6">
        {navItems.map((item) => (
          <TabLink key={item.to} to={item.to} active={isActive(pathname, item)}>
            {item.label}
          </TabLink>
        ))}
        {settingsItems.length > 0 && (
          <TabLink to={settingsItems[0].to} active={inSettings}>
            <SettingsIcon size={13} className="mr-1.5" />
            Settings
          </TabLink>
        )}
      </nav>
      {inSettings && settingsItems.length > 0 && (
        <nav aria-label="CRM settings" className="scrollbar-none flex items-center gap-1 overflow-x-auto border-t border-line px-4 py-1.5 sm:px-6">
          {settingsItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                isActive(pathname, item) ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

function TabLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        'relative flex items-center whitespace-nowrap px-2.5 py-2.5 text-sm font-medium transition-colors',
        active ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
      )}
    >
      {children}
      {active && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand-600" />}
    </Link>
  );
}

/** Settings are admin-only. The server enforces it; this just avoids showing a wall of 403s. */
function AdminOnly({ children }: { children: ReactNode }) {
  const { canAdmin } = usePermissions();
  if (canAdmin) return <>{children}</>;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
      <ShieldAlert size={22} className="text-ink-faint" />
      <p className="text-sm font-semibold text-ink">CRM settings are for administrators</p>
      <p className="max-w-sm text-sm text-ink-muted">Ask a CRM administrator if something here needs changing.</p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
      <p className="text-sm font-semibold text-ink">This CRM page does not exist</p>
      <Link to="/crm" className="text-sm font-medium text-brand-600 hover:text-brand-700">
        Back to the CRM overview
      </Link>
    </div>
  );
}

function CrmShell() {
  return (
    <div className="crm-ui flex min-h-full flex-col bg-surface-subtle text-ink">
      <CrmSubNav />
      <div className="flex-1 px-4 py-5 sm:px-6">
        <Routes>
          <Route path="/crm" element={<CrmOverview />} />
          <Route path="/crm/leads" element={<LeadList />} />
          <Route path="/crm/leads/new" element={<AddLead />} />
          <Route path="/crm/leads/import" element={<ImportLeads />} />
          <Route path="/crm/leads/:id" element={<LeadDetail />} />
          <Route path="/crm/pipeline" element={<Pipelines />} />
          <Route path="/crm/pipeline/kanban" element={<PipelineBoard />} />
          <Route path="/crm/follow-ups" element={<FollowUps />} />
          <Route path="/crm/calendar" element={<TaskCalendar />} />
          <Route path="/crm/forms" element={<Forms />} />
          <Route path="/crm/forms/new" element={<FormBuilder />} />
          <Route path="/crm/forms/:id" element={<FormView />} />
          <Route path="/crm/forms/:id/edit" element={<FormBuilder />} />
          <Route path="/crm/report-center" element={<ReportCenter />} />
          <Route path="/crm/activities" element={<LeadActivities />} />
          <Route path="/crm/automation" element={<Automations />} />
          <Route path="/crm/automation/new" element={<AutomationBuilder />} />
          <Route path="/crm/automation/:id/edit" element={<AutomationBuilder />} />
          <Route path="/crm/sdr-agents" element={<AiSdrAgents />} />
          <Route path="/crm/sdr-agents/new" element={<AiSdrAgentBuilder />} />
          <Route path="/crm/sdr-agents/:id" element={<AiSdrAgentDetail />} />
          <Route path="/crm/sdr-agents/:id/edit" element={<AiSdrAgentBuilder />} />
          <Route path="/crm/calls" element={<CallHistory />} />
          <Route path="/crm/conversations" element={<Conversations />} />
          <Route path="/crm/stage-groups" element={<StageGroups />} />
          <Route path="/crm/integrations" element={<Integrations />} />
          <Route path="/crm/integrations/new" element={<AddConnection />} />

          <Route path="/crm/settings" element={<Navigate to="/crm/settings/business-hours" replace />} />
          <Route path="/crm/settings/business-hours" element={<AdminOnly><BusinessHoursSettings /></AdminOnly>} />
          <Route path="/crm/settings/telephony" element={<AdminOnly><TelephonySettingsPage /></AdminOnly>} />
          <Route path="/crm/settings/email" element={<AdminOnly><EmailSettingsPage /></AdminOnly>} />
          <Route path="/crm/settings/whatsapp" element={<AdminOnly><WhatsAppSettingsPage /></AdminOnly>} />
          <Route path="/crm/settings/workspace-access" element={<AdminOnly><WorkspaceAccessPage /></AdminOnly>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}
