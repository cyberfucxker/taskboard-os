import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * POST /api/integrations/test-whatsapp
 * Sends a test WhatsApp message via Meta Cloud API.
 * Body: { phone: string, token: string, phoneNumberId: string }
 * Requires SUPER_ADMIN or DEPARTMENT_HEAD role.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role as string;
  if (role !== "SUPER_ADMIN" && role !== "DEPARTMENT_HEAD") {
    return NextResponse.json({ error: "Forbidden — requires SUPER_ADMIN or DEPARTMENT_HEAD" }, { status: 403 });
  }

  let body: { phone?: string; token?: string; phoneNumberId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { phone, token, phoneNumberId } = body;

  if (!phone || !token || !phoneNumberId) {
    return NextResponse.json(
      { error: "Missing required fields: phone, token, phoneNumberId" },
      { status: 400 }
    );
  }

  // Normalize phone: strip leading + and spaces
  const normalizedPhone = phone.replace(/^\+/, "").replace(/\s/g, "");

  const metaUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "text",
    text: {
      body: "✅ This is a test message from TaskBoard OS. Your WhatsApp Business API is configured correctly.",
    },
  };

  try {
    const metaRes = await fetch(metaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const metaData = await metaRes.json();

    if (!metaRes.ok) {
      const errMsg =
        metaData?.error?.message ||
        metaData?.error?.error_data?.details ||
        "Meta API returned an error";
      return NextResponse.json(
        { ok: false, error: errMsg, meta: metaData },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, meta: metaData });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
