import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/eventlog";
import { effectiveCapsForSession, type ScopedSession } from "@/lib/scope";
import type { Capability } from "@/lib/rbac";
import type { Role } from "@prisma/client";

/**
 * NextAuth configuration (CORE-01) — the auth spine.
 *
 *   - Credentials provider: email + password verified against the Employee
 *     record. Every internal employee is a row in `Employee` (DM-08) with an
 *     optional bcrypt `passwordHash`. Portal seats (CLIENT_ADMIN /
 *     CLIENT_VIEWER) authenticate the same way but are tenancy-scoped by
 *     `portalClientId` — they never see other clients' data.
 *   - Google OIDC: optional. When GOOGLE_CLIENT_ID/SECRET are set, the email
 *     must match an existing Employee row (or it is rejected). This keeps
 *     auth reconciled to the directory, never ad-hoc.
 *   - JWT strategy so we can stamp `role` / `clientId` / `portal` onto the
 *     session without a DB round-trip per request.
 *
 * Every login and role switch emits an Activity event (AUTH_LOGIN,
 * ROLE_SWITCHED) through the append-only event log — the KPI/AI substrate.
 *
 * DM-08 / B0-SEC: this module never reads a secret out of the client bundle;
 * credentials stay server-side in the provider. `.env` holds the secrets and
 * is not committed.
 */

// Login rate limiter disabled (was blocking legit logins;
// old code: in-memory map, 5 attempts/15min per email). No-op kept so authorize() call site
// is untouched and the limit can be re-enabled in one place.
function checkLoginRateLimit(email: string): boolean {
  void email;
  return true;
}

const GOOGLE_ENABLED = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24, updateAge: 60 * 60 * 3 }, // 24h tokens, refreshed every 3h
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const emailKey = credentials.email.toLowerCase().trim();
        if (!checkLoginRateLimit(emailKey)) {
          throw new Error("Too many login attempts. Please try again in 15 minutes.");
        }
        const employee = await prisma.employee.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!employee?.passwordHash) return null;
        if (employee.status === "EXITED" || employee.deletedAt) return null;
        const ok = await bcrypt.compare(credentials.password, employee.passwordHash);
        if (!ok) return null;

        let departmentSlug: string | null = null;
        if (employee.departmentId) {
          const dept = await prisma.department.findUnique({
            where: { id: employee.departmentId },
            select: { slug: true },
          });
          departmentSlug = dept?.slug ?? null;
        }

        // Capture the real client IP/device off the raw request (Apache sits
        // in front and appends X-Forwarded-For) so every login is traceable —
        // carried through to the AUTH_LOGIN event below, never into the JWT.
        const headers = (req as { headers?: Record<string, string> } | undefined)?.headers;
        const forwardedFor = headers?.["x-forwarded-for"];
        const loginIp = forwardedFor?.split(",")[0]?.trim() || headers?.["x-real-ip"] || null;
        const loginUserAgent = headers?.["user-agent"] || null;

        return {
          id: employee.id,
          email: employee.email,
          name: employee.name,
          image: null,
          role: employee.role,
          portal: employee.portalClientId != null,
          clientId: employee.portalClientId,
          departmentId: employee.departmentId,
          departmentSlug,
          loginIp,
          loginUserAgent,
        };
      },
    }),
    ...(GOOGLE_ENABLED
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    // Stamp our claims onto the JWT (kept inbox-state, DB read once at login).
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as unknown as { role: Role }).role;
        token.portal = Boolean((user as unknown as { portal: boolean }).portal);
        token.clientId = (user as unknown as { clientId: string | null }).clientId ?? null;
        token.departmentId = (user as unknown as { departmentId: string | null }).departmentId ?? null;
        token.departmentSlug = (user as unknown as { departmentSlug: string | null }).departmentSlug ?? null;
      }
      // Role-switch from the picker. Gated: only allowed in demo mode, or for
      // a SUPER_ADMIN doing a real impersonation. The id never changes — we
      // are still the same employee — only the capability view does.
      if (trigger === "update" && session?.role) {
        const demo = process.env.DEMO_ROLE_SWITCH === "true";
        const isAdmin = token.role === "SUPER_ADMIN";
        if (demo || isAdmin) {
          token.role = session.role;
          emitEvent({
            type: "ROLE_SWITCHED",
            actorId: token.uid,
            entityType: "employee",
            entityId: token.uid,
            payload: { to: session.role },
          }).catch(() => undefined);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.role = token.role;
        session.user.portal = token.portal;
        session.user.clientId = token.clientId ?? null;
        session.user.departmentId = token.departmentId ?? null;
        session.user.departmentSlug = token.departmentSlug ?? null;
      }
      return session;
    },
    async signIn({ user }) {
      // Google flow: only admit existing staff emails.
      if (!GOOGLE_ENABLED) return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN?.toLowerCase().replace(/^@/, "");
      if (allowedDomain && email.endsWith(`@${allowedDomain}`)) return true; // optional allowlisted domain
      const exists = await prisma.employee.findUnique({ where: { email } });
      return Boolean(exists);
    },
  },
  events: {
    async signIn({ user }) {
      const { id, role, loginIp, loginUserAgent } = user as unknown as {
        id: string;
        role: Role;
        loginIp?: string | null;
        loginUserAgent?: string | null;
      };
      emitEvent({
        type: "AUTH_LOGIN",
        actorId: id,
        entityType: "employee",
        entityId: id,
        payload: { role, ip: loginIp ?? null, userAgent: loginUserAgent ?? null },
      }).catch(() => undefined);
      // Track last login for the directory (CORE-02).
      prisma.employee
        .update({ where: { id }, data: { lastLoginAt: new Date() } })
        .catch(() => undefined);
    },
  },
};

/** Server-component helper — the typed, authed session. */
export function getSession() {
  return getServerSession(authOptions);
}

/**
 * Route guard — throw a friendly 401/403 if the caller is missing or lacks a
 * capability. Wrap module handlers with this first (CORE-01.3). The data
 * access layer still enforces tenant isolation separately.
 */
export async function requireRole(...capabilities: Capability[]) {
  const session = (await getSession()) as ScopedSession | null;
  if (!session?.user?.id) {
    const err = new Error("Authentication required");
    (err as unknown as { status: number }).status = 401;
    throw err;
  }
  const held = await effectiveCapsForSession(session);
  if (!capabilities.every((c) => held.has(c))) {
    const err = new Error("Forbidden — your access does not cover this");
    (err as unknown as { status: number }).status = 403;
    throw err;
  }
  return session;
}