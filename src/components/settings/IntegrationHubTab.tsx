"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Link2Off,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useToast } from "@/components/Toast";

type ConnectionStatus = {
  connected: boolean;
  needsReconnect?: boolean;
  accountEmail?: string | null;
  grantedScopes?: string[];
  /** Set for non-OAuth providers: where the user actually configures them. */
  setupPath?: string | null;
};

type HubProvider = {
  key: string;
  name: string;
  blurb: string;
  category: string;
  /** "oauth2" means a consent redirect; anything else is set up by hand. */
  auth: string;
  configured: boolean;
  status: string;
  declaredStatus: string;
  blockedOnOrg: boolean;
  missingConfigKeys: string[];
  optionalConfigKeys: string[];
  scopes: string[];
  recommended: boolean;
  headline: string;
  whyItMatters: string;
  connection_status: ConnectionStatus;
};

type HubPayload = {
  department: { slug: string; name: string } | null;
  providers: HubProvider[];
  summary: {
    total: number;
    configured: number;
    awaitingCredentials: number;
    connected: number;
    recommended: number;
  };
};

const HUB_KEY = ["integrations", "hub"] as const;

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tealhi focus-visible:ring-offset-2 focus-visible:ring-offset-raised";

const REASON_TEXT: Record<string, string> = {
  incomplete: "The provider sent back an incomplete response, so nothing was saved.",
  denied: "You cancelled the authorisation.",
  not_configured: "This tool still needs admin setup before it can be connected.",
  state: "The security check expired before it finished. Start again.",
  token_exchange: "The provider rejected the token exchange. An admin may need to re-check the app credentials.",
};

function useHub() {
  return useQuery<HubPayload>({
    queryKey: HUB_KEY,
    queryFn: async () => {
      const res = await fetch("/api/integrations/hub", { cache: "no-store" });
      if (res.status === 401) throw new Error("Your session expired. Sign in again.");
      if (!res.ok) throw new Error("We could not load your integrations. Refresh to try again.");
      return (await res.json()) as HubPayload;
    },
  });
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-busy="true" aria-label="Loading integrations">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[168px] animate-pulse rounded-xl border border-line bg-surface" />
      ))}
    </div>
  );
}

