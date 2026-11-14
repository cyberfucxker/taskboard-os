import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { effectiveCapsForSession } from "@/lib/scope";
import { effectivePages } from "@/lib/pages";
import SessionProvider from "@/components/SessionProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { ToastProvider } from "@/components/Toast";
import { TimerProvider } from "@/components/timer/TimerContext";
import { AppShell } from "@/components/AppShell";
import { PageAccessProvider, NavUserProvider } from "@/components/PageAccessContext";
import { SectionTabsFrame } from "@/components/nav/SectionTabs";
import PushSetup from "@/components/PushSetup";
import { GlobalTaskDrawer } from "@/components/GlobalTaskDrawer";
import { PeekDrawer } from "@/components/entity/PeekDrawer";
import { PanelGate } from "@/components/lock/PanelGate";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import { NavigationProgressBar } from "@/components/NavigationProgressBar";
import { DailyUpdatePrompt } from "@/components/standup/DailyUpdatePrompt";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const [notifications, caps, pages, panelLock] = await Promise.all([
    prisma.notification.findMany({
      where: { employeeId: session.user.id, read: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    effectiveCapsForSession(session),
    effectivePages(session),
    prisma.employee.findUnique({
      where: { id: session.user.id },
      select: { panelLock: true, department: { select: { slug: true, name: true } } },
    }),
  ]);
  const navUser = {
    role: session.user.role,
    deptSlug: panelLock?.department?.slug ?? null,
    deptName: panelLock?.department?.name ?? null,
  };
  const canAssign = caps.has("tasks.assign");
  const lockCfg = ((panelLock?.panelLock as any) ?? null) as
    | { enabledPages?: string[]; pin?: string }
    | null;

  // Theme Gate (TASKBOARD_V3_ROLLOUT: off | pilot | all)
  const rolloutMode = (process.env.TASKBOARD_V3_ROLLOUT || "off").trim().toLowerCase();
  const pilotEmails = (process.env.TASKBOARD_V3_PILOT_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const userEmail = (session.user.email || "").trim().toLowerCase();
  const isPilot = pilotEmails.includes(userEmail);
  const isV3 = rolloutMode === "all" || (rolloutMode === "pilot" && isPilot);
  const uiVersion: "v3" | "v2" = isV3 ? "v3" : "v2";

  return (
    <SessionProvider session={session}>
      {/* Anti-flash inline script: set data-ui before React hydration */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var saved=localStorage.getItem("taskboard3");if(saved==="on")document.documentElement.setAttribute("data-ui","v3");else if(saved==="off")document.documentElement.setAttribute("data-ui","v2");else document.documentElement.setAttribute("data-ui","${uiVersion}");}catch(e){document.documentElement.setAttribute("data-ui","${uiVersion}");}})();`,
        }}
      />
      <QueryProvider>
      <RealtimeProvider>
      <ToastProvider>
        <TimerProvider>
          <NavigationProgressBar />
          <PageAccessProvider pages={[...pages]}>
          <NavUserProvider user={navUser}>
            <AppShell
              uiVersion={uiVersion}
              session={{
                name: session.user.name ?? null,
                email: session.user.email ?? null,
                role: session.user.role,
              }}
              pages={[...pages]}
              notifications={notifications.map((n) => ({
                id: n.id,
                title: n.title,
                detail: n.detail,
                severity: n.severity ?? undefined,
                createdAt: n.createdAt.toISOString(),
              }))}
            >
              <PanelGate
                enabledPages={lockCfg?.enabledPages ?? []}
                hasPin={Boolean(lockCfg?.pin)}
              >
                <ChunkErrorBoundary>
                  <SectionTabsFrame>{children}</SectionTabsFrame>
                </ChunkErrorBoundary>
              </PanelGate>
            </AppShell>
          </NavUserProvider>
          </PageAccessProvider>
          <Suspense>
            <GlobalTaskDrawer currentUserId={session.user.id} canAssign={canAssign} currentUserName={session.user.name ?? ""} />
            <PeekDrawer />
          </Suspense>
          <PushSetup />
          <DailyUpdatePrompt currentUserId={session.user.id} />
        </TimerProvider>
      </ToastProvider>
      </RealtimeProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
