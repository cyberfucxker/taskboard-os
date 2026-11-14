import { scopedTaskWhere } from "@/lib/scope";
import type { Prisma } from "@prisma/client";
// POST /api/insight/ask — the company dashboard, in plain language.
// Answers are computed from real data first. The model only narrates a
// pre-computed fact set, so an answer can never invent a number that is not in
// `facts` — and if the model is unavailable the endpoint still answers.
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { aiJson } from "@/lib/ai";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 10 * 60_000;

const AnswerSchema = z.object({
  headline: z.string().max(200),
  answer: z.string().max(1200),
  // No `.default()`: aiJson's schema parameter is z.ZodType<T>, which forces
  // the input and output types to match. A default makes the input optional,
  // the two types diverge, and the schema stops being assignable. A model that
  // omits these keys now fails validation and takes the computed-facts path.
  highlights: z.array(z.string().max(200)).max(6),
  risks: z.array(z.string().max(200)).max(6),
});

type Answer = z.infer<typeof AnswerSchema>;

/** What actually goes in InsightCache.answerJson. */
type CachedAnswer = {
  answer: Answer;
  facts: Record<string, unknown>;
  aiUnavailable: boolean;
};

type Intent =
  | "dev_attribution"
  | "marketing_performance"
  | "overdue_work"
  | "company_health"
  | "unknown";

function classify(question: string): Intent {
  const q = question.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => q.includes(w));
  if (
    has("who committed", "which dev", "who worked", "contribution", "commit",
        "code written", "who built", "developer activity", "github")
  ) return "dev_attribution";
  if (
    has("marketing", "campaign", "seo", "traffic", "ranking", "client performance",
        "how are projects", "project performance", "how's marketing")
  ) return "marketing_performance";
  if (has("overdue", "late", "behind", "at risk", "slipping", "deadline"))
    return "overdue_work";
  if (has("company", "overview", "summary", "everything", "dashboard", "health", "how are we"))
    return "company_health";
  return "unknown";
}

async function buildFacts(intent: Intent, tw: Prisma.TaskWhereInput = {}): Promise<Record<string, unknown>> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86400_000);

  const [tasks, projects, people, hours, blocked, overdue, inReview] = await Promise.all([
    prisma.task.count({ where: { ...tw, deletedAt: null } }),
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.employee.count({ where: { status: "ACTIVE" } }),
    prisma.taskWorkSession.aggregate({
      where: { startedAt: { gte: weekAgo } },
      _sum: { elapsedSec: true },
      _count: true,
    }),
    prisma.task.count({ where: { ...tw, deletedAt: null, status: "BLOCKED" } }),
    prisma.task.count({ where: { ...tw, deletedAt: null, dueDate: { lt: new Date(now) }, status: { not: "DONE" } } }),
    prisma.task.count({ where: { ...tw, deletedAt: null, status: "IN_REVIEW" } }),
  ]);

  const base: Record<string, unknown> = {
    asOf: new Date().toISOString(),
    activePeople: people,
    liveProjects: projects,
    totalTasks: tasks,
    blockedTasks: blocked,
    overdueTasks: overdue,
    tasksInReview: inReview,
    hoursLoggedLast7Days: Math.round(((hours._sum.elapsedSec ?? 0) / 3600) * 10) / 10,
    workSessionsLast7Days: hours._count,
  };

  if (intent === "dev_attribution") {
    const byDev = await prisma.externalActivity.groupBy({
      by: ["employeeId"],
      where: { kind: "commit", occurredAt: { gte: weekAgo } },
      _count: { _all: true },
    });
    const ids = byDev.map((r) => r.employeeId).filter((v): v is string => Boolean(v));
    const names = await prisma.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    return {
      ...base,
      intent,
      commitsLast7Days: byDev.reduce((s, r) => s + r._count._all, 0),
      perDeveloper: byDev
        .map((r) => ({
          developer: nameById.get(r.employeeId ?? "") ?? "unknown",
          commits: r._count._all,
        }))
        .sort((a, b) => b.commits - a.commits),
      caveat: "Only developers who have connected GitHub appear in this list.",
    };
  }

  if (intent === "marketing_performance") {
    const rows = await prisma.project.findMany({
      where: { deletedAt: null },
      select: {
        name: true,
        status: true,
        progressPct: true,
        client: { select: { name: true } },
        tasks: { where: { deletedAt: null }, select: { status: true, dueDate: true } },
      },
    });
    return {
      ...base,
      intent,
      projects: rows.map((r) => {
        const done = r.tasks.filter((t) => t.status === "DONE").length;
        const od = r.tasks.filter(
          (t) => t.status !== "DONE" && t.dueDate && t.dueDate.getTime() < now
        ).length;
        return {
          project: r.name,
          client: r.client?.name ?? null,
          status: r.status,
          statedProgressPct: r.progressPct,
          measuredProgressPct: r.tasks.length
            ? Math.round((done / r.tasks.length) * 100)
            : 0,
          overdue: od,
          tasks: r.tasks.length,
        };
      }),
    };
  }

  if (intent === "overdue_work") {
    const rows = await prisma.task.findMany({
      where: { ...tw, deletedAt: null, dueDate: { lt: new Date(now) }, status: { not: "DONE" } },
      select: {
        code: true,
        title: true,
        status: true,
        dueDate: true,
        assignee: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 25,
    });
    return {
      ...base,
      intent,
      overdue: rows.map((r) => ({
        code: r.code,
        title: r.title,
        status: r.status,
        dueDate: r.dueDate,
        daysOverdue: Math.floor((now - (r.dueDate?.getTime() ?? now)) / 86400_000),
        assignee: r.assignee?.name ?? null,
        project: r.project?.name ?? null,
      })),
    };
  }

  return { ...base, intent };
}

