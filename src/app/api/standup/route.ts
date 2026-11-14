import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStandupFeed, submitStandup } from "@/lib/standup";

export const dynamic = "force-dynamic";

/** GET /api/standup?date=YYYY-MM-DD — today's standup feed (scoped by role). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  const feed = await getStandupFeed(session as any, date);
  return NextResponse.json({ data: feed });
}

/** POST /api/standup — submit or update today's standup. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await submitStandup(session.user.id, {
    did: body.did || null,
    doing: body.doing || null,
    blockedOn: body.blockedOn || body.blocked || null,
  });
  return NextResponse.json({ data: result });
}
