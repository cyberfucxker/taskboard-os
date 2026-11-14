"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Palette,
  Layers,
  CheckCircle2,
  Clock,
  ExternalLink,
  Sparkles,
  AlertCircle,
  FileImage,
  Eye,
  MessageSquare,
  Plus,
  RefreshCw
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "./NeedsMeNow";
import { TargetBar } from "./TargetBar";
import { HelperText } from "./HelperText";
import { RowActions } from "./RowActions";

export interface DesignProjectItem {
  id: string;
  client: string;
  title: string;
  assetType: "Mobile App UI" | "Web Portal" | "Brand Identity" | "Marketing Creative" | "Design System";
  figmaUrl: string;
  status: "Drafting" | "Client Review" | "Changes Requested" | "Approved (Handoff)";
  dueDate: string;
  pendingFeedbackCount: number;
  assignedDev?: string;
}

interface DesignerStudioDashboardProps {
  personName?: string;
}

export function DesignerStudioDashboard({
  personName = "Lane"
}: DesignerStudioDashboardProps) {
  const [activeTab, setActiveTab] = useState<"queue" | "client_feedback" | "handoffs">("queue");

  const needsMeItems: ActionItem[] = [
    {
      id: "des-rev-1",
      title: "Acme Cloud ERP: Client left 4 comments on the Checkout Modal in Figma",
      category: "Design Revisions",
      urgency: "high",
      dueText: "Review & resolve today",
      contextUrl: "https://figma.com/file/acme-checkout",
      assigneeName: personName
    },
    {
      id: "des-rev-2",
      title: "Globex Healthcare: Hand off Design Tokens & SVG Icons to Mika (Frontend Dev)",
      category: "Handoff to Dev",
      urgency: "medium",
      dueText: "Due 4:00 PM",
      contextUrl: "/design/zeta-tokens",
      assigneeName: personName
    }
  ];

  const designQueue: DesignProjectItem[] = [
    {
      id: "DES-201",
      client: "Acme Cloud",
      title: "Enterprise Settings & Multi-factor Auth Screens",
      assetType: "Web Portal",
      figmaUrl: "https://figma.com/file/acme-settings",
      status: "Changes Requested",
      dueDate: "Today",
      pendingFeedbackCount: 3,
      assignedDev: "Mika"
    },
    {
      id: "DES-202",
      client: "Globex Health",
      title: "Doctor Video Consultation Mobile Viewport",
      assetType: "Mobile App UI",
      figmaUrl: "https://figma.com/file/globex-mobile",
      status: "Drafting",
      dueDate: "Tomorrow",
      pendingFeedbackCount: 0,
      assignedDev: "Parker"
    },
    {
      id: "DES-203",
      client: "Apex Logistics",
      title: "Q4 Social Media Campaign Banner Pack (12 assets)",
      assetType: "Marketing Creative",
      figmaUrl: "https://figma.com/file/example-banners",
      status: "Client Review",
      dueDate: "Oct 08",
      pendingFeedbackCount: 1,
      assignedDev: "Sasha"
    },
    {
      id: "DES-204",
      client: "TaskBoard OS",
      title: "Linear-style Light/Dark Navigation Tokens",
      assetType: "Design System",
      figmaUrl: "https://figma.com/file/example-design-system",
      status: "Approved (Handoff)",
      dueDate: "Oct 09",
      pendingFeedbackCount: 0,
      assignedDev: "Riley"
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Design Studio Desk
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {personName} • UI/UX & Creative Design
            </span>
          </div>
          <HelperText
            text="Figma workspaces, creative queues, client visual review comments, and developer handoff specs."
            tooltip="Single-click status updates and direct links into Figma artboards."
          />
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://figma.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted/60 transition-colors"
          >
            <Palette className="w-3.5 h-3.5 text-muted-foreground" />
            Open Figma Workspace
          </a>

          <button
            onClick={() => alert("Creating a new design ticket...")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Design Asset
          </button>
        </div>
      </div>

      {/* Targets Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TargetBar
          label="Screens Approved This Sprint"
          current={18}
          target={22}
          unit="screens"
          helper="Goal: 22 client-approved screens"
          color="purple"
        />
        <TargetBar
          label="First-Draft Turnaround Time"
          current={1.4}
          target={2.0}
          unit="days"
          helper="Average time from brief to Figma V1"
          color="emerald"
        />
        <TargetBar
          label="Open Client Revision Requests"
          current={2}
          target={0}
          unit="revisions"
          helper="2 items waiting on your adjustment"
          color="blue"
        />
      </div>

      {/* Needs Me Now */}
      <NeedsMeNow
        items={needsMeItems}
        title="Immediate Design Attention"
        helper="Client revision comments and pending developer handoffs."
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("queue")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "queue"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="w-4 h-4" />
          Active Design Queue ({designQueue.length})
        </button>
        <button
          onClick={() => setActiveTab("client_feedback")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "client_feedback"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Client Feedback & Comments (4)
        </button>
        <button
          onClick={() => setActiveTab("handoffs")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "handoffs"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Ready for Dev Handoff (1)
        </button>
      </div>

      {/* Main Design Queue */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Design Artboards & Creative Deliverables
            </h3>
            <HelperText text="Track each visual asset from initial wireframe to client sign-off." />
          </div>
        </div>

        <div className="border border-border/60 rounded-xl overflow-hidden bg-card/60 divide-y divide-border/50">
          {designQueue.map((item) => (
            <div
              key={item.id}
              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                    {item.client}
                  </span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    {item.assetType}
                  </span>
                  <span className="font-medium text-sm text-foreground">
                    {item.title}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <a
                    href={item.figmaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 font-medium"
                  >
                    <Palette className="w-3.5 h-3.5" /> Open in Figma
                  </a>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Due: {item.dueDate}
                  </span>
                  {item.assignedDev && (
                    <>
                      <span>•</span>
                      <span>Dev: {item.assignedDev}</span>
                    </>
                  )}
                  {item.pendingFeedbackCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        {item.pendingFeedbackCount} comments to resolve
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    item.status === "Changes Requested"
                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                      : item.status === "Client Review"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      : item.status === "Approved (Handoff)"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  }`}
                >
                  {item.status}
                </span>

                <RowActions
                  itemId={item.id}
                  itemTitle={item.title}
                  itemType="task"
                  onUpdateStatus={() => alert(`Status updated for ${item.title}`)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
