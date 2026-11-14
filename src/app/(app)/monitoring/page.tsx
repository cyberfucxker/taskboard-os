import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/pages";
import { MonitoringPanel } from "@/components/monitoring/MonitoringPanel";
import { SectionLabel } from "@/components/ui";

export const metadata: Metadata = { title: "Monitoring · Leadership" };
export const dynamic = "force-dynamic";

/**
 * Monitoring page — disclosed, policy-approved employee monitoring.
 * Gated on tasks.manage (leadership). Shows registered agent devices,
 * the activity log, and on-command captured screenshots (employee always notified).
 */
export default async function MonitoringPage() {
  const session = await guardPage("Control");
  if (!["SUPER_ADMIN", "DEPARTMENT_HEAD", "HR"].includes(session.user.role)) {
    redirect("/workspace");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5">
        <SectionLabel>Workplace Monitoring</SectionLabel>
        <h1 className="mt-1 text-xl font-semibold text-ink">Device activity · screenshots · work proof</h1>
        <p className="text-[13px] text-muted">
          Disclosed monitoring per the employee policy. Agents on company laptops report app/
          window activity. Screenshots are only taken on explicit leadership command and the
          employee is always notified.
        </p>
      </header>
      <MonitoringPanel />
    </main>
  );
}