function headlineFor(intent: Intent, f: Record<string, any>): string {
  if (intent === "dev_attribution")
    return `${f.commitsLast7Days ?? 0} commit(s) in 7 days across ${(f.perDeveloper ?? []).length} developer(s)`;
  if (intent === "marketing_performance")
    return `${(f.projects ?? []).length} project(s), ${f.overdueTasks} overdue task(s) company-wide`;
  if (intent === "overdue_work")
    return `${(f.overdue ?? []).length} overdue task(s), oldest ${(f.overdue ?? [])[0]?.daysOverdue ?? 0} day(s)`;
  return `${f.liveProjects} live project(s), ${f.activePeople} people, ${f.blockedTasks} blocked, ${f.overdueTasks} overdue`;
}

function plainFor(intent: Intent, f: Record<string, any>): string {
  if (intent === "dev_attribution") {
    if (!f.commitsLast7Days)
      return "No GitHub activity is recorded yet — developers need to connect GitHub before this can be answered from real data.";
    return (f.perDeveloper ?? [])
      .map((d: any) => `${d.developer}: ${d.commits} commit(s)`)
      .join("; ");
  }
  if (intent === "marketing_performance") {
    if (!(f.projects ?? []).length) return "No live projects are recorded yet.";
    return (f.projects ?? [])
      .map(
        (p: any) =>
          `${p.project} (${p.client ?? "no client"}): ${p.measuredProgressPct}% measured vs ${p.statedProgressPct ?? 0}% stated, ${p.overdue} overdue`
      )
      .join("; ");
  }
  if (intent === "overdue_work") {
    if (!(f.overdue ?? []).length) return "Nothing is overdue.";
    return (f.overdue ?? [])
      .slice(0, 10)
      .map((t: any) => `${t.code} ${t.title} (${t.daysOverdue}d, ${t.assignee ?? "unassigned"})`)
      .join("; ");
  }
  return `${f.liveProjects} live project(s), ${f.activePeople} active people, ${f.totalTasks} task(s), ${f.blockedTasks} blocked, ${f.overdueTasks} overdue, ${f.tasksInReview} in review, ${f.hoursLoggedLast7Days}h logged in 7 days.`;
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { question?: string; refresh?: boolean };
    const question = (body.question ?? "").trim();
    if (!question) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

    const intent = classify(question);
    const key = createHash("sha256")
      .update(`${intent}|${session.user.id}|${question.toLowerCase()}`)
      .digest("hex");

    if (!body.refresh) {
      const hit = await prisma.insightCache.findUnique({ where: { questionKey: key } });
      if (hit && hit.expiresAt.getTime() > Date.now()) {
        const payload = hit.answerJson as Partial<CachedAnswer> | null;
        // Rows written before the payload gained `facts` have no `answer` key;
        // treat those as a miss so the client always receives a complete body.
        if (payload?.answer) {
          return NextResponse.json({
            question,
            intent,
            answer: payload.answer,
            facts: payload.facts ?? {},
            aiUnavailable: Boolean(payload.aiUnavailable),
            cached: true,
            dataAsOf: hit.dataAsOf,
            generatedAt: hit.generatedAt,
            model: hit.model,
          });
        }
      }
    }

    const facts = await buildFacts(intent, await scopedTaskWhere(session as any));
    const dataAsOf = new Date();

    let answer: Answer;
    let model: string | null = null;
    let aiUnavailable = false;

    try {
      // aiJson validates against the schema itself and makes one repair
      // attempt, so a bad model reply throws here and lands in the fallback
      // below rather than producing a half-shaped answer.
      answer = await aiJson<Answer>(
        `Question: ${question}\n\nFact set:\n${JSON.stringify(facts, null, 2)}\n\nReturn only JSON.`,
        "You are the TaskBoard OS company analyst. The JSON fact set you are given is the ONLY source of truth. " +
          "Answer using strictly those numbers. Never invent a metric, a name, or a percentage. " +
          "If the fact set does not contain the answer, say so plainly. " +
          "Be direct and specific. Return JSON with keys: headline, answer, highlights, risks.",
        { max_tokens: 700, purpose: "insight-ask" },
        AnswerSchema
      );
      model = process.env.AI_GATEWAY_MODEL ?? null;
    } catch (e) {
      // The dashboard must never go blank because the model is down.
      console.error("[insight/ask] AI unavailable, serving computed facts:", e);
      aiUnavailable = true;
      answer = {
        headline: headlineFor(intent, facts),
        answer: plainFor(intent, facts),
        highlights: [],
        risks: [],
      };
    }

    const payload: CachedAnswer = { answer, facts, aiUnavailable };

    try {
      await prisma.insightCache.upsert({
        where: { questionKey: key },
        create: {
          questionKey: key,
          scope: "company",
          question,
          answerJson: payload as unknown as object,
          model,
          dataAsOf,
          expiresAt: new Date(Date.now() + CACHE_TTL_MS),
        },
        update: {
          answerJson: payload as unknown as object,
          model,
          dataAsOf,
          generatedAt: new Date(),
          expiresAt: new Date(Date.now() + CACHE_TTL_MS),
        },
      });
    } catch (e) {
      console.error("[insight/ask] cache write failed", e);
    }

    return NextResponse.json({
      question,
      intent,
      answer,
      facts,
      dataAsOf,
      cached: false,
      aiUnavailable,
      model,
    });
  } catch (e) {
    console.error("[insight/ask]", e);
    return NextResponse.json({ error: "Failed to answer" }, { status: 500 });
  }
}
