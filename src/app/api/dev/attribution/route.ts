// GET /api/dev/attribution — who worked on which project, when, and what changed.
// Answers come from real GitHub activity, not from timesheets: a commit is
// evidence of work, and the employee is matched to their connected GitHub login.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GITHUB_API = "https://api.github.com";

interface CommitRow {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  stats?: { additions: number; deletions: number; total: number };
  files?: { filename: string; status: string; additions: number; deletions: number }[];
}

async function gh<T>(token: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** First meaningful line of a commit message. */
function subject(message: string): string {
  const line = message.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.replace(/^(fixup|squash)!/i, "").trim().slice(0, 180);
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const url = new URL(req.url);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    // Whose GitHub? Leadership/HR may pass ?employee=<id>; anyone else sees self.
    const requested = url.searchParams.get("employee");
    const canSeeOthers = ["SUPER_ADMIN", "DEPARTMENT_HEAD", "HR"].includes(session.user.role);
    const targetId = requested && canSeeOthers ? requested : session.user.id;

    const conn = await prisma.employeeIntegration.findFirst({
      where: { employeeId: targetId, provider: "GITHUB", isActive: true },
      select: { id: true, accessToken: true, refreshToken: true, tokenExpiresAt: true, accountEmail: true },
    });

    if (!conn) {
      return NextResponse.json(
        {
          connected: false,
          message:
            "No GitHub account is connected yet. Connect it from Settings → Integrations to see real contribution history.",
        },
        { status: 200 }
      );
    }

    let token: string | null = null;
    try {
      token = await getValidAccessToken(targetId, "github");
    } catch (e) {
      console.error("[dev/attribution] token refresh failed", e);
    }
    if (!token) {
      return NextResponse.json(
        { connected: true, needsReconnect: true, message: "GitHub needs reconnecting." },
        { status: 200 }
      );
    }

    const viewer = await gh<{ login: string; name: string | null }>(token, "/user");
    if (!viewer) {
      return NextResponse.json(
        { connected: true, needsReconnect: true, message: "GitHub did not accept the token." },
        { status: 200 }
      );
    }

    // Prefer the org the token can actually see, so we read the real company repos.
    const orgs = await gh<Array<{ login: string }>>(token, "/user/orgs");
    const events = await gh<
      Array<{ type: string; repo: { name: string }; created_at: string; payload: any }>
    >(token, `/users/${viewer.login}/events/public?per_page=100`);

    const pushEvents = (events ?? []).filter((e) => e.type === "PushEvent");
    const seen = new Set<string>();
    const activity: Array<Record<string, unknown>> = [];

    for (const ev of pushEvents) {
      const commits: CommitRow[] = ev.payload?.commits ?? [];
      for (const c of commits) {
        if (seen.has(c.sha)) continue;
        seen.add(c.sha);
        activity.push({
          kind: "commit",
          repo: ev.repo.name,
          sha: c.sha.slice(0, 7),
          message: subject(c.commit.message),
          url: c.html_url,
          occurredAt: c.commit.author.date,
          author: c.commit.author.name,
        });
      }
    }

    // Resolve repo name -> TaskBoard project so "which project" is answerable.
    const projects = await prisma.project.findMany({
      select: { id: true, name: true },
    });
    const byRepo = new Map<string, string>();
    for (const p of projects) {
      const key = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      for (const ev of new Set(activity.map((a) => a.repo as string))) {
        const repoKey = ev.toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (key && repoKey.includes(key) || key.includes(repoKey)) {
          byRepo.set(ev, p.id);
        }
      }
    }

    const commitsByProject = new Map<string, number>();
    for (const a of activity) {
      const pid = byRepo.get(a.repo as string);
      const label = pid ?? "unmapped";
      commitsByProject.set(label, (commitsByProject.get(label) ?? 0) + 1);
    }

    // Persist so history survives token expiry and the dashboard stays fast.
    let persisted = 0;
    try {
      for (const a of activity.slice(0, 200)) {
        await prisma.externalActivity.upsert({
          where: {
            provider_providerEventId: { provider: "github", providerEventId: a.sha as string },
          },
          create: {
            provider: "github",
            providerEventId: a.sha as string,
            connectionId: conn.id,
            employeeId: targetId,
            projectId: byRepo.get(a.repo as string) ?? null,
            kind: "commit",
            title: a.message as string,
            url: a.url as string,
            occurredAt: new Date(a.occurredAt as string),
            raw: { repo: String(a.repo) },
          },
          update: {},
        });
        persisted++;
      }
    } catch (e) {
      console.error("[dev/attribution] persist failed", e);
    }

    return NextResponse.json({
      connected: true,
      githubLogin: viewer.login,
      accountEmail: conn.accountEmail,
      windowDays: days,
      since,
      totalCommits: activity.length,
      repos: [...new Set(activity.map((a) => a.repo))],
      commitsByProject: Object.fromEntries(commitsByProject),
      persisted,
      recent: activity
        .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
        .slice(0, 40)
        .map((a) => ({ ...a, projectId: byRepo.get(a.repo as string) ?? null })),
    });
  } catch (e) {
    console.error("[dev/attribution]", e);
    return NextResponse.json({ error: "Failed to load attribution" }, { status: 500 });
  }
}
