import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { verifyMetaSignature } from "@/lib/meta-webhook-auth";
import { resolveConfigValue } from "@/lib/integrations/credentials";
import { crmSourceFor, placementFor } from "@/lib/crm/bridge";
import { nameParts, phoneKeys } from "@/lib/leads/normalize";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks/whatsapp
 * WhatsApp Webhook verification handshake.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  // An unset verify token must never match an unset query param.
  if (mode === "subscribe" && !!verifyToken && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
}

/**
 * POST /api/webhooks/whatsapp
 * Ingest WhatsApp client inquiries or execute employee WhatsApp commands (e.g. /log 30m TSK-101, /tasks, /done).
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    // Same provider row the leads webhook reads, so saving the App Secret in
    // the admin UI is enough to switch both endpoints on.
    const appSecret = await resolveConfigValue("meta_ads", "META_APP_SECRET");
    const signature = verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret);
    if (!signature.ok) {
      console.error("WhatsApp webhook rejected:", signature.reason);
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }
    const body = JSON.parse(rawBody);

    // Parse incoming messages from WhatsApp Cloud API
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];
    const contact = changes?.contacts?.[0];

    if (!message) {
      return NextResponse.json({ ok: true, status: "no_message" });
    }

    const fromPhone = message.from; // e.g. 919876543210
    const text = message.text?.body?.trim() || "";
    const senderName = contact?.profile?.name || `WhatsApp Contact (+${fromPhone})`;

    // Check if this phone belongs to an internal employee
    const employee = await prisma.employee.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { personalPhone: { contains: fromPhone.slice(-10) } },
          { emergencyContactPhone: { contains: fromPhone.slice(-10) } }
        ]
      }
    });

    // The `reply` field returned below was never actually sent anywhere —
    // WhatsApp webhooks are one-way (Meta -> server); a reply requires its
    // own outbound Graph API call. Every /log and /done command, success OR
    // failure, has been silently doing nothing visible on the employee's
    // phone. Now uses the real sendWhatsAppMessage() helper (built earlier
    // tonight for Automations) so a reply actually arrives, and failures
    // (bad task code, WhatsApp not configured) are reported too instead of
    // just falling through to a bare {ok:true}.
    async function reply(text: string) {
      try {
        await sendWhatsAppMessage(fromPhone, text);
      } catch {
        // Best-effort — WhatsApp send may not be configured yet; don't fail
        // the webhook response over it (Meta only cares about our 200 OK).
      }
    }

    if (employee && text.startsWith("/")) {
      // It's an internal employee bot command:
      // Command 1: /log <mins> <taskCode> <note>
      if (text.startsWith("/log")) {
        const parts = text.split(" ");
        const mins = parseInt(parts[1]?.replace("m", "") || "30", 10);
        const code = parts[2]?.toUpperCase();
        const note = parts.slice(3).join(" ") || "Logged via WhatsApp";

        if (code) {
          const task = await prisma.task.findFirst({
            where: { code, deletedAt: null }
          });
          if (task) {
            const ms = mins * 60 * 1000;
            await (prisma as any).taskWorkSession.create({
              data: {
                taskId: task.id,
                assigneeId: employee.id,
                elapsedSec: Math.round(ms / 1000),
                startedAt: new Date(Date.now() - ms),
                endedAt: new Date(),
                note
              }
            });
            await reply(`Logged ${mins}m on ${task.code}`);
            return NextResponse.json({ ok: true, reply: `Logged ${mins}m on ${task.code}` });
          }
          await reply(`Couldn't find a task with code ${code}. Check the code and try again.`);
          return NextResponse.json({ ok: true, status: "task_not_found" });
        }
        await reply(`Usage: /log <minutes>m <taskCode> <note>`);
        return NextResponse.json({ ok: true, status: "bad_command" });
      }

      // Command 2: /done <taskCode> <outcome>
      if (text.startsWith("/done")) {
        const parts = text.split(" ");
        const code = parts[1]?.toUpperCase();
        const outcome = parts.slice(2).join(" ") || "Completed via WhatsApp";

        if (code) {
          const task = await prisma.task.findFirst({ where: { code, deletedAt: null } });
          if (task) {
            await prisma.task.update({
              where: { id: task.id },
              data: { status: "DONE", completedAt: new Date(), outcome }
            });
            await reply(`Task ${task.code} marked DONE!`);
            return NextResponse.json({ ok: true, reply: `Task ${task.code} marked DONE!` });
          }
          await reply(`Couldn't find a task with code ${code}. Check the code and try again.`);
          return NextResponse.json({ ok: true, status: "task_not_found" });
        }
        await reply(`Usage: /done <taskCode> <outcome>`);
        return NextResponse.json({ ok: true, status: "bad_command" });
      }

      // Unrecognized slash command
      await reply(`Unrecognized command "${text.split(" ")[0]}". Try /log or /done.`);
      return NextResponse.json({ ok: true, status: "unrecognized_command" });
    } else {
      // It's an external client lead or inquiry via WhatsApp — it belongs in the CRM.
      // Matched on the normalised phone keys (both sides normalised, as the importer does),
      // so "+91 98765 43210" and "919876543210" are the same person.
      const keys = phoneKeys(fromPhone);
      const existingLead = keys.length
        ? await prisma.crmLead.findFirst({ where: { phoneNormalized: { in: keys } }, select: { id: true } })
        : null;

      if (existingLead) {
        await prisma.crmActivity.create({
          data: {
            leadId: existingLead.id,
            type: "whatsapp_received",
            description: `WhatsApp message: "${text.slice(0, 200)}"`,
          },
        });
      } else {
        const place = await placementFor("NEW");
        const { firstName, lastName } = nameParts(senderName);
        const created = await prisma.crmLead.create({
          data: {
            firstName: firstName || "WhatsApp contact",
            lastName,
            phone: `+${fromPhone}`,
            phoneNormalized: keys[0] ?? null,
            source: crmSourceFor("WHATSAPP"),
            pipelineId: place.pipelineId,
            pipelineStageId: place.pipelineStageId,
            stageEnteredAt: new Date(),
            status: place.status,
            notes: `Inquiry: "${text.slice(0, 500)}"`,
          },
        });
        await prisma.crmActivity.create({
          data: {
            leadId: created.id,
            type: "created",
            description: `Lead "${`${created.firstName} ${created.lastName}`.trim()}" created from an inbound WhatsApp message.`,
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
