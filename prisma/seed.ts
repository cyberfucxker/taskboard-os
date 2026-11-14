import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * TaskBoard OS seed — idempotent, safe to re-run (`npm run db:seed`).
 *
 * Seeds the ORGANISATION SPINE + a FICTIONAL DEMO ROSTER only:
 * org, departments, employees (all @example.com addresses; none are real people).
 *
 * No demo clients, services, tasks or leads are created. Replace the roster below with your
 * own team (or create employees from the Admin UI) before using this for anything real.
 *
 * Every demo account gets the password in SEED_PASSWORD (required; never commit it).
 * Money fields are intentionally never written; RBAC gates the commercial
 * surfaces for non-privileged roles.
 */

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? (() => { throw new Error("Set SEED_PASSWORD before running the seed"); })();
const PASSWORD_HASH = bcrypt.hashSync(DEMO_PASSWORD, 10);

type Index = Map<string, string>;
const idx: { emp: Index; dept: Index } = { emp: new Map(), dept: new Map() };
function key(map: Index, k: string) { return map.get(k) ?? ""; }

const DAY = 24 * 60 * 60 * 1000;
function days(n: number) { return new Date(Date.now() + n * DAY); }

const ORG = { name: "Acme Inc", slug: "acme", timezone: "Asia/Kolkata", currency: "INR" as const };

const DEPTS: Array<{ k: string; name: string; color: string; headKey?: string }> = [
  { k: "leadership", name: "Leadership", color: "#D29922", headKey: "jordan" },
  { k: "sales", name: "Sales", color: "#F85149", headKey: "skyler" },
  { k: "design", name: "Design", color: "#D29922", headKey: "avery" },
  { k: "dev", name: "Development", color: "#6DBB7C", headKey: "parker" },
  { k: "dm", name: "Digital Marketing", color: "#3E8B93" }, // SEO + Social + Perf Mktg
  { k: "hr", name: "HR", color: "#8B949E", headKey: "casey" },
  { k: "finance", name: "Finance", color: "#6DBB7C" },
];

// Fictional demo roster (@example.com addresses). The home dashboard picks a persona
// from the signed-in user's first name / role, so keep these first names if you want the
// persona dashboards to light up, or replace them with your own team.
const PEOPLE: Array<{
  k: string; name: string; email: string;
  role: "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "TEAM_LEAD" | "SENIOR_EXECUTIVE" | "EXECUTIVE" | "INTERN" | "HR" | "FINANCE" | "ACCOUNT_MANAGER";
  dept: string; title: string; mgr?: string; status?: "EXITED"; exitedAt?: Date;
}> = [
  // Leadership
  { k: "alex", name: "Alex Morgan", email: "alex@example.com", role: "SUPER_ADMIN", dept: "leadership", title: "Founder & CEO" },
  { k: "jordan", name: "Jordan", email: "jordan@example.com", role: "SUPER_ADMIN", dept: "leadership", title: "COO", mgr: "alex" },
  // HR
  { k: "casey", name: "Casey Brooks", email: "casey@example.com", role: "HR", dept: "hr", title: "HR", mgr: "jordan" },
  // Digital Marketing (SEO / Social / Performance)
  { k: "harper", name: "Harper Stone", email: "harper@example.com", role: "EXECUTIVE", dept: "dm", title: "DM Executive", mgr: "jordan" },
  { k: "devon", name: "Devon", email: "devon@example.com", role: "EXECUTIVE", dept: "dm", title: "DM Executive", mgr: "jordan" },
  // Design
  { k: "avery", name: "Avery Stone", email: "avery@example.com", role: "SENIOR_EXECUTIVE", dept: "design", title: "Senior Graphic Designer + Video Editor", mgr: "jordan" },
  { k: "lane", name: "Lane", email: "lane@example.com", role: "EXECUTIVE", dept: "design", title: "Designer", mgr: "avery" },
  { k: "sam", name: "Sam", email: "sam@example.com", role: "EXECUTIVE", dept: "design", title: "Designer", mgr: "avery" },
  // Development
  { k: "parker", name: "Parker", email: "parker@example.com", role: "SENIOR_EXECUTIVE", dept: "dev", title: "Senior Full Stack Developer", mgr: "jordan" },
  { k: "mika", name: "Mika", email: "mika@example.com", role: "SENIOR_EXECUTIVE", dept: "dev", title: "Backend Full Stack Developer + Designer", mgr: "parker" },
  { k: "riley", name: "Riley", email: "riley@example.com", role: "EXECUTIVE", dept: "dev", title: "Flutter Full Stack Developer", mgr: "parker" },
  // Sales
  { k: "nova", name: "Nova", email: "nova@example.com", role: "EXECUTIVE", dept: "sales", title: "BDE — First Caller", mgr: "skyler" },
  { k: "sage", name: "Sage", email: "sage@example.com", role: "SENIOR_EXECUTIVE", dept: "sales", title: "Sales Closer", mgr: "skyler" },
  { k: "skyler", name: "Skyler", email: "skyler@example.com", role: "TEAM_LEAD", dept: "sales", title: "BDM", mgr: "jordan" },
  { k: "kai", name: "Kai", email: "kai@example.com", role: "EXECUTIVE", dept: "sales", title: "BA Pre-Sales", mgr: "skyler" },
  { k: "peyton", name: "Peyton", email: "peyton@example.com", role: "ACCOUNT_MANAGER", dept: "sales", title: "BA Post-Sales", mgr: "skyler" },
  { k: "vale", name: "Vale Quinn", email: "vale@example.com", role: "INTERN", dept: "sales", title: "Sales Intern", mgr: "skyler" },
  // Exited
  { k: "hayden", name: "Hayden Brooks", email: "hayden@example.com", role: "TEAM_LEAD", dept: "dm", title: "DM Team Lead", mgr: "jordan", status: "EXITED", exitedAt: days(-120) },
  { k: "ash", name: "Ash Lane Stone", email: "ash@example.com", role: "EXECUTIVE", dept: "dm", title: "DM Executive", mgr: "jordan", status: "EXITED", exitedAt: days(-120) },
  { k: "mallory", name: "Mallory", email: "mallory@example.com", role: "EXECUTIVE", dept: "sales", title: "Marketplace Manager", mgr: "skyler", status: "EXITED", exitedAt: days(-120) },
];

