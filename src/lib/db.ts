import { PrismaClient } from "@prisma/client";
import { realtimeExtension } from "@/lib/realtime";

/**
 * Prisma client singleton.
 *
 * In development, Next.js hot-reloads can create a new PrismaClient per
 * recompile, exhausting Postgres connections. We stash the client on
 * `globalThis` so it survives reloads. In production there is a single
 * instance.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  // Extended so every write announces a realtime change (src/lib/realtime.ts). Cast back to
  // PrismaClient: the extension adds no methods, and the rest of the app types against it.
  (() => {
    const client = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
    // Server only: this module is also pulled into some browser bundles through shared imports,
    // where extending the client would throw and crash the page.
    return (typeof window === "undefined" ? client.$extends(realtimeExtension) : client) as unknown as PrismaClient;
  })();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

let cachedOrgId: string | null = null;

/** TaskBoard OS is single-tenant today; this resolves the one Org row and caches it. */
export async function getOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const org = await prisma.org.findFirst({ select: { id: true } });
  if (!org) throw new Error("No Org row found");
  cachedOrgId = org.id;
  return cachedOrgId;
}
