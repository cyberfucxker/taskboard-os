"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Briefcase,
  UserPlus,
  Gift,
  DollarSign,
  FileCheck,
  ChevronRight,
  Plus
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "./NeedsMeNow";
import { TargetBar } from "./TargetBar";
import { HelperText } from "./HelperText";
import { RowActions } from "./RowActions";

export interface LeaveRequestItem {
  id: string;
  name: string;
  role: string;
  department: string;
  type: "Casual Leave" | "Sick Leave" | "Work from Home";
  dates: string;
  days: number;
  reason: string;
}

export interface CandidateItem {
  id: string;
  name: string;
  role: string;
  experience: string;
  stage: "Applied" | "Screening" | "Technical Interview" | "Founder Call" | "Offer";
  interviewTime?: string;
  rating: number;
}

export interface OnboardingItem {
  id: string;
  name: string;
  type: "Joining" | "Exit";
  role: string;
  date: string;
  completedSteps: number;
  totalSteps: number;
  pendingItem: string;
}

export interface TeamCelebration {
  id: string;
  name: string;
  type: "Birthday" | "Work Anniversary" | "Probation Review" | string;
  date: string;
  daysLeft: number;
}

interface HrPeopleDeskDashboardProps {
  personName?: string;
}

export function HrPeopleDeskDashboard({
  personName = "Casey Brooks"
}: HrPeopleDeskDashboardProps) {
  const [activeTab, setActiveTab] = useState<"requests" | "hiring" | "onboarding" | "payroll">("requests");

  const needsMeItems: ActionItem[] = [
    {
      id: "hr-leave-1",
      title: "Nova (Sales): Applied for 2-day Casual Leave (Oct 08 - Oct 09)",
      category: "Leave Approval",
      urgency: "high",
      dueText: "Approve or Reject before 2:00 PM",
      contextUrl: "/people/leave/req-102",
      assigneeName: personName
    },
    {
      id: "hr-hire-2",
      title: "Senior React Dev interview scheduled with candidate Robin at 4:30 PM",
      category: "Interview Today",
      urgency: "medium",
      dueText: "Interview in 3 hours",
      contextUrl: "/hiring/candidate/98",
      assigneeName: personName
    }
  ];

  const leaveRequests: LeaveRequestItem[] = [
    {
      id: "lv-1",
      name: "Nova",
      role: "Sales Executive",
      department: "Sales",
      type: "Casual Leave",
      dates: "Oct 08 - Oct 09",
      days: 2,
      reason: "Family function out of station"
    },
    {
      id: "lv-2",
      name: "Devon",
      role: "SEO Executive",
      department: "Digital Marketing",
      type: "Sick Leave",
      dates: "Today (Oct 06)",
      days: 1,
      reason: "Viral fever and doctor consultation"
    },
    {
      id: "lv-3",
      name: "Sam",
      role: "UI Designer",
      department: "Design",
      type: "Work from Home",
      dates: "Oct 07",
      days: 1,
      reason: "Internet technician visit at home"
    }
  ];

  const candidates: CandidateItem[] = [
    {
      id: "cand-1",
      name: "Robin Hart",
      role: "Senior Fullstack Developer",
      experience: "5.5 yrs (Next.js, Node.js)",
      stage: "Technical Interview",
      interviewTime: "Today @ 4:30 PM",
      rating: 4.5
    },
    {
      id: "cand-2",
      name: "Pia Ford",
      role: "Business Analyst / Pre-Sales",
      experience: "3 yrs (Upwork, Scope Docs)",
      stage: "Founder Call",
      interviewTime: "Tomorrow @ 11:00 AM",
      rating: 4.8
    },
    {
      id: "cand-3",
      name: "Alan Smith",
      role: "SEO Specialist",
      experience: "2 yrs (E-commerce SEO)",
      stage: "Screening",
      rating: 4.0
    }
  ];

  const onboardingList: OnboardingItem[] = [
    {
      id: "onb-1",
      name: "Nina Reed",
      type: "Joining",
      role: "Frontend Developer",
      date: "Joined Oct 01",
      completedSteps: 6,
      totalSteps: 8,
      pendingItem: "Git SSH key & AWS Staging Credentials setup"
    },
    {
      id: "onb-2",
      name: "Abe Cole",
      type: "Joining",
      role: "SEO Executive",
      date: "Joined Sep 25",
      completedSteps: 7,
      totalSteps: 8,
      pendingItem: "First 14-day check-in review with Hayden"
    }
  ];

  const celebrations: TeamCelebration[] = [
    {
      id: "cel-1",
      name: "Lane (Designer)",
      type: "Birthday",
      date: "Oct 09",
      daysLeft: 3
    },
    {
      id: "cel-2",
      name: "Mika (Senior Dev)",
      type: "Work Anniversary (2 Years)",
      date: "Oct 12",
      daysLeft: 6
    },
    {
      id: "cel-3",
      name: "Mallory (Sales)",
      type: "Probation Review",
      date: "Oct 15",
      daysLeft: 9
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              People & HR Desk
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {personName} • Human Resources & Culture
            </span>
          </div>
          <HelperText
            text="Attendance pulse, leave requests, hiring pipeline, onboarding checklists, and payroll preparation."
            tooltip="Single-click approvals with instant notifications sent to team members."
          />
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/people"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted/60 transition-colors"
          >
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            Team Directory (27)
          </Link>

          <Link
            href="/hiring"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Candidate
          </Link>
        </div>
      </div>

      {/* Attendance & Pulse Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl border border-border/60 bg-card/60">
          <span className="text-xs font-medium text-muted-foreground">Present Today</span>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            25 <span className="text-xs font-normal text-muted-foreground">/ 27</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-card/60">
          <span className="text-xs font-medium text-muted-foreground">On Leave</span>
          <div className="text-2xl font-bold text-foreground mt-1">
            2 <span className="text-xs font-normal text-muted-foreground">employees</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-card/60">
          <span className="text-xs font-medium text-muted-foreground">Late Check-ins</span>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            1 <span className="text-xs font-normal text-muted-foreground">today</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-card/60">
          <span className="text-xs font-medium text-muted-foreground">Open Leave Requests</span>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            3 <span className="text-xs font-normal text-muted-foreground">pending</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-card/60 col-span-2 md:col-span-1">
          <span className="text-xs font-medium text-muted-foreground">Payroll Due In</span>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
            25 <span className="text-xs font-normal text-muted-foreground">days</span>
          </div>
        </div>
      </div>

      {/* Needs Me Now */}
      <NeedsMeNow
        items={needsMeItems}
        title="Immediate People Actions"
        helper="Pending leave approvals, urgent attendance queries, and interviews today."
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "requests"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock className="w-4 h-4" />
          Leave & Attendance Requests ({leaveRequests.length})
        </button>
        <button
          onClick={() => setActiveTab("hiring")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "hiring"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Hiring Pipeline ({candidates.length})
        </button>
        <button
          onClick={() => setActiveTab("onboarding")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "onboarding"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          Joining & Exit Checklists ({onboardingList.length})
        </button>
        <button
          onClick={() => setActiveTab("payroll")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "payroll"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Payroll & Sales Incentives
        </button>
      </div>

      {/* Tab 1: Leave Requests */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Pending Leave & WFH Requests
              </h3>
              <HelperText text="Review dates, duration, reason, and remaining balance before approving." />
            </div>
          </div>

          <div className="border border-border/60 rounded-xl overflow-hidden bg-card/60 divide-y divide-border/50">
            {leaveRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {req.name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                      {req.department}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      {req.type} ({req.days} {req.days === 1 ? "day" : "days"})
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Dates:</span> {req.dates} •{" "}
                    <span className="italic">"{req.reason}"</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => alert(`Approved leave for ${req.name}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    onClick={() => alert(`Rejected leave for ${req.name}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Hiring Pipeline */}
      {activeTab === "hiring" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Active Candidates & Interview Schedule
              </h3>
              <HelperText text="Track each candidate through screening, technical review, and final offer." />
            </div>
          </div>

          <div className="border border-border/60 rounded-xl overflow-hidden bg-card/60 divide-y divide-border/50">
            {candidates.map((cand) => (
              <div
                key={cand.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {cand.name}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {cand.role}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Experience: {cand.experience}</span>
                    {cand.interviewTime && (
                      <>
                        <span>•</span>
                        <span className="font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {cand.interviewTime}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-foreground border border-border">
                    {cand.stage}
                  </span>

                  <RowActions
                    itemId={cand.id}
                    itemTitle={`Candidate ${cand.name}`}
                    itemType="lead"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Onboarding & Exits */}
      {activeTab === "onboarding" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Employee Joining & Exit Checklists
              </h3>
              <HelperText text="Ensures hardware, emails, logins, and project handovers are complete." />
            </div>
          </div>

          <div className="border border-border/60 rounded-xl overflow-hidden bg-card/60 divide-y divide-border/50">
            {onboardingList.map((item) => (
              <div
                key={item.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {item.name}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      {item.type}: {item.role}
                    </span>
                    <span className="text-xs text-muted-foreground">({item.date})</span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      Pending: {item.pendingItem}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs font-medium text-muted-foreground">
                    {item.completedSteps} / {item.totalSteps} steps completed
                  </span>

                  <RowActions
                    itemId={item.id}
                    itemTitle={`Onboarding for ${item.name}`}
                    itemType="task"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Payroll & Incentives */}
      {activeTab === "payroll" && (
        <div className="p-6 rounded-xl border border-border/60 bg-card/60 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                October 2026 Payroll Preparation
              </h3>
              <p className="text-xs text-muted-foreground">
                Attendance reconciled up to yesterday. Commission calculations ready for sales team.
              </p>
            </div>
            <button
              onClick={() => alert("Downloading attendance reconciliation sheet...")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Export Payroll CSV
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-xs text-muted-foreground">Total Salary Outflow</span>
              <div className="text-xl font-bold text-foreground mt-1">₹18,45,000</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-xs text-muted-foreground">Sales Incentives Accrued</span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">₹1,12,500</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-xs text-muted-foreground">Deductions (Unpaid Leaves)</span>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">₹14,200</div>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Team Dates Strip */}
      <div className="p-5 rounded-xl border border-border/60 bg-card/60 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Birthdays, Anniversaries & Probation Reviews (Next 14 Days)
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {celebrations.map((cel) => (
            <div
              key={cel.id}
              className="p-3 rounded-lg border border-border/40 bg-muted/30 flex items-center justify-between"
            >
              <div>
                <span className="text-xs font-semibold text-foreground block">
                  {cel.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {cel.type} • {cel.date}
                </span>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">
                in {cel.daysLeft}d
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}