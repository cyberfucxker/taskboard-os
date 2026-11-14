import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
type IntegrationProvider = string;
type IntegrationStatus = string;

export const dynamic = "force-dynamic";

const INTEGRATION_SPECS: Record<
  string,
  {
    name: string;
    category: "CALENDAR" | "MESSAGING" | "CODE" | "STORAGE" | "SEO" | "AUTOMATION";
    description: string;
    authType: "OAUTH2" | "API_KEY" | "WEBHOOK" | "TOKEN_SECRET";
    docsUrl: string;
    fields: {
      key: string;
      label: string;
      type: "text" | "password" | "url" | "textarea";
      placeholder: string;
      required: boolean;
      hint?: string;
    }[];
  }
> = {
  GOOGLE_WORKSPACE: {
    name: "Google Workspace & Meet / Calendar",
    category: "CALENDAR",
    description: "Generate 1-click Google Meet video rooms and sync deadlines & meetings to Google Calendar.",
    authType: "OAUTH2",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    fields: [
      {
        key: "clientId",
        label: "Google Client ID",
        type: "text",
        placeholder: "e.g. 1234567890-xyz.apps.googleusercontent.com",
        required: true,
        hint: "From GCP Console OAuth 2.0 Client IDs",
      },
      {
        key: "clientSecret",
        label: "Google Client Secret",
        type: "password",
        placeholder: "GOCSPX-...",
        required: true,
      },
      {
        key: "redirectUri",
        label: "Authorized Redirect URI",
        type: "url",
        placeholder: "https://taskboard.example.com/api/integrations/google/callback",
        required: true,
      },
      {
        key: "serviceAccountEmail",
        label: "Optional Service Account Email (Domain-Wide Delegation)",
        type: "text",
        placeholder: "taskboard-calendar@your-project.iam.gserviceaccount.com",
        required: false,
      },
    ],
  },
  CALENDLY: {
    name: "Calendly / Cal.com Discovery Sync",
    category: "CALENDAR",
    description: "Automatically create CRM leads, schedule client demos, and trigger meeting summaries.",
    authType: "TOKEN_SECRET",
    docsUrl: "https://calendly.com/integrations/api_webhooks",
    fields: [
      {
        key: "apiKey",
        label: "Personal Access Token / API Key",
        type: "password",
        placeholder: "cal_live_...",
        required: true,
      },
      {
        key: "webhookSigningKey",
        label: "Webhook Signing Key",
        type: "password",
        placeholder: "whsec_...",
        required: false,
      },
      {
        key: "userUri",
        label: "Calendly Organization / User URI",
        type: "text",
        placeholder: "https://api.calendly.com/users/AAAAAAAAAAAAAAAA",
        required: false,
      },
    ],
  },
  WHATSAPP_CLOUD: {
    name: "WhatsApp Cloud API (Meta for Developers)",
    category: "MESSAGING",
    description: "Send automated task deliverable approvals, SLA alerts, and client update messages.",
    authType: "API_KEY",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    fields: [
      {
        key: "phoneNumberId",
        label: "WhatsApp Phone Number ID",
        type: "text",
        placeholder: "e.g. 104829104928102",
        required: true,
      },
      {
        key: "businessAccountId",
        label: "WhatsApp Business Account ID",
        type: "text",
        placeholder: "e.g. 109283019283012",
        required: false,
      },
      {
        key: "permanentAccessToken",
        label: "System User Permanent Access Token",
        type: "password",
        placeholder: "EAAG...",
        required: true,
      },
      {
        key: "webhookVerifyToken",
        label: "Inbound Webhook Verify Token",
        type: "password",
        placeholder: "taskboard_wa_verify_2026",
        required: false,
      },
    ],
  },
  GITHUB: {
    name: "GitHub / GitLab Repository Sync",
    category: "CODE",
    description: "Link Pull Requests and commit SHAs to developer tasks. Auto-move tasks to IN_REVIEW on PR open.",
    authType: "TOKEN_SECRET",
    docsUrl: "https://github.com/settings/tokens",
    fields: [
      {
        key: "personalAccessToken",
        label: "GitHub Personal Access Token (PAT) / Fine-grained Token",
        type: "password",
        placeholder: "ghp_...",
        required: true,
      },
      {
        key: "organizationOrOwner",
        label: "Default Organization / Owner",
        type: "text",
        placeholder: "acme",
        required: true,
      },
      {
        key: "webhookSecret",
        label: "GitHub Webhook Secret",
        type: "password",
        placeholder: "gh_webhook_secret_...",
        required: false,
      },
    ],
  },
  SLACK: {
    name: "Slack / Discord Escalation Alerts",
    category: "MESSAGING",
    description: "Stream high-priority escalations, task blockers, and new high-ticket lead alerts directly into Slack channels.",
    authType: "WEBHOOK",
    docsUrl: "https://api.slack.com/messaging/webhooks",
    fields: [
      {
        key: "incomingWebhookUrl",
        label: "Incoming Webhook URL",
        type: "url",
        placeholder: "https://hooks.slack.com/services/T00/B00/XXXX",
        required: true,
      },
      {
        key: "botToken",
        label: "Optional Bot User OAuth Token (xoxb-)",
        type: "password",
        placeholder: "xoxb-...",
        required: false,
      },
      {
        key: "defaultChannel",
        label: "Default Notification Channel",
        type: "text",
        placeholder: "#taskboard-escalations",
        required: false,
      },
    ],
  },
  TELEGRAM: {
    name: "Telegram Bot Notifications",
    category: "MESSAGING",
    description: "Direct alerts to leadership and account managers on instant task re-assignments or urgent requests.",
    authType: "API_KEY",
    docsUrl: "https://core.telegram.org/bots",
    fields: [
      {
        key: "botToken",
        label: "Telegram Bot Token",
        type: "password",
        placeholder: "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ",
        required: true,
      },
      {
        key: "chatId",
        label: "Target Channel / Group Chat ID",
        type: "text",
        placeholder: "-1001234567890",
        required: true,
      },
    ],
  },
  GOOGLE_DRIVE: {
    name: "Google Drive & Cloud Storage Deliverables",
    category: "STORAGE",
    description: "Real-time thumbnail preview and deliverable asset verification for design and video tasks.",
    authType: "API_KEY",
    docsUrl: "https://developers.google.com/drive/api",
    fields: [
      {
        key: "googleDriveApiKey",
        label: "Google Cloud API Key (Drive API Enabled)",
        type: "password",
        placeholder: "AIzaSy...",
        required: true,
      },
      {
        key: "serviceAccountKeyJson",
        label: "Service Account JSON Key File",
        type: "textarea",
        placeholder: '{"type": "service_account", "project_id": "...", ...}',
        required: false,
      },
    ],
  },
  UBERSUGGEST: {
    name: "SEO Engine & Search Console / Ubersuggest API",
    category: "SEO",
    description: "Sync SEO ranking positions, keyword share of voice, and backlink audit metrics for digital marketing.",
    authType: "API_KEY",
    docsUrl: "https://ubersuggest.com/api",
    fields: [
      {
        key: "apiKey",
        label: "SEO API Key / Token",
        type: "password",
        placeholder: "seo_live_...",
        required: true,
      },
      {
        key: "defaultDomain",
        label: "Primary Monitored Domain",
        type: "text",
        placeholder: "example.com",
        required: false,
      },
    ],
  },
  CUSTOM_WEBHOOK: {
    name: "Custom Enterprise Outbound Webhook",
    category: "AUTOMATION",
    description: "Trigger external webhooks on task creation, completion, lead movement, or stage approvals.",
    authType: "WEBHOOK",
    docsUrl: "",
    fields: [
      {
        key: "targetUrl",
        label: "Target Webhook Endpoint URL",
        type: "url",
        placeholder: "https://your-server.com/api/taskboard-events",
        required: true,
      },
      {
        key: "customSecretHeader",
        label: "HMAC Secret Header (X-TaskBoard-Signature)",
        type: "password",
        placeholder: "whsec_custom_...",
        required: false,
      },
    ],
  },
};

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const configs = await (prisma as any).systemIntegrationConfig.findMany({
      orderBy: { createdAt: "asc" },
    });

    // Build map of configured providers
    const configsMap = new Map<string, any>(configs.map((c: any) => [c.provider, c]));

    // Format registry output for UI
    const registry = Object.entries(INTEGRATION_SPECS).map(([providerKey, spec]: [string, any]) => {
      const existing = configsMap.get(providerKey as IntegrationProvider);
      return {
        provider: providerKey,
        spec,
        config: existing
          ? {
              id: existing.id,
              isEnabled: existing.isEnabled,
              status: existing.status,
              webhookUrl: existing.webhookUrl,
              lastSyncAt: existing.lastSyncAt,
              lastError: existing.lastError,
              // Never return plaintext passwords directly to client for security
              hasCredentials: Boolean(existing.credentialsJson && Object.keys(existing.credentialsJson as object).length > 0),
              credentialsMasked: maskCredentials(existing.credentialsJson as Record<string, string> || {}),
            }
          : {
              id: null,
              isEnabled: false,
              status: "PENDING_CONFIG",
              webhookUrl: null,
              lastSyncAt: null,
              lastError: null,
              hasCredentials: false,
              credentialsMasked: {},
            },
      };
    });

    return NextResponse.json({ ok: true, data: registry });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Failed to load integrations" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Role check: Only SUPER_ADMIN, DEPARTMENT_HEAD, or HR/FINANCE with admin capability can modify system integrations
    if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "DEPARTMENT_HEAD") {
      return NextResponse.json({ ok: false, error: "Forbidden. Administrative privileges required." }, { status: 403 });
    }

    const body = await req.json();
    const { provider, isEnabled, credentials, webhookUrl } = body;

    if (!provider || !INTEGRATION_SPECS[provider as IntegrationProvider]) {
      return NextResponse.json({ ok: false, error: "Invalid integration provider" }, { status: 400 });
    }

    const spec = INTEGRATION_SPECS[provider as IntegrationProvider];

    // Determine status
    let status: IntegrationStatus = "PENDING_CONFIG";
    if (isEnabled) {
      const hasReq = spec.fields.filter((f: any) => f.required).every((f: any) => credentials?.[f.key]?.trim());
      status = hasReq ? "PENDING_CONFIG" : "PENDING_CONFIG";
    } else {
      status = "PENDING_CONFIG";
    }

    const record = await (prisma as any).systemIntegrationConfig.upsert({
      where: { provider: provider as IntegrationProvider },
      create: {
        provider: provider as IntegrationProvider,
        name: spec.name,
        category: spec.category,
        isEnabled: Boolean(isEnabled),
        status,
        credentialsJson: credentials || {},
        webhookUrl: webhookUrl || null,
        lastSyncAt: new Date(),
      },
      update: {
        name: spec.name,
        category: spec.category,
        isEnabled: Boolean(isEnabled),
        status,
        credentialsJson: credentials || {},
        webhookUrl: webhookUrl || null,
        lastSyncAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      message: `Integration ${spec.name} successfully updated.`,
      data: record,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Failed to save integration" }, { status: 500 });
  }
}

function maskCredentials(creds: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (!v) continue;
    if (v.length <= 6) {
      masked[k] = "••••••";
    } else {
      masked[k] = v.slice(0, 3) + "••••••••" + v.slice(-3);
    }
  }
  return masked;
}