// Canonical KPI definitions (schema reference — values come from actual work/outcomes).
const METRICS: Array<{ key: string; name: string; definition: string; unit: string; kind: "activity" | "outcome"; ownerRole?: string }> = [
  { key: "revenue.monthly", name: "Company monthly revenue", definition: "Invoiced revenue in the period", unit: "INR", kind: "outcome", ownerRole: "SUPER_ADMIN" },
  { key: "delivery.on_time", name: "On-time delivery", definition: "% of deliverables shipped on or before due date", unit: "%", kind: "outcome", ownerRole: "SUPER_ADMIN" },
  { key: "leads.qualified", name: "Leads qualified", definition: "Leads moved to Qualified or beyond, per owner", unit: "count", kind: "activity", ownerRole: "TEAM_LEAD" },
  { key: "sales.proposal_close", name: "Proposal to close rate", definition: "% of proposals that convert to WON", unit: "%", kind: "outcome", ownerRole: "SENIOR_EXECUTIVE" },
  { key: "creatives.delivered", name: "Creatives delivered", definition: "Assets shipped vs planned, per designer", unit: "count", kind: "activity", ownerRole: "SENIOR_EXECUTIVE" },
  { key: "sprint.commitment", name: "Sprint commitment met", definition: "% of committed story points delivered", unit: "%", kind: "outcome", ownerRole: "SENIOR_EXECUTIVE" },
  { key: "time_to_hire", name: "Time-to-hire", definition: "Requisition to offer accepted, days", unit: "days", kind: "outcome", ownerRole: "HR" },
  { key: "dm.deliverables_shipped", name: "Deliverables shipped vs planned", definition: "% of DM deliverables shipped on time", unit: "%", kind: "outcome", ownerRole: "EXECUTIVE" },
];

async function main() {
  // 1. Org
  const org = await prisma.org.upsert({
    where: { slug: ORG.slug },
    create: ORG,
    update: ORG,
  });

  // 2. Departments — slug is the stable key DEPT_ADDONS is keyed on (rbac.ts).
  for (const d of DEPTS) {
    const rec = await prisma.department.upsert({
      where: { orgId_name: { orgId: org.id, name: d.name } },
      create: { orgId: org.id, name: d.name, slug: d.k, color: d.color },
      update: { slug: d.k, color: d.color },
    });
    idx.dept.set(d.k, rec.id);
  }

  // 3. People (manager linked on a second pass)
  for (const p of PEOPLE) {
    const rec = await prisma.employee.upsert({
      where: { email: p.email },
      create: {
        email: p.email,
        passwordHash: PASSWORD_HASH,
        name: p.name,
        role: p.role,
        title: p.title,
        departmentId: key(idx.dept, p.dept),
        status: p.status ?? "ACTIVE",
        joinedAt: days(-365),
        exitedAt: p.exitedAt,
        weeklyCapacityHrs: 40,
      },
      update: {
        name: p.name, role: p.role, title: p.title,
        departmentId: key(idx.dept, p.dept),
        status: p.status ?? "ACTIVE", exitedAt: p.exitedAt,
      },
    });
    idx.emp.set(p.k, rec.id);
  }
  for (const p of PEOPLE) {
    if (!p.mgr) continue;
    await prisma.employee.update({
      where: { email: p.email },
      data: { managerId: key(idx.emp, p.mgr) },
    });
  }

  // 4. Metric definitions (no fabricated values)
  for (const m of METRICS) {
    await prisma.metric.upsert({
      where: { key: m.key },
      create: m,
      update: { name: m.name, definition: m.definition, unit: m.unit },
    });
  }

  console.log(`\nSeed complete → org "${ORG.name}", ${idx.dept.size} departments, ${idx.emp.size} employees.`);
  console.log(`No demo work data is created. Sign in with any seeded email (e.g. jordan@example.com) using the password you set in SEED_PASSWORD.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
