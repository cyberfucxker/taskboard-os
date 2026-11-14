"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Code,
  Palette,
  GitPullRequest,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Bug,
  Sparkles,
  AlertCircle,
  Play,
  Check,
  ChevronRight,
  Plus
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "./NeedsMeNow";
import { TargetBar } from "./TargetBar";
import { HelperText } from "./HelperText";
import { RowActions } from "./RowActions";

export interface DevTicket {
  id: string;
  title: string;
  project: string;
  type: "feature" | "bug" | "ui_design" | "api";
  priority: "urgent" | "high" | "medium" | "low";
  status: "In Progress" | "Review" | "QA" | "Done";
  figmaUrl?: string;
  githubPrUrl?: string;
  estimateHours?: number;
  dueDate: string;
}

interface DesignDevDashboardProps {
  personName?: string;
  roleType?: "designer" | "developer_frontend" | "developer_backend";
}

export function DesignDevDashboard({
  personName = "Sam",
  roleType = "developer_frontend"
}: DesignDevDashboardProps) {
  const isDesigner = roleType === "designer" || personName.toLowerCase().includes("lane");
  const [activeTab, setActiveTab] = useState<"sprint" | "reviews" | "blocked">("sprint");

  const needsMeItems: ActionItem[] = [
    {
      id: "dev-blocker-1",
      title: isDesigner
        ? "Acme ERP: Client requested revision on Mobile Checkout flow in Figma"
        : "Globex Health: PR #42 (JWT Token refresh middleware) requested your review",
      category: isDesigner ? "Design Revision" : "Code Review",
      urgency: "high",
      dueText: "Due in 2 hours",
      contextUrl: "/dev/pr/42",
      assigneeName: personName
    },
    {
      id: "dev-blocker-2",
      title: "TaskBoard OS Renovation: Milestone 3 Component Handoff to QA",
      category: "Milestone",
      urgency: "medium",
      dueText: "Due Today",
      contextUrl: "/projects/taskboard",
      assigneeName: personName
    }
  ];

  const tickets: DevTicket[] = [
    {
      id: "TICK-104",
      title: isDesigner
        ? "Redesign Settings & Team Roles dialog (Figma Components)"
        : "Build PersonaHomeRouter and dynamic home page routing",
      project: "TaskBoard OS",
      type: isDesigner ? "ui_design" : "feature",
      priority: "high",
      status: "In Progress",
      figmaUrl: "https://figma.com/file/example-design-system",
      dueDate: "Today",
      estimateHours: 4
    },
    {
      id: "TICK-105",
      title: "Optimize Search Console API data syncing latency (<200ms)",
      project: "SEO Platform",
      type: "api",
      priority: "medium",
      status: "In Progress",
      githubPrUrl: "https://github.com/your-org/seo-api/pull/18",
      dueDate: "Tomorrow",
      estimateHours: 6
    },
    {
      id: "TICK-98",
      title: "Fix sticky header z-index collision on mobile Safari",
      project: "Apex Logistics",
      type: "bug",
      priority: "urgent",
      status: "Review",
      dueDate: "Oct 07",
      estimateHours: 2
    },
    {
      id: "TICK-92",
      title: "Implement multi-tenant database migration for attendance logs",
      project: "TaskBoard HR Core",
      type: "feature",
      priority: "medium",
      status: "QA",
      dueDate: "Oct 08",
      estimateHours: 8
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isDesigner ? "Design Studio Desk" : "Engineering & Sprint Desk"}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {personName} • {isDesigner ? "UI/UX Design" : "Software Engineering"}
            </span>
          </div>
          <HelperText
            text={
              isDesigner
                ? "Figma components, UI asset handoffs, design systems, and client revision comments."
                : "Active sprint issues, pull request reviews, deployment health, and bug fixes."
            }
            tooltip="Single-click status updates and direct links to GitHub & Figma."
          />
        </div>

        <div className="flex items-center gap-2">
          {isDesigner ? (
            <a
              href="https://figma.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted/60 transition-colors"
            >
              <Palette className="w-3.5 h-3.5 text-muted-foreground" />
              Open Figma Workspace
            </a>
          ) : (
            <Link
              href="/git"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted/60 transition-colors"
            >
              <GitPullRequest className="w-3.5 h-3.5 text-muted-foreground" />
              My Open PRs (2)
            </Link>
          )}

          <button
            onClick={() => alert("Creating a quick task/ticket")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Ticket
          </button>
        </div>
      </div>

      {/* Targets & Sprint Velocity Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TargetBar
          label="Sprint Story Points Completed"
          current={28}
          target={35}
          unit="pts"
          helper="80% of Sprint 24 delivered"
          color="emerald"
        />
        <TargetBar
          label="PR Review Turnaround Time"
          current={1.8}
          target={2.5}
          unit="hrs"
          helper="Goal: Review incoming PRs within 2.5 hours"
          color="blue"
        />
        <TargetBar
          label="Open Bugs Assigned"
          current={1}
          target={0}
          unit="bugs"
          helper="Clean backlog target: 0 critical bugs"
          color="purple"
        />
      </div>

      {/* Needs Me Now */}
      <NeedsMeNow
        items={needsMeItems}
        title="Sprint Blockers & Code Reviews"
        helper="Items waiting exclusively for your input to unblock teammates."
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("sprint")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "sprint"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="w-4 h-4" />
          Active Sprint Tasks ({tickets.filter((t) => t.status !== "Done").length})
        </button>
        <button
          onClick={() => setActiveTab("reviews")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "reviews"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <GitPullRequest className="w-4 h-4" />
          In Review & QA (2)
        </button>
        <button
          onClick={() => setActiveTab("blocked")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "blocked"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          Blocked Items (0)
        </button>
      </div>

      {/* Main Ticket Queue (Linear Style) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Current Work Queue
            </h3>
            <HelperText text="Organized by priority and execution stage." />
          </div>
        </div>

        <div className="border border-border/60 rounded-xl overflow-hidden bg-card/60 divide-y divide-border/50">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    {ticket.id}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {ticket.project}
                  </span>
                  <span className="font-medium text-sm text-foreground">
                    {ticket.title}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Due: {ticket.dueDate}
                  </span>
                  {ticket.estimateHours && (
                    <span>• Est: {ticket.estimateHours}h</span>
                  )}
                  {ticket.figmaUrl && (
                    <a
                      href={ticket.figmaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      <Palette className="w-3 h-3" /> Figma Specs
                    </a>
                  )}
                  {ticket.githubPrUrl && (
                    <a
                      href={ticket.githubPrUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      <GitPullRequest className="w-3 h-3" /> PR #18
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    ticket.status === "In Progress"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                      : ticket.status === "Review"
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                      : ticket.status === "QA"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {ticket.status}
                </span>

                <RowActions
                  itemId={ticket.id}
                  itemTitle={ticket.title}
                  itemType="task"
                  onUpdateStatus={() => alert(`Advancing ${ticket.id} status`)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
