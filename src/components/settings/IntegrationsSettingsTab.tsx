import React, { useState, useEffect } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import {
  Video,
  Calendar as CalendarIcon,
  MessageSquare,
  ExternalLink,
  Save,
  Link2,
  Phone,
  ShieldCheck,
  UserCheck,
  Bot,
  Rss,
  Loader2,
  Unlink,
} from "lucide-react";
import { useToast } from "@/components/Toast";

interface EmployeeIntegration {
  id?: string;
  provider: string;
  personalMeetUrl?: string;
  bookingUrl?: string;
  whatsappNumber?: string;
  accountEmail?: string;
  icalUrl?: string;
  isEnabled: boolean;
  accessToken?: string | null;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  department: { id: string; name: string } | null;
  email?: string;
}

interface AgentConfig {
  isActive: boolean;
  roleBrief: string;
  skills: { name: string; instructions: string }[];
}

export default function IntegrationsSettingsTab({
  currentUserId,
  currentUserName,
  currentUserRole,
  canManageOthers = false,
}: {
  currentUserId?: string;
  currentUserName?: string;
  currentUserRole?: string;
  canManageOthers?: boolean;
}) {
  const toast = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>(canManageOthers ? "" : currentUserId ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Meeting / calendar / whatsapp form state
  const [meetUrl, setMeetUrl] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [whatsappNum, setWhatsappNum] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleAppConfigured, setGoogleAppConfigured] = useState<boolean | null>(null);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // AI Agent form state
  const [agentActive, setAgentActive] = useState(false);
  const [agentBrief, setAgentBrief] = useState("");
  const [agentSkillsText, setAgentSkillsText] = useState("");
  const [agentSaving, setAgentSaving] = useState(false);

  useOnLiveChange(() => { fetchInitialData(); });

  useEffect(() => {
    fetchInitialData();
    fetch("/api/integrations/google/status")
      .then((r) => r.json())
      .then((d) => setGoogleAppConfigured(Boolean(d?.configured)))
      .catch(() => setGoogleAppConfigured(false));
  }, []);

  async function fetchInitialData() {
    try {
      setLoading(true);
      if (!canManageOthers) {
        // Self-service: configure your own setup only, no team roster needed.
        // `selectedEmp` (used throughout the cards below) is derived from
        // `employees`, so seed it with just this one synthetic row.
        if (currentUserId) {
          setEmployees([
            {
              id: currentUserId,
              name: currentUserName || "You",
              role: currentUserRole || "",
              department: null,
            },
          ]);
          await loadEmployeeIntegrations(currentUserId);
          await loadAgentConfig(currentUserId);
        }
        return;
      }
      const res = await fetch("/api/employees");
      const data = await res.json();
      if (data.ok && Array.isArray(data.employees)) {
        setEmployees(data.employees);
        if (data.employees.length > 0) {
          const firstId = data.employees[0].id;
          setSelectedEmpId(firstId);
          await loadEmployeeIntegrations(firstId);
          await loadAgentConfig(firstId);
        }
      }
    } catch (err) {
      console.error("Failed to load employees:", err);
      toast("Failed to load team list");
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployeeIntegrations(empId: string) {
    try {
      const res = await fetch(`/api/integrations/employee?employeeId=${empId}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.data)) {
        const google = data.data.find((i: EmployeeIntegration) => i.provider === "GOOGLE");
        const calendly = data.data.find((i: EmployeeIntegration) => i.provider === "CALENDLY");
        const whatsapp = data.data.find((i: EmployeeIntegration) => i.provider === "WHATSAPP");
        const ical = data.data.find((i: EmployeeIntegration) => i.provider === "ICAL");

        setMeetUrl(google?.personalMeetUrl || "");
        setBookingUrl(calendly?.bookingUrl || "");
        setWhatsappNum(whatsapp?.whatsappNumber || "");
        setAccountEmail(google?.accountEmail || "");
        setIcalUrl(ical?.icalUrl || "");
        setGoogleConnected(Boolean(google?.accessToken));
      } else {
        setMeetUrl("");
        setBookingUrl("");
        setWhatsappNum("");
        setAccountEmail("");
        setIcalUrl("");
        setGoogleConnected(false);
      }
    } catch (err) {
      console.error("Failed to load integrations for employee:", err);
    }
  }

  async function loadAgentConfig(empId: string) {
    try {
      const res = await fetch(`/api/agent/config?employeeId=${empId}`);
      const data = await res.json();
      if (data.ok && data.config) {
        setAgentActive(Boolean(data.config.isActive));
        setAgentBrief(data.config.roleBrief || "");
        const skills = Array.isArray(data.config.skills) ? data.config.skills : [];
        setAgentSkillsText(
          skills.map((s: any) => `${s.name}: ${s.instructions || s.description || ""}`).join("\n")
        );
      } else {
        setAgentActive(false);
        setAgentBrief("");
        setAgentSkillsText("");
      }
    } catch (err) {
      console.error("Failed to load agent config:", err);
    }
  }

  async function handleSelectEmployee(empId: string) {
    setSelectedEmpId(empId);
    await loadEmployeeIntegrations(empId);
    await loadAgentConfig(empId);
  }

  async function handleSaveAll() {
    if (!selectedEmpId) return;
    try {
      setSaving(true);

      await fetch("/api/integrations/employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmpId,
          provider: "GOOGLE",
          personalMeetUrl: meetUrl.trim(),
          accountEmail: accountEmail.trim(),
          isEnabled: true,
        }),
      });

      await fetch("/api/integrations/employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmpId,
          provider: "CALENDLY",
          bookingUrl: bookingUrl.trim(),
          isEnabled: true,
        }),
      });

      await fetch("/api/integrations/employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmpId,
          provider: "WHATSAPP",
          whatsappNumber: whatsappNum.trim(),
          isEnabled: true,
        }),
      });

      await fetch("/api/integrations/employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmpId,
          provider: "ICAL",
          icalUrl: icalUrl.trim(),
          isEnabled: Boolean(icalUrl.trim()),
        }),
      });

      toast("All integration credentials updated!");
    } catch (err) {
      console.error("Failed to save integrations:", err);
      toast("Failed to save integrations");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAgent() {
    if (!selectedEmpId) return;
    try {
      setAgentSaving(true);
      const skills = agentSkillsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, ...rest] = line.split(":");
          return { name: name.trim(), instructions: rest.join(":").trim() };
        });

      const res = await fetch("/api/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmpId,
          isActive: agentActive,
          roleBrief: agentBrief.trim(),
          skills,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("AI agent configuration saved");
      } else {
        toast(data.error || "Failed to save AI agent config");
      }
    } catch (err) {
      console.error("Failed to save agent config:", err);
      toast("Failed to save AI agent config");
    } finally {
      setAgentSaving(false);
    }
  }

  // The old flow navigated the browser to the provider via GET and relied on an
  // `oauth-state` cookie. The hub now uses PKCE: we POST to start, then hand the
  // browser the returned authorizeUrl. A plain window.location to the GET
  // endpoint would 401, because the PKCE cookie is only set by the POST.
  async function handleConnectGoogle() {
    if (!selectedEmpId || googleConnecting) return;
    setGoogleConnecting(true);
    setGoogleError(null);
    try {
      const res = await fetch("/api/integrations/google/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selectedEmpId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGoogleError(body.error || "Could not start the Google connection.");
        return;
      }
      if (!body.authorizeUrl) {
        setGoogleError("Google did not return an authorisation link.");
        return;
      }
      window.location.assign(body.authorizeUrl);
    } catch (err) {
      console.error("Failed to start Google connect:", err);
      setGoogleError("Could not reach the server. Check your connection and try again.");
    } finally {
      setGoogleConnecting(false);
    }
  }

  async function handleDisconnectGoogle() {
    if (!selectedEmpId) return;
    try {
      const res = await fetch(
        `/api/integrations/google/status?employeeId=${encodeURIComponent(selectedEmpId)}`,
        { method: "DELETE" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(body.error || "Failed to disconnect Google");
        return;
      }
      setGoogleConnected(false);
      setAccountEmail("");
      toast("Google account disconnected", "success");
    } catch (err) {
      console.error("Failed to disconnect Google:", err);
      toast("Failed to disconnect Google", "error");
    }
  }

  const selectedEmp = employees.find((e) => e.id === selectedEmpId);

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header Banner */}
      <div className="p-6 rounded-[10px] bg-surface border border-edge relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal/15 text-tealhi border border-teal/30 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Per-Employee Integrations</span>
            </div>
            <h2 className="text-xl font-bold text-ink">Integrations, Calendar & AI Agent</h2>
            <p className="text-sm text-muted mt-1">
              Every field below is real and manually configurable — nothing is faked. If a
              provider needs credentials that only an admin can create (e.g. Google OAuth), it says so.
            </p>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={saving || !selectedEmpId}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-teal hover:bg-tealhi text-white transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Saving Changes..." : "Save All Changes"}</span>
          </button>
        </div>
      </div>

      {/* Team Member Selector — leadership only; everyone else configures their own setup */}
      {canManageOthers ? (
        <div className="p-5 rounded-xl bg-surface border border-edge space-y-3">
          <label className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-tealhi" />
            <span>Select Team Member to Configure ({employees.length} Members)</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {employees.map((emp) => {
              const isSelected = emp.id === selectedEmpId;
              return (
                <button
                  key={emp.id}
                  onClick={() => handleSelectEmployee(emp.id)}
                  className={`flex flex-col text-left p-2.5 rounded-lg border transition-all text-xs ${
                    isSelected
                      ? "bg-teal/15 border-teal text-ink shadow-sm"
                      : "bg-raised border-edge text-muted hover:border-edge hover:text-ink2"
                  }`}
                >
                  <span className="font-semibold truncate text-ink">{emp.name}</span>
                  <span className="text-[10px] text-muted truncate mt-0.5">{emp.role} • {emp.department?.name || "No department"}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-surface border border-edge flex items-center gap-2 text-xs text-muted">
          <UserCheck className="w-4 h-4 text-tealhi" />
          <span>These settings apply to your own account only.</span>
        </div>
      )}

      {/* Selected Member Integration Cards */}
      {selectedEmp && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1. Google Meet + Calendar */}
          <div className="p-6 rounded-2xl bg-surface border border-edge flex flex-col justify-between space-y-6 hover:border-teal/40 transition-colors">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-teal/15 border border-teal/30 flex items-center justify-center text-tealhi">
                  <Video className="w-5 h-5" />
                </div>
                {googleAppConfigured === null ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted" />
                ) : googleConnected ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald/10 text-emerald border border-emerald/25">
                    Connected
                  </span>
                ) : googleAppConfigured ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-raised text-muted border border-edge">
                    Not Connected
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber/10 text-amber border border-amber/25">
                    Admin Setup Needed
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Google Meet & Calendar</h3>
                <p className="text-xs text-muted mt-1">
                  {googleAppConfigured
                    ? `Connect ${selectedEmp.name}'s Google account for real Meet links and two-way calendar sync.`
                    : "Real Meet links need a Google OAuth app registered by an admin (Google Cloud Console → OAuth Client + Calendar API). Not set up yet, so this stays manual for now."}
                </p>
              </div>

              {googleError ? (
                <p
                  role="alert"
                  className="w-full rounded-lg border border-edge bg-raised px-3 py-2 text-[11.5px] font-medium text-crimson"
                >
                  {googleError}
                </p>
              ) : null}

              <div className="w-full flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  disabled={!googleAppConfigured || googleConnecting}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-raised border border-edge text-tealhi hover:bg-teal/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {googleConnecting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {googleConnecting
                      ? "Opening Google…"
                      : googleConnected
                        ? "Reconnect Google Account"
                        : "Connect Google Account"}
                  </span>
                </button>

                {googleConnected ? (
                  <button
                    type="button"
                    onClick={handleDisconnectGoogle}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-raised border border-edge text-crimson hover:bg-crimson/10 transition-colors"
                  >
                    <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Disconnect</span>
                  </button>
                ) : null}
              </div>

              <div className="space-y-3 pt-2 border-t border-edge">
                <div>
                  <label className="text-[11px] font-medium text-muted block mb-1.5">
                    Or paste a personal Meet/Zoom link manually
                  </label>
                  <input
                    type="url"
                    value={meetUrl}
                    onChange={(e) => setMeetUrl(e.target.value)}
                    placeholder="https://meet.google.com/xxx-yyyy-zzz"
                    className="w-full px-3 py-2 rounded-lg bg-raised border border-edge text-xs text-ink placeholder-faint focus:outline-none focus:border-teal"
                  />
                </div>
              </div>
            </div>

            {meetUrl && (
              <a
                href={meetUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-raised border border-edge text-tealhi hover:bg-teal/15 transition-colors"
              >
                <span>Test Launch Room</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {/* 2. Personal Calendar Feed (iCal) */}
          <div
            id="integration-ical"
            className="p-6 rounded-2xl bg-surface border border-edge flex flex-col justify-between space-y-6 hover:border-teal/40 transition-colors scroll-mt-24"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-teal/15 border border-teal/30 flex items-center justify-center text-tealhi">
                  <Rss className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald/10 text-emerald border border-emerald/25">
                  {icalUrl ? "Active" : "Zero-Setup"}
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Personal Calendar Feed</h3>
                <p className="text-xs text-muted mt-1">
                  Read-only sync into TaskBoard's Calendar. From Google Calendar: Settings → your
                  calendar → "Secret address in iCal format". From Outlook: Calendar → Share →
                  Publish a calendar → ICS link.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-[11px] font-medium text-muted block mb-1.5">iCal Feed URL</label>
                  <input
                    type="url"
                    value={icalUrl}
                    onChange={(e) => setIcalUrl(e.target.value)}
                    placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                    className="w-full px-3 py-2 rounded-lg bg-raised border border-edge text-xs text-ink placeholder-faint focus:outline-none focus:border-teal"
                  />
                </div>
              </div>
            </div>

            <p className="text-[10px] text-faint">
              Events from this feed show up on the {selectedEmp.name.split(" ")[0]}'s Calendar page
              as "Personal" entries. This link is a secret — treat it like a password.
            </p>
          </div>

          {/* 3. WhatsApp Direct Alerting */}
          <div className="p-6 rounded-2xl bg-surface border border-edge flex flex-col justify-between space-y-6 hover:border-teal/40 transition-colors">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-teal/15 border border-teal/30 flex items-center justify-center text-tealhi">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald/10 text-emerald border border-emerald/25">
                  Instant Ping
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">WhatsApp Alerts</h3>
                <p className="text-xs text-muted mt-1">
                  Direct mobile notifications for urgent task blockers & reviews.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-[11px] font-medium text-muted block mb-1.5">Phone Number (with Country Code)</label>
                  <input
                    type="tel"
                    value={whatsappNum}
                    onChange={(e) => setWhatsappNum(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 rounded-lg bg-raised border border-edge text-xs text-ink placeholder-faint focus:outline-none focus:border-teal"
                  />
                </div>
              </div>
            </div>

            {whatsappNum && (
              <a
                href={`https://wa.me/${whatsappNum.replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-raised border border-edge text-tealhi hover:bg-teal/15 transition-colors"
              >
                <span>Test WhatsApp Link</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {/* 4. AI Agent */}
          <div className="p-6 rounded-2xl bg-surface border border-edge flex flex-col justify-between space-y-6 hover:border-teal/40 transition-colors">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-teal/15 border border-teal/30 flex items-center justify-center text-tealhi">
                  <Bot className="w-5 h-5" />
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <span className="text-[10px] font-bold text-muted uppercase">Active</span>
                  <input
                    type="checkbox"
                    checked={agentActive}
                    onChange={(e) => setAgentActive(e.target.checked)}
                    className="accent-teal"
                  />
                </label>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">AI Agent — {selectedEmp.name.split(" ")[0]}'s Stand-in</h3>
                <p className="text-xs text-muted mt-1">
                  Runs on the AI gateway (already live on the box). When active, anyone can trigger
                  "Run AI Agent" on this person's tasks from the task drawer — it drafts a real
                  output using this brief, posted as a task comment.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-muted block mb-1.5">Standing brief (what they do day-to-day)</label>
                  <textarea
                    value={agentBrief}
                    onChange={(e) => setAgentBrief(e.target.value)}
                    rows={3}
                    placeholder="e.g. Runs outbound sales for the APAC region: qualifies leads, drafts proposals, follows up after demos."
                    className="w-full px-3 py-2 rounded-lg bg-raised border border-edge text-xs text-ink placeholder-faint focus:outline-none focus:border-teal resize-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted block mb-1.5">
                    Skills (one per line: <span className="text-faint">name: instructions</span>)
                  </label>
                  <textarea
                    value={agentSkillsText}
                    onChange={(e) => setAgentSkillsText(e.target.value)}
                    rows={3}
                    placeholder={"proposal_draft: Write a 1-page proposal using the client's stated budget and timeline.\nfollow_up_email: Draft a friendly follow-up referencing the last call."}
                    className="w-full px-3 py-2 rounded-lg bg-raised border border-edge text-xs text-ink placeholder-faint focus:outline-none focus:border-teal resize-none font-mono"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveAgent}
              disabled={agentSaving}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-teal hover:bg-tealhi text-white transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{agentSaving ? "Saving..." : "Save AI Agent Config"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
