import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isPublicApiRoute } from "@/lib/apiGuard";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Public routes have their own auth mechanism - let them through
  if (isPublicApiRoute(pathname)) {
    return NextResponse.next();
  }

  // Require a valid NextAuth JWT for everything else
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
