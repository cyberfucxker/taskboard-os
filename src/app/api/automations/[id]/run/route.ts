import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { createTask } from "@/lib/tasks";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { aiFailureMessage, runAuditedAI } from "@/lib/ai-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/automations/[id]/run — manually trigger an automation.
 * Executes all actions in sequence, saves AutomationRun record.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("tasks.view");
    const automation = await prisma.automation.findUnique({
      where: { id: params.id },
    });

    if (!automation) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (!automation.isActive) return NextResponse.json({ ok: false, error: "Automation is inactive" }, { status: 400 });

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    // Same department the automation itself belongs to, not "a department
    // head of ANY department" — otherwise a Sales dept head could execute a
    // Dev automation's real actions (WhatsApp sends, task/lead writes,
    // arbitrary webhook calls). TEAM_LEAD included too, matching the GET/POST
    // scoping on this same resource (see /api/automations/route.ts).
    const isDeptLead = ["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD"].includes(session.user.role);
    const sameDept = Boolean(automation.departmentId) && automation.departmentId === session.user.departmentId;
    const isOwner = automation.createdById === session.user.id;

    if (!isOwner && automation.scope === "personal") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (automation.scope === "department" && !isSuperAdmin && !(isDeptLead && sameDept) && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (automation.scope === "global" && !isSuperAdmin && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const actions = automation.actions as any[];
    const results: any[] = [];
    let hasError = false;

    for (const action of actions) {
      try {
        const result = await executeAction(action, automation, session);
        results.push({ type: action.type, ok: true, result });
      } catch (e) {
        hasError = true;
        results.push({ type: action.type, ok: false, error: (e as Error).message });
      }
    }

    const status = hasError
      ? results.some((r) => r.ok) ? "partial" : "failed"
      : "success";

    const [run] = await prisma.$transaction([
      prisma.automationRun.create({
        data: {
          automationId: automation.id,
          triggeredBy: session.user.id,
          status,
          result: results as any,
        },
      }),
      prisma.automation.update({
        where: { id: automation.id },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true, status, results, runId: run.id });
  } catch (err) {
    const code = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: code });
  }
}

async function executeAction(action: any, automation: any, session: any): Promise<any> {
  switch (action.type) {
    case "send_whatsapp": {
      const { to, message } = action.config;
      if (!to || !message) throw new Error("send_whatsapp needs both 'to' and 'message'");
      const result = await sendWhatsAppMessage(to, message);
      return { sent: true, to, messageId: result.messageId };
    }

    case "create_task": {
      const { title, assigneeId, priority, dueDaysFromNow } = action.config;
      const due = dueDaysFromNow
        ? new Date(Date.now() + Number(dueDaysFromNow) * 86400000)
        : undefined;

      const task = await createTask({
        title: title ?? `Auto-task from ${automation.name}`,
        priority: priority ?? "P2",
        assigneeId: assigneeId || null,
        dueDate: due ? due.toISOString().slice(0, 10) : null,
        creatorId: session.user.id,
        canAssign: true,
      });
      return { taskId: task.id, code: task.code };
    }

    case "send_email": {
      // No SMTP/SendGrid provider is wired up yet (SMTP_HOST is empty in .env).
      // Fail clearly instead of reporting a message that was never sent.
      throw new Error(
        "Email sending is not configured yet. Add SMTP credentials to .env and wire src/lib/email.ts, or use send_whatsapp instead."
      );
    }

    case "call_ai": {
      const { prompt } = action.config;
      if (!prompt) throw new Error("call_ai needs a 'prompt'");
      const run = await runAuditedAI({
        agent: "automation",
        action: `call_ai:${automation.id}`,
        source: "automations/run",
        principalId: session.user.id,
        inputs: { automationId: automation.id, automationName: automation.name, prompt },
        messages: [
          { role: "system", content: `You are an automation step inside TaskBoard OS, triggered by the automation "${automation.name}". Produce a short, direct, usable output — not a description of what you would do.` },
          { role: "user", content: prompt },
        ],
      });
      if (!run.ok) {
        throw new Error(aiFailureMessage(run.kind, run.message));
      }
      return {
        called: true,
        prompt: prompt.slice(0, 100),
        reply: run.text,
        runId: run.runId,
        costUsd: run.result.usage.costUsd,
        totalTokens: run.result.usage.totalTokens,
      };
    }

    case "update_field": {
      const { entity, entityId, field, value } = action.config;
      if (!entity || !entityId || !field) {
        throw new Error("update_field needs 'entity', 'entityId', and 'field'");
      }

      // Only a small, explicitly-safe whitelist per entity — anything else
      // fails clearly rather than silently reporting success on a no-op.
      const TASK_FIELDS = new Set(["title", "priority", "status", "dueDate", "description"]);
      // Lead fields are the CRM's (CrmLead, ported from the legacy CRM). Stage moves are not here on
      // purpose: they must go through the CRM so stage history and automations fire.
      const LEAD_FIELDS = new Set(["status", "priority", "leadScore", "nextFollowUpAt", "notes", "budgetRange", "requirement"]);

      if (entity === "task") {
        if (!TASK_FIELDS.has(field)) {
          throw new Error(`update_field: '${field}' is not an allowed Task field (allowed: ${[...TASK_FIELDS].join(", ")})`);
        }
        await prisma.task.update({ where: { id: entityId }, data: { [field]: value } });
        return { updated: true, entity, entityId, field, value };
      }

      if (entity === "lead") {
        if (!LEAD_FIELDS.has(field)) {
          throw new Error(`update_field: '${field}' is not an allowed Lead field (allowed: ${[...LEAD_FIELDS].join(", ")})`);
        }
        await prisma.crmLead.update({ where: { id: entityId }, data: { [field]: value } });
        await prisma.crmActivity.create({
          data: { leadId: entityId, type: "updated", description: `Automation set ${field}.`, userName: "TaskBoard automation" },
        });
        return { updated: true, entity, entityId, field, value };
      }

      throw new Error(`update_field: entity '${entity}' is not supported yet (only 'task' and 'lead' are wired up)`);
    }

    case "assign_task": {
      const { taskId, assigneeId } = action.config;
      if (taskId && assigneeId) {
        await prisma.task.update({
          where: { id: taskId },
          data: { assigneeId },
        });
      }
      return { assigned: true, taskId, assigneeId };
    }

    case "webhook": {
      const { url, method = "POST", payload } = action.config;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      return { status: res.status, ok: res.ok };
    }

    default:
      return { skipped: true, type: action.type };
  }
}
