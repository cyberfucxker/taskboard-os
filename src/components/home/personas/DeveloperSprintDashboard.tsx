"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Code,
  GitPullRequest,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Bug,
  AlertCircle,
  Play,
  Check,
  Plus,
  Terminal,
  Server,
  GitBranch
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "./NeedsMeNow";
import { TargetBar } from "./TargetBar";
import { HelperText } from "./HelperText";
import { RowActions } from "./RowActions";

export interface SprintTicket {
  id: string;
  title: string;
  project: string;
  branchName: string;
  prNumber?: number;
  prUrl?: string;
  type: "feature" | "bug" | "api" | "refactor";
  priority: "urgent" | "high" | "medium" | "low";
  status: "In Progress" | "In Review" | "Ready for QA" | "Done";
  dueDate: string;
  estimateHours?: number;
}

export interface ReviewQueueItem {
  id: string;
  prNumber: number;
  title: string;
  repo: string;
  author: string;
  prUrl: string;
  ciStatus: "passing" | "failing" | "running";
  urgency: "high" | "normal";
}

interface DeveloperSprintDashboardProps {
  personName?: string;
}

export function DeveloperSprintDashboard({
  personName = "Parker"
}: DeveloperSprintDashboardProps) {
  const [activeTab, setActiveTab] = useState<"sprint" | "reviews" | "deployments">("sprint");

  const needsMeItems: ActionItem[] = [
    {
      id: "dev-pr-1",
      title: "TaskBoard OS Core: PR #48 (Dynamic Persona Dashboard Router) requested your code review",
      category: "Code Review",
      urgency: "high",
      dueText: "Due before standup",
      contextUrl: "https://github.com/your-org/taskboard-os/pull/48",
      assigneeName: personName
    },
    {
      id: "dev-qa-2",
      title: "Globex Telemed: Staging build failed on migration step (Prisma schema drift)",
      category: "Build Failure",
      urgency: "high",
      dueText: "Fix immediately",
      contextUrl: "/deployments/zeta-staging",
      assigneeName: personName
    }
  ];

  const sprintTickets: SprintTicket[] = [
    {
      id: "ENG-301",
      title: "Implement PersonaHomeRouter & Employee role switcher dropdown",
      project: "TaskBoard OS",
      branchName: "feat/persona-dashboards",
      prNumber: 52,
      prUrl: "https://github.com/your-org/taskboard-os/pull/52",
      type: "feature",
      priority: "high",
      status: "In Progress",
      dueDate: "Today",
      estimateHours: 4
    },
    {
      id: "ENG-302",
      title: "Optimize Search Console sync batching to prevent API rate limits",
      project: "Growth Engine",
      branchName: "fix/sc-batch-rate-limit",
      type: "api",
      priority: "medium",
      status: "In Progress",
      dueDate: "Tomorrow",
      estimateHours: 6
    },
    {
      id: "ENG-294",
      title: "Fix PostgreSQL connection pool exhaustion under 50+ concurrent requests",
      project: "Apex Logistics",
      branchName: "fix/pg-pool-leak",
      prNumber: 39,
      prUrl: "https://github.com/your-org/app/pull/39",
      type: "bug",
      priority: "urgent",
      status: "In Review",
      dueDate: "Oct 07",
      estimateHours: 3
    },
    {
      id: "ENG-288",
      title: "Migrate legacy Leave balance calculation to serverless cron routine",
      project: "TaskBoard HR Core",
      branchName: "refactor/leave-engine",
      type: "refactor",
      priority: "medium",
      status: "Ready for QA",
      dueDate: "Oct 08",
      estimateHours: 5
    }
  ];

  const reviewQueue: ReviewQueueItem[] = [
    {
      id: "rev-1",
      prNumber: 48,
      title: "feat(dashboards): Dynamic role-aware home screens for all 18 roles",
      repo: "your-org/taskboard-os",
      author: "Mika",
      prUrl: "https://github.com/your-org/taskboard-os/pull/48",
      ciStatus: "passing",
      urgency: "high"
    },
    {
      id: "rev-2",
      prNumber: 19,
      title: "fix(crm): Prevent duplicate WhatsApp webhook listener registration",
      repo: "your-org/crm-service",
      author: "Riley",
      prUrl: "https://github.com/your-org/crm/pull/19",
      ciStatus: "passing",
      urgency: "normal"
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Engineering & Sprint Desk
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {personName} • Software Engineering
            </span>
          </div>
          <HelperText
            text="Active sprint tickets, pull requests needing review, branch statuses, and QA handoffs."
            tooltip="Single-click status transitions and direct GitHub/terminal links."
          />
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com/your-org"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted/60 transition-colors"
          >
            <GitPullRequest className="w-3.5 h-3.5 text-muted-foreground" />
            GitHub Pull Requests
          </a>

          <button
            onClick={() => alert("Creating a new engineering ticket...")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Sprint Ticket
          </button>
        </div>
      </div>

      {/* Targets & Velocity Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TargetBar
          label="Sprint Story Points Done"
          current={32}
          target={40}
          unit="pts"
          helper="80% of Sprint 24 delivered"
          color="emerald"
        />
        <TargetBar
          label="Code Reviews Completed"
          current={9}
          target={10}
          unit="reviews"
          helper="Turnaround time average: 1.6 hours"
          color="blue"
        />
        <TargetBar
          label="Open Critical Bugs"
          current={0}
          target={0}
          unit="bugs"
          helper="Zero-bug tolerance maintained"
          color="purple"
        />
      </div>

      {/* Needs Me Now */}
      <NeedsMeNow
        items={needsMeItems}
        title="Immediate Engineering Attention"
        helper="Urgent PR reviews and deployment blockers assigned to you."
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
          Active Sprint Tasks ({sprintTickets.length})
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
          Review Queue ({reviewQueue.length})
        </button>
        <button
          onClick={() => setActiveTab("deployments")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "deployments"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Server className="w-4 h-4" />
          Staging Environments
        </button>
      </div>

      {/* Tab 1: Sprint Tickets */}
      {activeTab === "sprint" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Current Sprint Queue
              </h3>
              <HelperText text="Tickets assigned to you, sorted by priority." />
            </div>
          </div>

          <div className="border border-border/60 rounded-xl overflow-hidden bg-card/60 divide-y divide-border/50">
            {sprintTickets.map((ticket) => (
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
                    <span className="flex items-center gap-1 font-mono text-primary">
                      <GitBranch className="w-3 h-3" /> {ticket.branchName}
                    </span>
                    {ticket.prNumber && (
                      <a
                        href={ticket.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-1 font-medium"
                      >
                        <GitPullRequest className="w-3 h-3" /> PR #{ticket.prNumber}
                      </a>
                    )}
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Due: {ticket.dueDate}
                    </span>
                    {ticket.estimateHours && <span>• Est: {ticket.estimateHours}h</span>}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      ticket.status === "In Progress"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                        : ticket.status === "In Review"
                        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                        : ticket.status === "Ready for QA"
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
                    onUpdateStatus={() => alert(`Advancing ticket ${ticket.id}`)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Code Review Queue */}
      {activeTab === "reviews" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Pull Requests Awaiting Your Review
              </h3>
              <HelperText text="Review teammates' code before merging to staging." />
            </div>
          </div>

          <div className="border border-border/60 rounded-xl overflow-hidden bg-card/60 divide-y divide-border/50">
            {reviewQueue.map((pr) => (
              <div
                key={pr.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                      #{pr.prNumber}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {pr.repo}
                    </span>
                    <span className="font-medium text-sm text-foreground">
                      {pr.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Author: {pr.author}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      CI Pipeline:{" "}
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        Passing
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={pr.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Review on GitHub
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Staging Environments */}
      {activeTab === "deployments" && (
        <div className="p-6 rounded-xl border border-border/60 bg-card/60 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                TaskBoard OS Staging Environment
              </h3>
              <p className="text-xs text-muted-foreground">
                Deployed commit: 68f3a1d • Node.js v22.23.2 • PostgreSQL 16
              </p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Healthy
            </span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <a
              href="http://localhost:3000"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted/60 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Staging App
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
