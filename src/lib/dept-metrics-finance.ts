import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  authorizeDept, daysOverdue, denied, fmtInrFromPaise, fmtIstDate, guarded, istToday, ok,
  type Result, type Scope,
} from "@/lib/dept-metrics-common";

/**
 * Finance dashboard metrics. Read-only. Every figure here is money, so every function is gated
 * on the `finance.view` capability (SUPER_ADMIN, FINANCE, Finance/Leadership departments, or an
 * explicit per-person grant) and returns `denied` for everyone else. `scope` is ignored: these
 * are company-wide ledgers.
 *
 * Invoice.amountPaise is real paise (the Finance page divides by 100). Statuses in use:
 * Draft / Sent / Due / Paid / Void. "Receivable" = anything issued and not yet paid.
 */

const NO_FIN = "Finance figures are restricted to people with finance access.";
const UNPAID_EXCLUDED = ["Draft", "Paid", "Void"];
const CUR: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", AED: "AED " };

/** Money only: viewer must belong to the Finance department (or be SUPER_ADMIN / Leadership) AND hold finance.view. */
async function requireFinance(userId: string, departmentId: string): Promise<string | null> {
  const auth = await authorizeDept(userId, departmentId, "finance");
  if (!auth.ok) return auth.reason;
  return auth.actor.caps.has("finance.view") ? null : NO_FIN;
}

