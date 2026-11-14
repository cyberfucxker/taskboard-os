import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { aiFailureMessage, runAuditedAI, type AIOptions } from "@/lib/ai-guard";
import { effectiveCapsForSession } from "@/lib/scope";
import { istDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { agent, prompt, payload } = body;

    if (!agent) {
      return NextResponse.json({ error: "Agent key is required" }, { status: 400 });
    }

    let output: Record<string, any> = {};
    let action = "manual_execution";
    let confidence = 0.95;
    let status = "succeeded";

    // anomaly / qa / digest read company-wide tasks: heads only (visibility rule, scope.ts).
    if (["anomaly", "qa", "digest"].includes(agent)) {
      const caps = await effectiveCapsForSession(session as any);
      const r = (session.user as any).role;
      if (!((r === "SUPER_ADMIN" || r === "HR" || r === "DEPARTMENT_HEAD" || r === "TEAM_LEAD" || (session.user as any).departmentSlug === "leadership") || caps.has("board.view"))) {
        return NextResponse.json({ error: "This agent reads company-wide work and is limited to heads." }, { status: 403 });
      }
    }

    // Every model call in this route goes through runAuditedAI(), which opens an
    // AgentRun row BEFORE calling the model and closes it afterwards with the
    // real model, token counts, latency, cost and failure reason. Previously
    // this route recorded a hardcoded cost (spentPaise: 12), auto-approved its
    // own output, stored no token usage, and left no row at all when the call
    // failed.
    let lastRunId: string | null = null;

    const audited = async (
      userPrompt: string,
      systemPrompt: string,
      opts: AIOptions = {}
    ): Promise<string> => {
      const res = await runAuditedAI({
        agent: String(agent),
        action,
        source: "api/ai/run",
        principalId: session.user!.id,
        inputs: payload ?? { prompt: prompt ?? null, note: "no payload supplied" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        aiOptions: opts,
        confidence,
        output: { text: "(filled in below)" },
      });
      if (!res.ok) {
        const err: any = new Error(aiFailureMessage(res.kind, res.message));
        err.status = res.kind === "budget_exhausted" || res.kind === "rate_limited" ? 429 : 503;
        err.aiKind = res.kind;
        throw err;
      }
      lastRunId = res.runId;
      return res.text;
    };

    const startTime = Date.now();

    if (agent === "lead-enrich") {
      const caps = await effectiveCapsForSession(session as any);
      if (!caps.has("crm.view")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      action = "enrich_pipeline_leads";
      // Read from the CRM; the enrichment below keeps its original stage-based signal by using
      // the lead's pipeline stage name and the CRM lead score.
      const leads = (
        await prisma.crmLead.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true, firstName: true, lastName: true, company: true, email: true, phone: true,
            leadScore: true, status: true, stage: { select: { name: true } },
          },
        })
      ).map((l) => ({
        id: l.id,
        name: `${l.firstName} ${l.lastName}`.trim(),
        company: l.company ?? "—",
        email: l.email,
        phone: l.phone || null,
        stage: l.stage?.name ?? l.status,
        score: l.leadScore || null,
      }));

      const enriched = leads.map((l) => {
        let deltaScore = 0;
        const signals: string[] = [];
        if (l.email && !l.email.endsWith("@gmail.com") && !l.email.endsWith("@yahoo.com")) {
          deltaScore += 15;
          signals.push(`corporate email: ${l.email}`);
        }
        if (l.phone) {
          deltaScore += 10;
          signals.push("direct phone available");
        }
        if (["qualified", "discovery call", "proposal sent", "negotiation"].includes(String(l.stage).toLowerCase())) {
          deltaScore += 20;
          signals.push(`active stage: ${l.stage}`);
        }
        const calculatedScore = Math.min(98, Math.max(30, (l.score ?? 50) + deltaScore));
        return { id: l.id, name: l.name, company: l.company, stage: l.stage, signals, calculatedScore };
      });

      const leadsContext = enriched
        .map((l) => `- ${l.name} (${l.company}), stage=${l.stage}, score=${l.calculatedScore}, signals=[${l.signals.join(", ")}]`)
        .join("\n");

      const aiSummary = await audited(
        `You are a B2B sales intelligence assistant. Analyze these ${leads.length} pipeline leads and produce a short executive summary (3-5 sentences) with the top 2-3 action recommendations:\n\n${leadsContext}`,
        "You are a concise, data-driven B2B sales analyst for TaskBoard OS, an Indian GaaS company serving global clients.",
        { max_tokens: 400 }
      );

      output = {
        summary: aiSummary,
        enrichedCount: leads.length,
        highIntentLeads: enriched.filter((e) => e.calculatedScore >= 75).length,
        details: enriched,
      };
      confidence = 0.94;
    } else if (agent === "anomaly") {
      action = "scan_risk_and_blockers";
      const now = new Date();

      const [overdueTasks, blockedTasks, unassignedP0] = await Promise.all([
        prisma.task.findMany({
          where: { deletedAt: null, status: { not: "DONE" }, dueDate: { lt: now } },
          select: { id: true, code: true, title: true, dueDate: true, priority: true, assignee: { select: { name: true } } },
          take: 10,
        }),
        prisma.task.findMany({
          where: { deletedAt: null, blocked: true },
          select: { id: true, code: true, title: true, blockerReason: true, blockerSev: true, assignee: { select: { name: true } } },
          take: 10,
        }),
        prisma.task.findMany({
          where: { deletedAt: null, priority: "P0", assigneeId: null, status: { not: "DONE" } },
          select: { id: true, code: true, title: true },
          take: 5,
        }),
      ]);

      const anomalies = [
        ...overdueTasks.map((t) => ({
          type: "OVERDUE_DEADLINE",
          severity: t.priority === "P0" ? "CRITICAL" : "HIGH",
          entity: `${t.code}: ${t.title}`,
          assignee: t.assignee?.name ?? "Unassigned",
          details: `Due ${t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-IN") : "past"}`,
          action: "Escalate priority or reschedule with client consent.",
        })),
        ...blockedTasks.map((t) => ({
          type: "ACTIVE_BLOCKER",
          severity: t.blockerSev === "Critical" ? "CRITICAL" : "MEDIUM",
          entity: `${t.code}: ${t.title}`,
          assignee: t.assignee?.name ?? "Unassigned",
          details: t.blockerReason || "No reason documented",
          action: "Trigger leadership nudge or unblock dependency.",
        })),
        ...unassignedP0.map((t) => ({
          type: "UNASSIGNED_CRITICAL",
          severity: "CRITICAL",
          entity: `${t.code}: ${t.title}`,
          assignee: "NONE",
          details: "P0 task with no owner",
          action: "Assign to department lead immediately.",
        })),
      ];

      const anomalyContext = anomalies
        .map((a) => `[${a.severity}] ${a.type}: ${a.entity} — assigned to ${a.assignee}. ${a.details}`)
        .join("\n");

      const aiAnalysis = await audited(
        `Analyze these ${anomalies.length} operational anomalies detected in our project management system and provide a crisp risk narrative (3-4 sentences) plus specific remediation actions for each critical item:\n\n${anomalyContext || "No anomalies found — system is clean."}`,
        "You are a delivery risk analyst for a software and services company. Be direct, actionable, and concise.",
        { max_tokens: 500 }
      );

      output = {
        summary: aiAnalysis,
        criticalCount: anomalies.filter((a) => a.severity === "CRITICAL").length,
        anomalies,
      };
      confidence = 0.98;
    } else if (agent === "qa") {
      action = "review_deliverables_and_dod";
      const completedTasks = await prisma.task.findMany({
        where: { deletedAt: null, status: "DONE" },
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: {
          assignee: { select: { name: true } },
          reports: { select: { id: true, title: true, fileName: true } },
          subtasks: { select: { id: true, title: true, done: true } },
        },
      });

      const reviews = completedTasks.map((t) => {
        const hasOutcome = Boolean(t.outcome && t.outcome.length > 10);
        const hasReports = t.reports.length > 0;
        const allSubtasksDone = t.subtasks.every((s) => s.done);
        let qaScore = 70;
        if (hasOutcome) qaScore += 15;
        if (hasReports) qaScore += 10;
        if (allSubtasksDone) qaScore += 5;

        return {
          taskCode: t.code,
          title: t.title,
          assignee: t.assignee?.name ?? "Unknown",
          qaScore: Math.min(100, qaScore),
          compliance: qaScore >= 85 ? "PASSED" : "NEEDS_ATTACHMENT_OR_OUTCOME",
          outcomeRecorded: hasOutcome,
          deliverablesCount: t.reports.length,
          subtasksDone: `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}`,
        };
      });

      const reviewContext = reviews
        .map((r) => `${r.taskCode} "${r.title}" (${r.assignee}): QA=${r.qaScore}, outcome=${r.outcomeRecorded}, deliverables=${r.deliverablesCount}, subtasks=${r.subtasksDone}`)
        .join("\n");

      const aiReview = await audited(
        `Review these ${completedTasks.length} completed deliverables and give a QA narrative (2-3 sentences) plus the top gaps to fix:\n\n${reviewContext || "No completed tasks found."}`,
        "You are a QA lead reviewing completed work for a software delivery team. Focus on documentation gaps and definition-of-done compliance.",
        { max_tokens: 400 }
      );

      output = {
        summary: aiReview,
        averageScore: reviews.length ? Math.round(reviews.reduce((a, b) => a + b.qaScore, 0) / reviews.length) : 100,
        reviews,
      };
      confidence = 0.96;
    } else if (agent === "digest") {
      action = "generate_daily_operations_digest";
      const [allTasks, employees, openP0, blocked] = await Promise.all([
        prisma.task.findMany({
          where: { deletedAt: null },
          select: { id: true, status: true, priority: true },
        }),
        prisma.employee.count({ where: { status: "ACTIVE" } }),
        prisma.task.count({ where: { deletedAt: null, priority: "P0", status: { not: "DONE" } } }),
        prisma.task.count({ where: { deletedAt: null, blocked: true } }),
      ]);

      const doneCount = allTasks.filter((t) => t.status === "DONE").length;
      const inProgressCount = allTasks.filter((t) => t.status === "IN_PROGRESS").length;
      const todoCount = allTasks.filter((t) => t.status === "TODO").length;

      const metricsContext = `Active workforce: ${employees} | Open P0 tasks: ${openP0} | Blocked tasks: ${blocked} | Tasks done: ${doneCount} | In progress: ${inProgressCount} | Todo: ${todoCount} | Date: ${new Date().toLocaleDateString("en-IN")}`;

      const aiDigest = await audited(
        `Generate a concise executive operations digest (4-6 sentences) for today based on these metrics. Include health status and key recommendations:\n\n${metricsContext}`,
        "You are an executive assistant writing a daily operations digest for a founder. Be crisp, highlight risks, and close with 2-3 actionable recommendations.",
        { max_tokens: 500 }
      );

      output = {
        summary: aiDigest,
        metrics: {
          activeWorkforce: employees,
          openP0Blockers: openP0,
          totalBlockedTasks: blocked,
          tasksCompleted: doneCount,
          tasksInProgress: inProgressCount,
          tasksTodo: todoCount,
          systemHealthStatus: openP0 === 0 && blocked <= 2 ? "OPTIMAL" : "ATTENTION_REQUIRED",
        },
      };
      confidence = 0.97;
    } else if (agent === "standup-synthesizer") {
      const caps = await effectiveCapsForSession(session as any);
      const orgWide = session.user.role === "SUPER_ADMIN" || session.user.role === "HR" || caps.has("board.view");
      action = "synthesize_team_standups";
      const today = istDayStart(new Date());

      const standups = await prisma.dailyUpdate.findMany({
        where: orgWide || !session.user.departmentId
          ? { date: today }
          : { date: today, employee: { departmentId: session.user.departmentId } },
        include: {
          employee: {
            select: {
              name: true,
              department: { select: { name: true, color: true } },
            },
          },
        },
      });

      const byDept: Record<string, { count: number; members: string[]; blockers: string[] }> = {};
      standups.forEach((s) => {
        const dName = s.employee.department?.name || "General";
        if (!byDept[dName]) byDept[dName] = { count: 0, members: [], blockers: [] };
        byDept[dName].count++;
        byDept[dName].members.push(s.employee.name);
        if (s.blockedOn) byDept[dName].blockers.push(`${s.employee.name}: ${s.blockedOn}`);
      });

      const standupContext = standups.length > 0
        ? standups.map((s) => {
            const dept = s.employee.department?.name || "General";
            return `${s.employee.name} (${dept}): today="${(s as any).today ?? ""}" blockers="${s.blockedOn ?? "none"}"`;
          }).join("\n")
        : "No standup updates submitted today.";

      const aiSynthesis = await audited(
        `Synthesize these ${standups.length} team standup updates into a cohesive leadership summary (4-6 sentences). Highlight cross-team blockers and momentum:\n\n${standupContext}`,
        "You are a delivery manager synthesizing daily standups for a leadership team. Be structured, highlight blockers prominently, and note team momentum.",
        { max_tokens: 500 }
      );

      output = {
        summary: aiSynthesis,
        standupSubmissionCount: standups.length,
        departmentBreakdown: byDept,
        topBlockersIdentified: standups.filter((s) => Boolean(s.blockedOn)).map((s) => ({
          employee: s.employee.name,
          department: s.employee.department?.name || "General",
          issue: s.blockedOn,
        })),
      };
      confidence = 0.95;
    } else {
      // Default / custom agent prompt
      action = "custom_prompt_execution";
      const customResult = await audited(
        prompt || `Run a general analysis for agent: ${agent}`,
        "You are a helpful business assistant for TaskBoard OS. Answer concisely and professionally.",
        { max_tokens: 1024 }
      );
      output = {
        summary: customResult,
        agent,
        timestamp: new Date().toISOString(),
      };
    }

    const elapsedMs = Date.now() - startTime;

    // The AgentRun row was opened and closed by runAuditedAI(). It is read back
    // here (not re-created) so there is exactly one auditable record per call,
    // carrying the real model, tokens, cost and latency.
    const run = lastRunId ? await prisma.agentRun.findUnique({ where: { id: lastRunId } }) : null;

    if (run) {
      // Store the assembled output, which is only known after the call returns.
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { output: output as any },
      });
    }

    return NextResponse.json({
      ok: true,
      run: {
        id: run?.id ?? null,
        agent: run?.agent ?? agent,
        action: run?.action ?? action,
        status: run?.status ?? status,
        confidence: run?.confidence ?? confidence,
        model: run?.model ?? null,
        costUsd: run?.costUsd != null ? run.costUsd.toString() : null,
        promptTokens: run?.promptTokens ?? 0,
        completionTokens: run?.completionTokens ?? 0,
        latencyMs: run?.latencyMs ?? elapsedMs,
        attempts: run?.attempts ?? 0,
        createdAt: run?.createdAt ?? new Date(),
        output,
        durationMs: elapsedMs,
      },
    });
  } catch (err: any) {
    // The failure is already recorded on the AgentRun row by runAuditedAI().
    // Classify the response instead of turning every failure into a 500.
    const status = Number(err?.status) || 500;
    if (status >= 500) console.error("AI run failed:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to execute agent", kind: err?.aiKind ?? "unexpected" },
      { status }
    );
  }
}
