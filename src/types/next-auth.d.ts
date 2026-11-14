import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

/**
 * Augment the session/user types so `session.user.role`, `.clientId`, and
 * `.portal` are typed everywhere. Backed by the JWT in callbacks.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** Internal seats: null. Client seats: the client they can see (P5). */
      clientId: string | null;
      portal: boolean;
      /** Attribute scoping: which department the employee belongs to. */
      departmentId: string | null;
      /** Attribute scoping: department slug (for RBAC add-ons). */
      departmentSlug: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: Role;
    clientId?: string | null;
    portal?: boolean;
    departmentId?: string | null;
    departmentSlug?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    clientId: string | null;
    portal: boolean;
    departmentId: string | null;
    departmentSlug: string | null;
  }
}