"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, KeyRound, Loader2, TriangleAlert, X } from "lucide-react";
import { useToast } from "@/components/Toast";

type ConfigKeyStatus = {
  key: string;
  label: string;
  secret: boolean;
  optional: boolean;
  help?: string;
  set: boolean;
  source: "env" | "database" | null;
  hint: string | null;
};

type ProviderConfigStatus = {
  provider: string;
  name: string;
  configured: boolean;
  keys: ConfigKeyStatus[];
  missingKeys: string[];
};

const KEY = ["integrations", "provider-config"] as const;

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tealhi focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

async function load(): Promise<ProviderConfigStatus[]> {
  const res = await fetch("/api/integrations/provider-config", { cache: "no-store" });
  if (res.status === 401) throw new Error("Your session expired. Sign in again.");
  if (res.status === 403) throw new Error("You do not have access to provider credentials.");
  if (!res.ok) throw new Error("Could not load provider configuration.");
  const body = await res.json();
  return body.providers ?? [];
}

function KeyField({
  meta,
  value,
  onChange,
  reveal,
  onToggleReveal,
}: {
  meta: ConfigKeyStatus;
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  onToggleReveal: () => void;
}) {
  const id = `cfg-${meta.key}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12px] font-semibold text-ink">
          {meta.label}
          {meta.optional ? <span className="ml-1.5 text-[11px] font-normal text-faint">optional</span> : null}
        </label>
        {meta.set ? (
          <span className="flex items-center gap-1.5 text-[11px]">
            <span className={meta.source === "env" ? "text-faint" : "text-emerald"}>
              {meta.source === "env" ? "set in environment" : "set"}
            </span>
            {meta.hint ? (
              <span className="font-mono text-[10.5px] text-muted">{meta.hint}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-[11px] text-amber">not set</span>
        )}
      </div>

      {meta.help ? <p className="mt-0.5 text-[11px] text-muted">{meta.help}</p> : null}

      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={id}
          type={meta.secret && !reveal ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={meta.set ? "Leave blank to keep the stored value" : meta.key}
          autoComplete="off"
          spellCheck={false}
          disabled={meta.source === "env"}
          className={`w-full rounded-lg border border-line bg-raised px-3 py-2 font-mono text-[12px] text-ink placeholder:text-faint focus:border-tealhi ${FOCUS} disabled:opacity-60`}
        />
        {meta.secret ? (
          <button
            type="button"
            onClick={onToggleReveal}
            aria-label={reveal ? `Hide ${meta.label}` : `Reveal ${meta.label} as you type`}
            className={`shrink-0 rounded-lg border border-line bg-raised p-2 text-muted transition hover:bg-hover hover:text-ink ${FOCUS}`}
          >
            {reveal ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        ) : null}
      </div>

      {meta.source === "env" ? (
        <p className="mt-1 text-[11px] text-faint">Managed by the host environment. Remove it there to change it here.</p>
      ) : null}
    </div>
  );
}

function ProviderCard({ meta }: { meta: ProviderConfigStatus }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [clearing, setClearing] = useState<string | null>(null);

  const dirty = Object.values(values).some((v) => v.trim() !== "");

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v.trim() !== "") payload[k] = v.trim();
      }
      const res = await fetch("/api/integrations/provider-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: meta.provider, values: payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      return body as { saved: string[] };
    },
    onSuccess: (body) => {
      setValues({});
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["integrations", "hub"] });
      toast(`${meta.name} credentials saved.`, "success");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const clear = useMutation({
    mutationFn: async (key: string) => {
      const res = await fetch(`/api/integrations/provider-config?provider=${meta.provider}&key=${key}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not clear.");
    },
    onSuccess: (_: void, key: string) => {
      setValues((v) => ({ ...v, [key]: "" }));
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["integrations", "hub"] });
      toast("Value cleared.", "success");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const hasKeys = meta.keys.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{meta.name}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-muted">{meta.provider}</p>
        </div>
        <span className={`shrink-0 text-[11px] font-semibold ${meta.configured ? "text-emerald" : "text-amber"}`}>
          {meta.configured ? "Ready" : `Missing ${meta.missingKeys.length}`}
        </span>
      </div>

      {!hasKeys ? (
        <p className="text-[12px] text-faint">This provider needs no credentials.</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {meta.keys.map((k) => (
            <div key={k.key}>
              <KeyField
                meta={k}
                value={values[k.key] ?? ""}
                onChange={(v) => setValues((s) => ({ ...s, [k.key]: v }))}
                reveal={Boolean(reveal[k.key])}
                onToggleReveal={() => setReveal((r) => ({ ...r, [k.key]: !r[k.key] }))}
              />
              {k.set && k.source === "database" ? (
                <button
                  type="button"
                  onClick={() => {
                    setClearing(k.key);
                    clear.mutate(k.key, { onSettled: () => setClearing(null) });
                  }}
                  disabled={clear.isPending && clearing === k.key}
                  className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-crimson transition hover:underline ${FOCUS}`}
                >
                  {clear.isPending && clearing === k.key ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <X className="h-3 w-3" aria-hidden="true" />
                  )}
                  Clear {k.label}
                </button>
              ) : null}
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-[12.5px] font-semibold text-bg transition hover:bg-tealhi disabled:opacity-60 ${FOCUS}`}
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {save.isPending ? "Saving\u2026" : "Save"}
            </button>
            {dirty ? (
              <button
                type="button"
                onClick={() => setValues({})}
                className={`rounded-lg border border-line bg-raised px-3 py-1.5 text-[12.5px] font-semibold text-muted transition hover:bg-hover hover:text-ink ${FOCUS}`}
              >
                Discard
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProviderCredentialsTab() {
  const { data, isLoading, error } = useQuery<ProviderConfigStatus[]>({
    queryKey: KEY,
    queryFn: load,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-busy="true" aria-label="Loading credentials">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[220px] animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-center">
        <p className="text-[13px] text-crimson">{error instanceof Error ? error.message : "Something went wrong."}</p>
      </div>
    );
  }

  const providers = data ?? [];
  const ready = providers.filter((p) => p.configured).length;

  return (
    <div>
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-[12.5px] text-muted">
        <KeyRound className="mt-px h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
        <p>
          Register an OAuth app with each provider, then paste its client ID and secret here once. Values marked
          secret are encrypted before they are stored and are never shown again. A key already set in the
          server environment always wins and is shown read-only.
        </p>
      </div>

      <p className="mb-4 text-[12.5px] text-muted">
        {ready} of {providers.length} providers ready. Employees can connect a tool as soon as its required keys
        are set.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {providers.map((p) => (
          <ProviderCard key={p.provider} meta={p} />
        ))}
      </div>

      {providers.some((p) => !p.configured) ? (
        <p className="mt-4 flex items-start gap-1.5 text-[12px] text-amber">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Employees see the unconfigured tools greyed out with the exact keys that are missing.</span>
        </p>
      ) : null}
    </div>
  );
}