function ResultBanner() {
  const params = useSearchParams();
  const connected = params.get("connected");
  const provider = params.get("provider");
  const reason = params.get("reason") ?? "";
  const [visible, setVisible] = useState(connected !== null);

  useEffect(() => {
    if (connected === null) return;
    setVisible(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    url.searchParams.delete("provider");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [connected, provider, reason]);

  if (!visible) return null;

  const ok = connected === "1";
  const detail = ok
    ? "You can use it now."
    : REASON_TEXT[reason] ?? "We could not finish the connection.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-start gap-2.5 rounded-lg border border-edge bg-surface px-3.5 py-3 text-[13px]"
    >
      {ok ? (
        <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald" aria-hidden="true" />
      ) : (
        <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
      )}
      <p>
        <span className="font-semibold text-ink">
          {ok ? `${provider ?? "Tool"} connected.` : `${provider ?? "That tool"} was not connected.`}
        </span>{" "}
        <span className="text-muted">{detail}</span>
      </p>
    </div>
  );
}

function ProviderCard({
  provider,
  canManage,
  onConnect,
  onDisconnect,
  busy,
}: {
  provider: HubProvider;
  canManage: boolean;
  onConnect: (p: HubProvider) => void;
  onDisconnect: (p: HubProvider) => void;
  busy: string | null;
}) {
  const conn = provider.connection_status;
  const isBusy = busy === provider.key;

  // A provider that is not OAuth has no consent screen to send the user to.
  const isOauth = provider.auth === "oauth2";

  let tone = "text-muted";
  let badge = isOauth ? "Ready to connect" : "Ready to set up";
  if (conn.connected) {
    tone = "text-emerald";
    badge = conn.needsReconnect ? "Reconnect needed" : "Connected";
  } else if (!provider.configured) {
    tone = "text-amber";
    badge = "Needs admin setup";
  } else if (provider.status === "planned") {
    tone = "text-faint";
    badge = "Coming soon";
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{provider.name}</h3>
            {provider.recommended ? (
              <span className="rounded border border-edge bg-raised px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-label text-teal">
                Recommended
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            {provider.headline || provider.blurb}
          </p>
        </div>
        <span className={`shrink-0 text-[11px] font-semibold ${tone}`}>{badge}</span>
      </div>

      {conn.connected && conn.accountEmail ? (
        <p className="truncate text-[12px] text-ink2">{conn.accountEmail}</p>
      ) : null}

      {!isOauth && conn.setupPath ? (
        <p className="text-[12px] text-muted">
          Set up with a private link or number in{" "}
          <span className="font-semibold text-ink">Integrations</span> \u2014 no app registration needed.
        </p>
      ) : null}

      {provider.blockedOnOrg ? (
        <p className="flex items-start gap-1.5 text-[12px] text-amber">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Limited to your organisation domain until an admin widens it.</span>
        </p>
      ) : null}

      {!provider.configured && provider.missingConfigKeys.length ? (
        <p className="flex items-start gap-1.5 text-[12px] text-amber">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            An admin needs to add{" "}
            <span className="font-mono text-[11px]">{provider.missingConfigKeys.join(", ")}</span> before this
            can be connected.
          </span>
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {conn.connected ? (
          <>
            {isOauth ? (
              <button
                type="button"
                onClick={() => onConnect(provider)}
                disabled={isBusy}
                className={`inline-flex items-center gap-1.5 rounded-lg border border-edge bg-raised px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:bg-hover disabled:opacity-60 ${FOCUS}`}
              >
                {isBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Reconnect
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onDisconnect(provider)}
              disabled={isBusy}
              className={`inline-flex items-center gap-1.5 rounded-lg border border-edge bg-transparent px-3 py-1.5 text-[12.5px] font-semibold text-crimson transition hover:bg-hover disabled:opacity-60 ${FOCUS}`}
            >
              <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
              Disconnect
            </button>
          </>
        ) : provider.configured && !isOauth && conn.setupPath ? (
          // Manual providers have no OAuth handshake, so this navigates to the
          // existing form instead of POSTing to a connect route that can only
          // reject a non-oauth2 provider.
          <a
            href={conn.setupPath}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-[12.5px] font-semibold text-bg transition hover:bg-tealhi ${FOCUS}`}
          >
            <Plug className="h-3.5 w-3.5" aria-hidden="true" />
            Set up
          </a>
        ) : provider.configured ? (
          <button
            type="button"
            onClick={() => onConnect(provider)}
            disabled={isBusy}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-[12.5px] font-semibold text-bg transition hover:bg-tealhi disabled:opacity-60 ${FOCUS}`}
          >
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Plug className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {isBusy ? "Opening\u2026" : "Connect"}
          </button>
        ) : (
          <span className="text-[12px] text-faint">
            {canManage ? "Set it up in Provider credentials." : "Ask an admin to set this up."}
          </span>
        )}
      </div>
    </div>
  );
}

export default function IntegrationHubTab({ canManage = false }: { canManage?: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useHub();

  const connect = useMutation({
    mutationFn: async (p: HubProvider) => {
      const res = await fetch(`/api/integrations/${p.key}/connect`, { method: "POST" });
      const body = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(body.error ?? "We could not start the connection.");
      if (!body.authorizeUrl) throw new Error("The provider did not return an authorisation link.");
      return body.authorizeUrl as string;
    },
    onSuccess: (url) => {
      window.location.assign(url);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const disconnect = useMutation({
    mutationFn: async (p: HubProvider) => {
      const res = await fetch(`/api/integrations/${p.key}/status`, { method: "DELETE" });
      if (!res.ok) throw new Error("We could not disconnect that account.");
    },
    onSuccess: (_: void, p: HubProvider) => {
      queryClient.invalidateQueries({ queryKey: HUB_KEY });
      toast(`${p.name} disconnected.`, "success");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  if (isLoading) return <SkeletonCards />;

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-center">
        <p className="text-[13px] text-crimson">
          {error instanceof Error ? error.message : "Something went wrong."}
        </p>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: HUB_KEY })}
          className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border border-edge bg-raised px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:bg-hover ${FOCUS}`}
        >
          Try again
        </button>
      </div>
    );
  }

  const providers = data?.providers ?? [];

  if (!providers.length) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-center text-[13px] text-muted">
        No tools are available for your department yet.
      </div>
    );
  }

  const busy = connect.isPending
    ? connect.variables?.key ?? null
    : disconnect.isPending
      ? disconnect.variables?.key ?? null
      : null;

  return (
    <div>
      <Suspense fallback={null}>
        <ResultBanner />
      </Suspense>

      <p className="mb-4 text-[12.5px] text-muted">
        {data?.summary.connected ?? 0} of {data?.summary.total ?? 0} connected
        {data?.department ? ` \u00b7 ${data.department.name}` : ""}. Connect a tool once and every task, report and
        notification you own picks it up automatically.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {providers.map((p) => (
          <ProviderCard
            key={p.key}
            provider={p}
            canManage={canManage}
            busy={busy}
            onConnect={(x) => connect.mutate(x)}
            onDisconnect={(x) => disconnect.mutate(x)}
          />
        ))}
      </div>
    </div>
  );
}
