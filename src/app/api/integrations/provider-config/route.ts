// GET/POST/DELETE /api/integrations/provider-config
//
// Organisation-wide OAuth app credentials, entered by an admin instead of by
// editing the environment on the host.
//
// SECURITY CONTRACT, in order of importance:
//   - Admin-only. A 403 for everyone else, checked server side on every method.
//   - A stored secret is never returned. GET reports booleans, a source, and a
//     masked last-4 hint. A secret's plaintext exists only in the request that
//     set it and inside the vault envelope in the database.
//   - Secrets are encrypted at rest with the vault, bound to the provider, so a
//     row copied between providers fails to decrypt.
//   - Writes are validated against the registry: an unknown provider or an
//     unknown config key is rejected rather than stored.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProvider } from "@/lib/integrations/registry";
import {
  providerConfigStatus,
  saveProviderCredentials,
  invalidateCredentialCache,
} from "@/lib/integrations/credentials";

export const dynamic = "force-dynamic";

/** Mirrors the role gate the other system-integration writes already use. */
function isAdmin(role: string | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "DEPARTMENT_HEAD";
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden. Administrative privileges required." }, { status: 403 });
    }

    const providers = await providerConfigStatus();
    return NextResponse.json({ providers });
  } catch (e) {
    console.error("[integrations/provider-config GET]", e);
    return NextResponse.json({ error: "Failed to read provider configuration" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden. Administrative privileges required." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const provider = typeof body?.provider === "string" ? body.provider.toLowerCase() : "";
    if (!provider || !getProvider(provider)) {
      return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }

    const def = getProvider(provider)!;
    const known = new Set(def.requiredConfig.map((c) => c.key));
    const values: Record<string, string | undefined> = {};

    for (const [k, v] of Object.entries((body?.values ?? {}) as Record<string, unknown>)) {
      if (!known.has(k)) continue; // silently ignore, never store an unknown key
      if (typeof v !== "string") continue;
      // Bound the size so a pasted file cannot bloat the row.
      if (v.length > 4096) {
        return NextResponse.json({ error: `${k} is too long` }, { status: 400 });
      }
      values[k] = v;
    }

    const result = await saveProviderCredentials(provider, values);
    invalidateCredentialCache(provider);

    return NextResponse.json({ ok: true, ...result, providers: await providerConfigStatus() });
  } catch (e) {
    console.error("[integrations/provider-config POST]", e);
    return NextResponse.json({ error: "Failed to save provider configuration" }, { status: 500 });
  }
}

/** Clear one key (or every key for a provider) without deleting the row. */
export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden. Administrative privileges required." }, { status: 403 });
    }

    const url = new URL(req.url);
    const provider = (url.searchParams.get("provider") ?? "").toLowerCase();
    if (!provider || !getProvider(provider)) {
      return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }

    const def = getProvider(provider)!;
    const one = url.searchParams.get("key");
    const toClear: Record<string, string> = {};

    if (one) {
      if (!def.requiredConfig.some((c) => c.key === one)) {
        return NextResponse.json({ error: "Unknown config key" }, { status: 400 });
      }
      toClear[one] = "";
    } else {
      for (const c of def.requiredConfig) toClear[c.key] = "";
    }

    const result = await saveProviderCredentials(provider, toClear);
    invalidateCredentialCache(provider);
    return NextResponse.json({ ok: true, ...result, providers: await providerConfigStatus() });
  } catch (e) {
    console.error("[integrations/provider-config DELETE]", e);
    return NextResponse.json({ error: "Failed to clear provider configuration" }, { status: 500 });
  }
}
