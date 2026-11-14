// GET /api/integrations/hub — what this employee can connect, and their status.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  listProviders,
  effectiveScopes,
  type ProviderDef,
} from "@/lib/integrations/registry";
import {
  isProviderConfiguredFor,
  missingConfigFor,
  missingOptionalFor,
} from "@/lib/integrations/credentials";
import { connectionsFor, type ConnectionStatus } from "@/lib/integrations/oauth";
import { departmentCatalogue } from "@/lib/integrations/departments";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    const employeeId = session.user.id;

    // Fetched first, not inside Promise.all: the department query below needs
    // employee.departmentId, so a single self-referencing destructure would be
    // an implicit-any cycle.
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        departmentId: true,
        department: { select: { slug: true, name: true } },
      },
    });

    const [status, dbDeptRows] = await Promise.all([
      connectionsFor(employeeId),
      prisma.departmentIntegration.findMany({
        where: { enabled: true, departmentId: employee?.departmentId ?? "__none__" },
        orderBy: { priority: "asc" },
      }),
    ]);

    const statusByKey = new Map<string, ConnectionStatus>(status.map((s) => [s.key, s]));
    const relevance = new Map<string, (typeof dbDeptRows)[number]>(dbDeptRows.map((r) => [r.provider, r]));
    const curated = departmentCatalogue(employee?.department?.slug ?? "leadership");

    // Config state is resolved from env OR the admin-entered row, so this
    // cannot be a plain .map anymore: collect the flags for every provider
    // first, then assemble. Keeps a single pass over the registry.
    const allProviders = listProviders();
    const configState = await Promise.all(
      allProviders.map(async (p) => ({
        p,
        configured: await isProviderConfiguredFor(p),
        missing: await missingConfigFor(p),
        advisory: await missingOptionalFor(p),
      }))
    );
    const stateByKey = new Map(configState.map((c) => [c.p.key, c]));

    const providers = allProviders.map((p: ProviderDef) => {
      const st = statusByKey.get(p.key);
      const db = relevance.get(p.key);
      const cur = curated.find((c) => c.provider === p.key);
      const priority = db?.priority ?? cur?.priority ?? 500;
      const cs = stateByKey.get(p.key)!;
      const configured = cs.configured;
      const missing = cs.missing;
      const advisory = cs.advisory;

      return {
        key: p.key,
        name: p.name,
        blurb: p.blurb,
        category: p.category,
        connection: p.connection,
        // The browser needs this to know whether "Connect" means an OAuth
        // redirect or "paste a link in settings".
        auth: p.auth,
        // An employee can only connect what the company has actually configured.
        configured,
        // The registry's own status says whether a provider is *offered*
        // ("ready") or deliberately withheld ("planned"). Whether this
        // organisation can actually connect it is decided by the environment,
        // so derive it here instead of echoing a value that can contradict
        // missingConfigKeys.
        status: p.status === "planned" ? "planned" : configured ? "ready" : "needs_config",
        declaredStatus: p.status,
        blockedOnOrg: Boolean(p.blockedOnOrg),
        // Named env keys only — never values, so this is safe for a browser.
        missingConfigKeys: missing.map((m) => m.key),
        // Advisory only: unset settings that refine behaviour, not block it.
        optionalConfigKeys: advisory.map((m) => m.key),
        defaultBundles: p.defaultBundles,
        bundles: p.bundles
          .filter((b) => !b.prerequisite)
          .map((b) => ({ id: b.id, label: b.label, description: b.description, risk: b.risk })),
        scopes: effectiveScopes(p, p.defaultBundles),
        recommended: priority <= 200,
        priority,
        headline: db?.headline ?? cur?.headline ?? "",
        whyItMatters: db?.whyItMatters ?? cur?.whyItMatters ?? "",
        connection_status: {
          connected: st?.connected ?? false,
          // Where a non-OAuth connection is actually configured, so the card
          // can link somewhere real instead of offering a dead button. These
          // are the only non-oauth2 providers, and each has its own surface.
          setupPath:
            p.auth === "oauth2"
              ? null
              : p.key === "whatsapp"
                ? "/settings?tab=whatsapp"
                : p.key === "meta_ads"
                  ? "/settings?tab=meta"
                  : "/settings?tab=integrations#integration-ical",
          needsReconnect: st?.needsReconnect ?? false,
          accountEmail: st?.accountEmail ?? null,
          grantedScopes: st?.grantedScopes ?? [],
        },
      };
    });

    providers.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

    const configuredCount = providers.filter((p) => p.configured).length;

    return NextResponse.json({
      department: employee?.department
        ? { slug: employee.department.slug, name: employee.department.name }
        : null,
      providers,
      summary: {
        total: providers.length,
        configured: configuredCount,
        awaitingCredentials: providers.length - configuredCount,
        connected: providers.filter((p) => p.connection_status.connected).length,
        recommended: providers.filter((p) => p.recommended).length,
      },
    });
  } catch (e) {
    console.error("[integrations/hub]", e);
    return NextResponse.json({ error: "Failed to load integrations" }, { status: 500 });
  }
}
