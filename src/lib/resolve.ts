import { prisma } from "@/lib/db";

/**
 * Resolve human-friendly tokens (`@maya`, `#dev`) to real records so the
 * NLP quick-capture can be wired to actual data. Loose, case-insensitive
 * matching — good enough for 20–30 people; tighten to a phonetic index at
 * scale (CORE-02.2 / skills routing).
 */

/** Dept aliases — matches both "Digital Marketing" and casual keys. */
const DEPT_ALIASES: Record<string, string[]> = {
  leadership: ["leadership"],
  sales: ["sales"],
  design: ["design"],
  development: ["development", "dev", "engineering", "tech"],
  "digital marketing": ["digital marketing", "dm", "seo", "social media", "social", "performance", "perfmktg", "smm", "marketing"],
  hr: ["hr", "hrms", "people"],
  finance: ["finance", "accounts"],
};

export async function resolveEmployee(token: string): Promise<string | null> {
  const q = token.toLowerCase().trim();
  if (!q) return null;
  const all = await prisma.employee.findMany({
    where: { status: { in: ["ACTIVE", "PROBATION"] }, deletedAt: null },
    select: { id: true, name: true, email: true, title: true },
  });
  // exact email match first
  const byEmail = all.find((e) => e.email.toLowerCase() === q);
  if (byEmail) return byEmail.id;
  // token is usually a first name fragment
  const byName = all.find((e) => e.name.toLowerCase().includes(q));
  if (byName) return byName.id;
  // last guess: match any part of name
  const part = all.find((e) => e.name.toLowerCase().split(" ").some((p) => p.startsWith(q)));
  return part?.id ?? null;
}

export async function resolveDepartment(token: string): Promise<string | null> {
  const q = token.toLowerCase().trim();
  if (!q) return null;
  const depts = await prisma.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const match = depts.find((d) => {
    const dname = d.name.toLowerCase();
    if (dname === q) return true;
    const aliases = Object.values(DEPT_ALIASES).find((a) => a.includes(dname));
    return aliases?.includes(q) ?? false;
  });
  if (match) return match.id;
  // fallback: substring on department name
  const sub = depts.find((d) => d.name.toLowerCase().includes(q));
  return sub?.id ?? null;
}

export async function resolveClient(token: string): Promise<string | null> {
  const q = token.toLowerCase().trim();
  if (!q) return null;
  const clients = await prisma.client.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const match = clients.find((c) => c.name.toLowerCase() === q || c.name.toLowerCase().includes(q));
  return match?.id ?? null;
}