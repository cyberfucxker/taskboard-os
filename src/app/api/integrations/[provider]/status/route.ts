// GET/DELETE /api/integrations/[provider]/status
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectionsFor, disconnect, getValidAccessToken } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { provider: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const all = await connectionsFor(session.user.id);
    const status = all.find((c) => c.key === params.provider.toLowerCase());
    if (!status) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
    return NextResponse.json(status);
  } catch (e) {
    console.error("[integrations/status]", e);
    return NextResponse.json({ error: "Failed to read status" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { provider: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    await disconnect(session.user.id, params.provider.toLowerCase());
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[integrations/disconnect]", e);
    return NextResponse.json({ error: "Could not disconnect" }, { status: 500 });
  }
}