/** Format paise in a currency. INR gets lakh/crore grouping; other currencies plain with separators. */
export function fmtMoney(paise: number, currency: string): string {
  if (currency === "INR") return fmtInrFromPaise(paise);
  const units = Math.round(paise / 100);
  const s = String(Math.abs(units)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${units < 0 ? "-" : ""}${CUR[currency] ?? `${currency} `}${s}`;
}

function joinTotals(byCur: Map<string, number>): string {
  const parts = Array.from(byCur.entries()).filter(([, v]) => v !== 0).map(([c, v]) => fmtMoney(v, c));
  return parts.length ? parts.join(" + ") : fmtMoney(0, "INR");
}

/* ------------------------------------------------- Receivables by client */

export interface ReceivableRow {
  clientId: string;
  clientName: string;
  invoices: number;
  outstanding: string;
  overdue: string | null;
  overdueCount: number;
}
export interface Receivables { total: string; overdueTotal: string; invoiceCount: number; overdueCount: number; rows: ReceivableRow[] }

export function receivablesByClient(userId: string, _scope: Scope, departmentId: string): Promise<Result<Receivables>> {
  return guarded("finance.receivables", async () => {
    { const why = await requireFinance(userId, departmentId); if (why) return denied(why); }
    const day = istToday();
    const invoices = await prisma.invoice.findMany({
      where: { deletedAt: null, status: { notIn: UNPAID_EXCLUDED }, amountPaise: { not: null } },
      select: { clientId: true, amountPaise: true, currency: true, dueDate: true, client: { select: { name: true } } },
    });
    interface Acc { name: string; n: number; out: Map<string, number>; over: Map<string, number>; overN: number; sort: number }
    const by = new Map<string, Acc>();
    const total = new Map<string, number>();
    const overTotal = new Map<string, number>();
    let overdueCount = 0;
    for (const i of invoices) {
      const amt = Number(i.amountPaise ?? 0);
      const isOver = !!i.dueDate && i.dueDate < day.start;
      const a = by.get(i.clientId) ?? { name: i.client.name, n: 0, out: new Map(), over: new Map(), overN: 0, sort: 0 };
      a.n++;
      a.out.set(i.currency, (a.out.get(i.currency) ?? 0) + amt);
      total.set(i.currency, (total.get(i.currency) ?? 0) + amt);
      a.sort += amt;
      if (isOver) {
        a.overN++;
        overdueCount++;
        a.over.set(i.currency, (a.over.get(i.currency) ?? 0) + amt);
        overTotal.set(i.currency, (overTotal.get(i.currency) ?? 0) + amt);
      }
      by.set(i.clientId, a);
    }
    const rows = Array.from(by.entries())
      .sort((x, y) => y[1].overN - x[1].overN || y[1].sort - x[1].sort)
      .slice(0, 8)
      .map(([clientId, a]) => ({
        clientId,
        clientName: a.name,
        invoices: a.n,
        outstanding: joinTotals(a.out),
        overdue: a.overN ? joinTotals(a.over) : null,
        overdueCount: a.overN,
      }));
    return ok({ total: joinTotals(total), overdueTotal: joinTotals(overTotal), invoiceCount: invoices.length, overdueCount, rows });
  });
}

/* ------------------------------------------------- Invoices due */

export interface DueInvoiceRow {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  amount: string;
  dueLabel: string;
  overdueDays: number;
  status: string;
}
export interface InvoicesDue { overdue: number; dueSoon: number; rows: DueInvoiceRow[] }

export function invoicesDue(userId: string, _scope: Scope, departmentId: string): Promise<Result<InvoicesDue>> {
  return guarded("finance.due", async () => {
    { const why = await requireFinance(userId, departmentId); if (why) return denied(why); }
    const day = istToday();
    const horizon = new Date(day.start.getTime() + 15 * 86400000); // due within the next 14 days
    const where: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      status: { notIn: UNPAID_EXCLUDED },
      dueDate: { not: null, lt: horizon },
    };
    const [overdue, total, rows] = await Promise.all([
      prisma.invoice.count({ where: { ...where, dueDate: { lt: day.start } } }),
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { dueDate: "asc" },
        take: 8,
        select: {
          id: true, number: true, amountPaise: true, currency: true, status: true, dueDate: true,
          client: { select: { id: true, name: true } },
        },
      }),
    ]);
    return ok({
      overdue,
      dueSoon: total - overdue,
      rows: rows.map((r) => ({
        id: r.id,
        number: r.number,
        clientId: r.client.id,
        clientName: r.client.name,
        amount: fmtMoney(Number(r.amountPaise ?? 0), r.currency),
        dueLabel: r.dueDate ? fmtIstDate(r.dueDate) : "",
        overdueDays: r.dueDate ? daysOverdue(r.dueDate, day) : 0,
        status: r.status,
      })),
    });
  });
}

/* ------------------------------------------------- Project hours vs billed */

export interface HoursBilledRow {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  loggedHrs: number;
  budgetHrs: number;
  burnPct: number;
  billed: string | null;
}
export interface HoursVsBilled {
  /** Active projects that carry a budgeted-hours figure. 0 means there is nothing to compare yet. */
  withBudget: number;
  activeProjects: number;
  rows: HoursBilledRow[];
}

interface RawHours { projectId: string; hrs: number | null }

export function hoursVsBilled(userId: string, _scope: Scope, departmentId: string): Promise<Result<HoursVsBilled>> {
  return guarded("finance.hours", async () => {
    { const why = await requireFinance(userId, departmentId); if (why) return denied(why); }
    const [activeProjects, projects] = await Promise.all([
      prisma.project.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      prisma.project.findMany({
        where: { deletedAt: null, status: "ACTIVE", budgetedHours: { gt: 0 } },
        select: {
          id: true, name: true, budgetedHours: true, contractId: true,
          client: { select: { id: true, name: true } },
        },
      }),
    ]);
    if (!projects.length) return ok({ withBudget: 0, activeProjects, rows: [] });

    const projectIds = projects.map((p) => p.id);
    const contractIds = Array.from(new Set(projects.map((p) => p.contractId).filter((x): x is string => !!x)));
    const [hours, invoices] = await Promise.all([
      prisma.$queryRaw<RawHours[]>(Prisma.sql`
        SELECT t."projectId" AS "projectId", SUM(l.hours)::float8 AS hrs
        FROM "TimeLog" l JOIN "Task" t ON t.id = l."taskId"
        WHERE t."projectId" = ANY(${projectIds}::text[])
        GROUP BY t."projectId"`),
      contractIds.length
        ? prisma.invoice.findMany({
            where: { deletedAt: null, contractId: { in: contractIds }, status: { notIn: ["Draft", "Void"] } },
            select: { contractId: true, amountPaise: true, currency: true },
          })
        : Promise.resolve([] as { contractId: string | null; amountPaise: Prisma.Decimal | null; currency: string }[]),
    ]);
    const hrsBy = new Map(hours.map((h) => [h.projectId, h.hrs ?? 0]));
    const billedBy = new Map<string, Map<string, number>>();
    for (const i of invoices) {
      if (!i.contractId) continue;
      const m = billedBy.get(i.contractId) ?? new Map<string, number>();
      m.set(i.currency, (m.get(i.currency) ?? 0) + Number(i.amountPaise ?? 0));
      billedBy.set(i.contractId, m);
    }
    const rows: HoursBilledRow[] = projects
      .map((p) => {
        const budget = p.budgetedHours ?? 0;
        const logged = Math.round((hrsBy.get(p.id) ?? 0) * 10) / 10;
        const billed = p.contractId ? billedBy.get(p.contractId) : undefined;
        return {
          projectId: p.id,
          projectName: p.name,
          clientId: p.client.id,
          clientName: p.client.name,
          loggedHrs: logged,
          budgetHrs: budget,
          burnPct: budget ? Math.round((logged / budget) * 100) : 0,
          billed: billed ? joinTotals(billed) : null,
        };
      })
      .sort((a, b) => b.burnPct - a.burnPct)
      .slice(0, 8);
    return ok({ withBudget: projects.length, activeProjects, rows });
  });
}
