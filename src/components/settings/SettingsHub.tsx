"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import {
  Settings,
  Share2,
  MessageSquare,
  Cpu,
  Clock,
  UserCheck,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Eye,
  EyeOff,
  Sparkles,
  Send,
  CheckCircle2,
  AlertTriangle,
  Layers,
  KeyRound,
  Plug
} from "lucide-react";
import { Card, SectionLabel, Badge } from "@/components/ui";
import { DepartmentPipelinesHub } from "@/components/pipelines/DepartmentPipelinesHub";
import IntegrationsSettingsTab from "@/components/settings/IntegrationsSettingsTab";
import IntegrationHubTab from "@/components/settings/IntegrationHubTab";
import ProviderCredentialsTab from "@/components/settings/ProviderCredentialsTab";
import RecurringTasksTab from "@/components/settings/RecurringTasksTab";

export function SettingsHub({
  currentRole,
  agentSecret,
  whatsappVerifyToken,
  metaVerifyToken,
  currentUserId,
  currentUserName,
  canManageOthers = false,
}: {
  currentRole: string;
  agentSecret: string;
  whatsappVerifyToken: string;
  metaVerifyToken: string;
  currentUserId?: string;
  currentUserName?: string;
  canManageOthers?: boolean;
}) {
  const [tab, setTab] = useState<"connect" | "credentials" | "pipelines" | "integrations" | "recurring" | "meta" | "whatsapp" | "mcp" | "shift" | "personas">("connect");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Real Meta setup state, fetched from the server. The old tab rendered a
  // hardcoded "Live & Receiving" pill that was green before a single
  // credential had been entered, so nobody could tell a working webhook from
  // an unconfigured one.
  const [metaStatus, setMetaStatus] = useState<{
    status: string;
    configured: boolean;
    steps: { key: string; label: string; done: boolean; detail: string }[];
    callbackUrl: string;
  } | null>(null);
  const [metaStatusLoading, setMetaStatusLoading] = useState(false);

  // WhatsApp Business Cloud API config state
  const [waConfig, setWaConfig] = useState({ phoneNumberId: "", accessToken: "", businessAccountId: "" });
  const [waConfigured, setWaConfigured] = useState(false);
  const [waSaving, setWaSaving] = useState(false);
  const [waSaveResult, setWaSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [waTestPhone, setWaTestPhone] = useState("");
  const [waTesting, setWaTesting] = useState(false);
  const [waTestResult, setWaTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const runMetaTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/webhooks/meta-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry: [
            {
              changes: [
                {
                  field: "leadgen",
                  value: {
                    leadgen_id: `test_${Date.now()}`,
                    name: "Sample Test Lead",
                    company: "Acme Enterprises",
                    phone: "+919876543210",
                    email: "test@acme.com",
                  }
                }
              ]
            }
          ]
        })
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, msg: "✓ Success! Test lead ingested into CRM and follow-up task created." });
      } else {
        setTestResult({ ok: false, msg: `Error: ${data.error}` });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: `Failed to dispatch test: ${(err as Error).message}` });
    } finally {
      setTesting(false);
    }
  };

  const runWhatsAppTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry: [
            {
              changes: [
                {
                  value: {
                    contacts: [{ profile: { name: "WhatsApp Test Client" } }],
                    messages: [
                      {
                        from: "919999988888",
                        text: { body: "Hi, I need web development services for our company." }
                      }
                    ]
                  }
                }
              ]
            }
          ]
        })
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, msg: "✓ Success! WhatsApp message parsed and CRM lead updated." });
      } else {
        setTestResult({ ok: false, msg: `Error: ${data.error}` });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: `Failed: ${(err as Error).message}` });
    } finally {
      setTesting(false);
    }
  };

  // Load WhatsApp config when tab is opened. The server never returns plaintext
  // credentials (by design — see /api/integrations/config), only whether each
  // field is set and a masked preview, so we show that instead of pretending
  // to prefill real secrets.
  const [waMasked, setWaMasked] = useState<Record<string, string>>({});
  useEffect(() => {
    if (tab !== "whatsapp") return;
    fetch("/api/integrations/config")
      .then((r) => r.json())
      .then((data) => {
        const waEntry = data?.data?.find((i: any) => i.provider === "WHATSAPP_CLOUD");
        if (waEntry?.config) {
          setWaConfigured(Boolean(waEntry.config.hasCredentials));
          setWaMasked(waEntry.config.credentialsMasked || {});
        }
      })
      .catch(() => {});
  }, [tab]);

  const saveWaConfig = async () => {
    setWaSaving(true);
    setWaSaveResult(null);
    try {
      const res = await fetch("/api/integrations/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "WHATSAPP_CLOUD",
          isEnabled: true,
          credentials: {
            phoneNumberId: waConfig.phoneNumberId,
            permanentAccessToken: waConfig.accessToken,
            businessAccountId: waConfig.businessAccountId,
          },
        }),
      });
      if (res.ok) {
        setWaConfigured(!!waConfig.accessToken);
        setWaSaveResult({ ok: true, msg: "Saved successfully." });
      } else {
        const d = await res.json();
        setWaSaveResult({ ok: false, msg: d.error || "Failed to save." });
      }
    } catch (err) {
      setWaSaveResult({ ok: false, msg: (err as Error).message });
    } finally {
      setWaSaving(false);
    }
  };

  const sendWaTest = async () => {
    setWaTesting(true);
    setWaTestResult(null);
    try {
      const res = await fetch("/api/integrations/test-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: waTestPhone,
          token: waConfig.accessToken,
          phoneNumberId: waConfig.phoneNumberId,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setWaTestResult({ ok: true, msg: "Test message sent successfully." });
      } else {
        setWaTestResult({ ok: false, msg: data.error || "Failed to send test." });
      }
    } catch (err) {
      setWaTestResult({ ok: false, msg: (err as Error).message });
    } finally {
      setWaTesting(false);
    }
  };


  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <SectionLabel>System Configuration</SectionLabel>
        <h1 className="mt-1 text-2xl font-bold text-ink">Settings & Integrations Hub</h1>
        <p className="text-[13px] text-muted">
          Configure webhooks, AI agent protocols, shift policies, and test role personas.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-hover bg-bg p-1.5">
        <button
          onClick={() => { setTab("connect"); setTestResult(null); }}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
            tab === "connect" ? "bg-teal text-white" : "text-muted hover:text-ink"
          }`}
        >
          <Plug className="h-4 w-4" /> Connect Your Tools
        </button>
        {canManageOthers && (
          <button
            onClick={() => { setTab("credentials"); setTestResult(null); }}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
              tab === "credentials" ? "bg-teal text-white" : "text-muted hover:text-ink"
            }`}
          >
            <KeyRound className="h-4 w-4" /> Provider Credentials
          </button>
        )}
        <button
          onClick={() => { setTab("pipelines"); setTestResult(null); }}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
            tab === "pipelines" ? "bg-teal text-white" : "text-muted hover:text-ink"
          }`}
        >
          <Layers className="h-4 w-4" /> Department SOP Pipelines
        </button>
        <button
          onClick={() => { setTab("integrations"); setTestResult(null); }}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
            tab === "integrations" ? "bg-teal text-white" : "text-muted hover:text-ink"
          }`}
        >
          <UserCheck className="h-4 w-4" /> Integrations & AI Agents
        </button>
        {(currentRole === "SUPER_ADMIN" || currentRole === "DEPARTMENT_HEAD") && (
          <button
            onClick={() => { setTab("recurring"); setTestResult(null); }}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
              tab === "recurring" ? "bg-teal text-white" : "text-muted hover:text-ink"
            }`}
          >
            <Clock className="h-4 w-4" /> Recurring Tasks
          </button>
        )}
        {(currentRole === "SUPER_ADMIN" || currentRole === "DEPARTMENT_HEAD") && (
          <button
            onClick={() => {
              setTab("meta");
              setTestResult(null);
              setMetaStatusLoading(true);
              fetch("/api/integrations/meta/status")
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => setMetaStatus(d ?? null))
                .catch(() => setMetaStatus(null))
                .finally(() => setMetaStatusLoading(false));
            }}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
              tab === "meta" ? "bg-teal text-white" : "text-muted hover:text-ink"
            }`}
          >
            <Share2 className="h-4 w-4" /> Meta Lead Ads
          </button>
        )}
        <button
          onClick={() => { setTab("whatsapp"); setTestResult(null); }}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
            tab === "whatsapp" ? "bg-emerald text-white" : "text-muted hover:text-ink"
          }`}
        >
          <MessageSquare className="h-4 w-4" /> WhatsApp Business
        </button>
        {(currentRole === "SUPER_ADMIN" || currentRole === "DEPARTMENT_HEAD") && (
          <button
            onClick={() => { setTab("mcp"); setTestResult(null); }}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
              tab === "mcp" ? "bg-tealhi text-white" : "text-muted hover:text-ink"
            }`}
          >
            <Cpu className="h-4 w-4" /> MCP Server & AI
          </button>
        )}
        <button
          onClick={() => { setTab("shift"); setTestResult(null); }}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
            tab === "shift" ? "bg-amber text-bg" : "text-muted hover:text-ink"
          }`}
        >
          <Clock className="h-4 w-4" /> Shift & Attendance
        </button>
      </div>

      {/* TAB: CONNECT YOUR TOOLS — self-service, every employee. The OAuth
          callback returns here with ?connected=1|0 so the outcome is explicit. */}
      {tab === "connect" && (
        <Card className="p-6 border border-hover bg-raised">
          <IntegrationHubTab canManage={canManageOthers} />
        </Card>
      )}

      {/* TAB: PROVIDER CREDENTIALS — organisation-wide secrets. Admins only;
          the API returns set/unset metadata, never the stored value. */}
      {tab === "credentials" && canManageOthers && (
        <Card className="p-6 border border-hover bg-raised">
          <ProviderCredentialsTab />
        </Card>
      )}

      {/* TAB 0: DEPARTMENT PIPELINES */}
      {tab === "pipelines" && (
        <Card className="p-6 border border-hover bg-raised">
          <DepartmentPipelinesHub />
        </Card>
      )}

      {/* TAB: PER-EMPLOYEE INTEGRATIONS & AI AGENTS */}
      {tab === "integrations" && (
        <Card className="p-6 border border-hover bg-raised">
          <IntegrationsSettingsTab
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserRole={currentRole}
            canManageOthers={canManageOthers}
          />
        </Card>
      )}

      {/* TAB: RECURRING TASK TEMPLATES — these auto-generate and auto-assign
          real work org-wide, so it's leadership-configuration, not a
          personal surface. The API enforces the same boundary independently. */}
      {tab === "recurring" && (currentRole === "SUPER_ADMIN" || currentRole === "DEPARTMENT_HEAD") && (
        <Card className="p-6 border border-hover bg-raised">
          <RecurringTasksTab />
        </Card>
      )}

      {/* TAB 1: META LEADS — the webhook URL/verify token are real secrets;
          this whole tab is admin-configuration content with no self-service
          value to a regular employee, so it is leadership-only end to end. */}
      {tab === "meta" && !(currentRole === "SUPER_ADMIN" || currentRole === "DEPARTMENT_HEAD") && (
        <Card className="p-6 border border-hover bg-raised">
          <p className="text-[13px] text-muted">This integration is managed by leadership.</p>
        </Card>
      )}
      {tab === "meta" && (currentRole === "SUPER_ADMIN" || currentRole === "DEPARTMENT_HEAD") && (
        <Card className="p-6 border border-hover bg-raised space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                <Share2 className="h-5 w-5 text-teal" /> Meta (Facebook & Instagram) Lead Ads Integration
              </h2>
              {(() => {
                if (metaStatusLoading) {
                  return (
                    <span className="text-[11px] font-mono text-muted border border-hover px-2.5 py-0.5 rounded-full">
                      Checking...
                    </span>
                  );
                }
                if (!metaStatus) {
                  return (
                    <span className="text-[11px] font-mono text-amber bg-amber/10 border border-amber/30 px-2.5 py-0.5 rounded-full">
                      Status unknown
                    </span>
                  );
                }
                const live = metaStatus.status === "live";
                const partial = metaStatus.status === "partial";
                const tone = live
                  ? { fg: "var(--emerald)", bd: "color-mix(in srgb, var(--emerald) 30%, transparent)", bg: "color-mix(in srgb, var(--emerald) 10%, transparent)", label: "Live & Receiving" }
                  : partial
                    ? { fg: "var(--amber)", bd: "color-mix(in srgb, var(--amber) 30%, transparent)", bg: "color-mix(in srgb, var(--amber) 10%, transparent)", label: "Partly configured" }
                    : { fg: "var(--crimson)", bd: "color-mix(in srgb, var(--crimson) 30%, transparent)", bg: "color-mix(in srgb, var(--crimson) 10%, transparent)", label: "Not connected" };
                return (
                  <span
                    className="text-[11px] font-mono px-2.5 py-0.5 rounded-full border"
                    style={{ color: tone.fg, backgroundColor: tone.bg, borderColor: tone.bd }}
                  >
                    {tone.label}
                  </span>
                );
              })()}
            </div>
            <p className="text-[12px] text-muted mt-1">
              Connect your Meta Business Manager to automatically ingest lead ads into TaskBoard CRM and create instant discovery tasks.
            </p>
          </div>

          {metaStatus && metaStatus.steps.length > 0 && (
            <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Setup checklist
              </label>
              {metaStatus.steps.map((step) => (
                <div key={step.key} className="flex items-start gap-2.5 text-[12px]">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald shrink-0 mt-px" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber shrink-0 mt-px" />
                  )}
                  <div>
                    <span className={step.done ? "text-ink" : "text-muted"}>{step.label}</span>
                    <div className="text-muted">{step.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {/* Webhook URL */}
            <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Webhook Callback URL
                </label>
                <button
                  onClick={() => copy("https://taskboard.example.com/api/webhooks/meta-leads", "meta_url")}
                  className="flex items-center gap-1 text-[11px] text-tealhi hover:underline"
                >
                  {copiedKey === "meta_url" ? <Check className="h-3 w-3 text-emerald" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedKey === "meta_url" ? "Copied" : "Copy URL"}</span>
                </button>
              </div>
              <div className="font-mono text-[13px] text-ink select-all">
                https://taskboard.example.com/api/webhooks/meta-leads
              </div>
            </div>

            {/* Verify Token */}
            <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Verify Token (hub.verify_token)
                </label>
                <button
                  onClick={() => copy(metaVerifyToken, "meta_token")}
                  className="flex items-center gap-1 text-[11px] text-tealhi hover:underline"
                >
                  {copiedKey === "meta_token" ? <Check className="h-3 w-3 text-emerald" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedKey === "meta_token" ? "Copied" : "Copy Token"}</span>
                </button>
              </div>
              <div className="font-mono text-[13px] text-tealhi select-all">
                {metaVerifyToken}
              </div>
            </div>

            {/* Setup Guide */}
            <div className="rounded-xl border border-hover bg-bg/60 p-4 text-[12px] space-y-2">
              <div className="font-semibold text-ink">3-Step Setup in Meta App Dashboard:</div>
              <ol className="list-decimal list-inside space-y-1 text-muted">
                <li>Go to <strong className="text-white">developers.facebook.com</strong> $\to$ Select your App $\to$ <strong className="text-white">Webhooks</strong>.</li>
                <li>Select <strong className="text-white">Page</strong> object $\to$ Click <strong className="text-white">Subscribe to this object</strong>.</li>
                <li>Paste the Callback URL and Verify Token above $\to$ Subscribe to the <strong className="text-tealhi">leadgen</strong> field.</li>
              </ol>
            </div>

            {/* Test Simulation Button */}
            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={runMetaTest}
                disabled={testing}
                className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-[12px] font-semibold text-white hover:bg-tealhi transition disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {testing ? "Simulating Webhook..." : "Send Test Lead Payload"}
              </button>
              {testResult && (
                <div className={`text-[12px] font-medium ${testResult.ok ? "text-emerald" : "text-crimson"}`}>
                  {testResult.msg}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* TAB 2: WHATSAPP */}
      {tab === "whatsapp" && (
        <Card className="p-6 border border-hover bg-raised space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald" /> WhatsApp Business Cloud API Integration
              </h2>
              <span className="text-[11px] font-mono text-emerald bg-emerald/10 border border-emerald/30 px-2.5 py-0.5 rounded-full">
                Active
              </span>
            </div>
            <p className="text-[12px] text-muted mt-1">
              Ingest incoming client messages directly into CRM and let employees execute commands via WhatsApp chat.
            </p>
          </div>

          {/* API Credentials Configuration */}
          {(currentRole === "SUPER_ADMIN" || currentRole === "DEPARTMENT_HEAD") && (
            <div className="rounded-xl border border-hover bg-bg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald" />
                  <span className="text-[13px] font-semibold text-ink">WhatsApp Cloud API Credentials</span>
                </div>
                {waConfigured ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald bg-emerald/10 border border-emerald/30 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber bg-amber/10 border border-amber/30 px-2.5 py-0.5 rounded-full">
                    <AlertTriangle className="h-3 w-3" /> Not configured
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Phone Number ID</label>
                  <input
                    type="text"
                    value={waConfig.phoneNumberId}
                    onChange={(e) => setWaConfig((c) => ({ ...c, phoneNumberId: e.target.value }))}
                    placeholder={waMasked.phoneNumberId || "e.g. 123456789012345"}
                    className="w-full rounded-lg border border-edge bg-raised px-3 py-2 text-[13px] font-mono text-ink placeholder-muted focus:border-emerald focus:outline-none"
                  />
                  <p className="text-[11px] text-muted">From Meta Developer Console &rarr; WhatsApp &rarr; API Setup</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Business Account ID</label>
                  <input
                    type="text"
                    value={waConfig.businessAccountId}
                    onChange={(e) => setWaConfig((c) => ({ ...c, businessAccountId: e.target.value }))}
                    placeholder={waMasked.businessAccountId || "e.g. 987654321098765"}
                    className="w-full rounded-lg border border-edge bg-raised px-3 py-2 text-[13px] font-mono text-ink placeholder-muted focus:border-emerald focus:outline-none"
                  />
                  <p className="text-[11px] text-muted">WhatsApp Business Account ID from Meta Business Suite</p>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Permanent Access Token</label>
                  <input
                    type="password"
                    value={waConfig.accessToken}
                    onChange={(e) => setWaConfig((c) => ({ ...c, accessToken: e.target.value }))}
                    placeholder={waMasked.permanentAccessToken || "System user permanent token from Meta Business Manager"}
                    className="w-full rounded-lg border border-edge bg-raised px-3 py-2 text-[13px] font-mono text-ink placeholder-muted focus:border-emerald focus:outline-none"
                  />
                  <p className="text-[11px] text-muted">Generate via Meta Business Manager &rarr; System Users &rarr; Generate Token</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={saveWaConfig}
                  disabled={waSaving}
                  className="flex items-center gap-2 rounded-lg bg-emerald px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {waSaving ? "Saving..." : "Save API Credentials"}
                </button>
                {waSaveResult && (
                  <span className={`text-[12px] font-medium ${waSaveResult.ok ? "text-emerald" : "text-crimson"}`}>
                    {waSaveResult.msg}
                  </span>
                )}
              </div>

              <div className="border-t border-hover pt-4 space-y-3">
                <div className="text-[12px] font-semibold text-ink">Send Test Message</div>
                <div className="flex items-center gap-2">
                  <input
                    type="tel"
                    value={waTestPhone}
                    onChange={(e) => setWaTestPhone(e.target.value)}
                    placeholder="Phone with country code e.g. 919876543210"
                    className="flex-1 rounded-lg border border-edge bg-raised px-3 py-2 text-[13px] font-mono text-ink placeholder-muted focus:border-tealhi focus:outline-none"
                  />
                  <button
                    onClick={sendWaTest}
                    disabled={waTesting || !waTestPhone || !waConfig.accessToken}
                    className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-[12px] font-semibold text-white hover:bg-tealhi transition disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {waTesting ? "Sending..." : "Send Test"}
                  </button>
                </div>
                {waTestResult && (
                  <div className={`text-[12px] font-medium ${waTestResult.ok ? "text-emerald" : "text-crimson"}`}>
                    {waTestResult.msg}
                  </div>
                )}
              </div>
            </div>
          )}


          {(currentRole === "SUPER_ADMIN" || currentRole === "DEPARTMENT_HEAD") && (
            <div className="space-y-4">
              <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    WhatsApp Webhook URL
                  </label>
                  <button
                    onClick={() => copy("https://taskboard.example.com/api/webhooks/whatsapp", "wa_url")}
                    className="flex items-center gap-1 text-[11px] text-emerald hover:underline"
                  >
                    {copiedKey === "wa_url" ? <Check className="h-3 w-3 text-emerald" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedKey === "wa_url" ? "Copied" : "Copy URL"}</span>
                  </button>
                </div>
                <div className="font-mono text-[13px] text-ink select-all">
                  https://taskboard.example.com/api/webhooks/whatsapp
                </div>
              </div>

              <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Verify Token
                  </label>
                  <button
                    onClick={() => copy(whatsappVerifyToken, "wa_token")}
                    className="flex items-center gap-1 text-[11px] text-emerald hover:underline"
                  >
                    {copiedKey === "wa_token" ? <Check className="h-3 w-3 text-emerald" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedKey === "wa_token" ? "Copied" : "Copy Token"}</span>
                  </button>
                </div>
                <div className="font-mono text-[13px] text-emerald select-all">
                  {whatsappVerifyToken}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Supported Commands */}
            <div className="rounded-xl border border-hover bg-bg/60 p-4 text-[12px] space-y-2">
              <div className="font-semibold text-ink">Supported WhatsApp Bot Commands:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-muted font-mono text-[11px]">
                <div className="p-2 rounded bg-raised border border-hover">
                  <span className="text-emerald">/log &lt;min&gt; &lt;CODE&gt; &lt;note&gt;</span>
                  <div className="text-[10px] text-muted mt-0.5">Logs active work session</div>
                </div>
                <div className="p-2 rounded bg-raised border border-hover">
                  <span className="text-emerald">/done &lt;CODE&gt; &lt;outcome&gt;</span>
                  <div className="text-[10px] text-muted mt-0.5">Marks task complete with outcome</div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={runWhatsAppTest}
                disabled={testing}
                className="flex items-center gap-2 rounded-lg bg-emerald px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90 transition disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {testing ? "Sending..." : "Simulate WhatsApp Inquiry"}
              </button>
              {testResult && (
                <div className={`text-[12px] font-medium ${testResult.ok ? "text-emerald" : "text-crimson"}`}>
                  {testResult.msg}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* TAB 3: MCP & AI — the Agent Secret is a real master credential (the
          x-agent-secret header) that grants full MCP/API access; this had no
          role gate at all, so any employee who could open Settings could
          reveal and copy it. Leadership-only, same as Meta/WhatsApp above. */}
      {tab === "mcp" && !(currentRole === "SUPER_ADMIN" || currentRole === "DEPARTMENT_HEAD") && (
        <Card className="p-6 border border-hover bg-raised">
          <p className="text-[13px] text-muted">This integration is managed by leadership.</p>
        </Card>
      )}
      {tab === "mcp" && (currentRole === "SUPER_ADMIN" || currentRole === "DEPARTMENT_HEAD") && (
        <Card className="p-6 border border-hover bg-raised space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                <Cpu className="h-5 w-5 text-tealhi" /> Model Context Protocol (MCP) & AI Integration
              </h2>
              <span className="text-[11px] font-mono text-tealhi bg-tealhi/10 border border-tealhi/30 px-2.5 py-0.5 rounded-full">
                JSON-RPC 2.0
              </span>
            </div>
            <p className="text-[12px] text-muted mt-1">
              Connect external AI assistants (Cursor, Claude Desktop, Hermes Agent) to TaskBoard OS via standard MCP.
            </p>
          </div>

          <div className="space-y-4">
            {/* MCP HTTP Endpoint */}
            <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  MCP HTTP Endpoint
                </label>
                <button
                  onClick={() => copy("https://taskboard.example.com/api/mcp", "mcp_url")}
                  className="flex items-center gap-1 text-[11px] text-tealhi hover:underline"
                >
                  {copiedKey === "mcp_url" ? <Check className="h-3 w-3 text-emerald" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedKey === "mcp_url" ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <div className="font-mono text-[13px] text-ink select-all">
                https://taskboard.example.com/api/mcp
              </div>
            </div>

            {/* Agent Secret */}
            <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Agent Secret Key (x-agent-secret header)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    className="p-1 rounded text-muted hover:text-white"
                  >
                    {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => copy(agentSecret, "secret")}
                    className="flex items-center gap-1 text-[11px] text-tealhi hover:underline"
                  >
                    {copiedKey === "secret" ? <Check className="h-3 w-3 text-emerald" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedKey === "secret" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
              <div className="font-mono text-[13px] text-tealhi">
                {showSecret ? agentSecret : "••••••••••••••••••••••••••••••••"}
              </div>
            </div>

            {/* Claude Desktop Config Snippet */}
            <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Claude Desktop / Cursor Configuration (mcpServers)
                </label>
                <button
                  onClick={() => {
                    const snippet = JSON.stringify({
                      mcpServers: {
                        "taskboard-os": {
                          command: "node",
                          args: ["/path/to/taskboard-os/scripts/mcp-server.js"]
                        }
                      }
                    }, null, 2);
                    copy(snippet, "mcp_json");
                  }}
                  className="flex items-center gap-1 text-[11px] text-tealhi hover:underline"
                >
                  {copiedKey === "mcp_json" ? <Check className="h-3 w-3 text-emerald" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedKey === "mcp_json" ? "Copied JSON" : "Copy JSON"}</span>
                </button>
              </div>
              <pre className="text-[11px] font-mono text-ink bg-raised p-3 rounded-lg overflow-x-auto">
{`{
  "mcpServers": {
    "taskboard-os": {
      "command": "node",
      "args": ["/path/to/taskboard-os/scripts/mcp-server.js"]
    }
  }
}`}
              </pre>
            </div>
          </div>
        </Card>
      )}

      {/* TAB 4: SHIFT & ATTENDANCE */}
      {tab === "shift" && (
        <Card className="p-6 border border-hover bg-raised space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber" /> Shift, Attendance & Overtime Policy
            </h2>
            <p className="text-[12px] text-muted mt-1">
              Configure daily working hours, automatic break deductions, and escalation thresholds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Shift Window (IST)
              </label>
              <div className="text-lg font-bold font-mono text-ink">09:30 AM – 06:30 PM IST</div>
              <p className="text-[11px] text-muted">8.0 productive hours target per business day.</p>
            </div>

            <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Lunch Break Auto-Deduction
              </label>
              <div className="text-lg font-bold font-mono text-amber">13:30 – 14:10 IST (40 mins)</div>
              <p className="text-[11px] text-muted">Automatically excluded from productive working meter.</p>
            </div>

            <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Overtime Calculation
              </label>
              <div className="text-lg font-bold font-mono text-emerald">&gt; 18:30 IST Clocked Time</div>
              <p className="text-[11px] text-muted">Work sessions logged beyond 18:30 IST automatically flagged as OT.</p>
            </div>

            <div className="rounded-xl border border-hover bg-bg p-4 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Stale Blocker Escalation
              </label>
              <div className="text-lg font-bold font-mono text-crimson">24 Hours Threshold</div>
              <p className="text-[11px] text-muted">Auto-alerts Dept Head if a task remains BLOCKED for &gt;24h.</p>
            </div>
          </div>
        </Card>
      )}

      {/* TAB 5: PERSONAS */}
    </div>
  );
}
