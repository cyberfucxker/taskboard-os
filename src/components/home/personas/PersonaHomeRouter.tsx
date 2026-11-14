"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Briefcase,
  Code,
  Palette,
  TrendingUp,
  Shield,
  Layers,
  HeartHandshake,
  Target,
  FileSpreadsheet,
  Zap,
  ChevronDown
} from "lucide-react";

import { FounderDashboard } from "./FounderDashboard";
import { CooControlRoomDashboard } from "./CooControlRoomDashboard";
import { ChiefOfStaffDashboard } from "./ChiefOfStaffDashboard";
import { PostSalesDashboard } from "./PostSalesDashboard";
import { OutreachDashboard } from "./OutreachDashboard";
import { RequirementDeskDashboard } from "./RequirementDeskDashboard";
import { BdmDashboard } from "./BdmDashboard";
import { CloserDashboard } from "./CloserDashboard";
import { DesignerStudioDashboard } from "./DesignerStudioDashboard";
import { DeveloperSprintDashboard } from "./DeveloperSprintDashboard";
import { MarketingSeoDashboard } from "./MarketingSeoDashboard";
import { HrPeopleDeskDashboard } from "./HrPeopleDeskDashboard";

export interface PersonaProfile {
  id: string;
  name: string;
  role: string;
  department: string;
  personaKey:
    | "founder"
    | "coo"
    | "chief_of_staff"
    | "post_sales"
    | "outreach"
    | "requirement_desk"
    | "bdm"
    | "closer"
    | "designer"
    | "developer"
    | "marketing_seo"
    | "hr";
}

export const EMPLOYEES: PersonaProfile[] = [
  {
    id: "emp-alex",
    name: "Alex Morgan",
    role: "Founder & CEO",
    department: "Executive",
    personaKey: "founder"
  },
  {
    id: "emp-jordan",
    name: "Jordan",
    role: "COO / Operations Head",
    department: "Operations",
    personaKey: "coo"
  },
  {
    id: "emp-kit",
    name: "Kit Morgan",
    role: "Chief of Staff",
    department: "Founder's Office",
    personaKey: "chief_of_staff"
  },
  {
    id: "emp-peyton",
    name: "Peyton",
    role: "Post-Sales & Account Manager",
    department: "Operations",
    personaKey: "post_sales"
  },
  {
    id: "emp-nova",
    name: "Nova",
    role: "Outreach & Inbound Lead Gen",
    department: "Sales",
    personaKey: "outreach"
  },
  {
    id: "emp-kai",
    name: "Kai",
    role: "Requirement Analyst & Pre-Sales",
    department: "Sales",
    personaKey: "requirement_desk"
  },
  {
    id: "emp-skyler",
    name: "Skyler",
    role: "Business Development Manager (BDM)",
    department: "Sales",
    personaKey: "bdm"
  },
  {
    id: "emp-sage",
    name: "Sage",
    role: "Sales Closer & Lead Negotiator",
    department: "Sales",
    personaKey: "closer"
  },
  {
    id: "emp-lane",
    name: "Lane",
    role: "UI/UX & Creative Designer",
    department: "Design",
    personaKey: "designer"
  },
  {
    id: "emp-sam",
    name: "Sam",
    role: "UI/UX & Graphic Designer",
    department: "Design",
    personaKey: "designer"
  },
  {
    id: "emp-parker",
    name: "Parker",
    role: "Fullstack Software Engineer",
    department: "Engineering",
    personaKey: "developer"
  },
  {
    id: "emp-mika",
    name: "Mika",
    role: "Senior Fullstack Engineer",
    department: "Engineering",
    personaKey: "developer"
  },
  {
    id: "emp-riley",
    name: "Riley",
    role: "Backend & Systems Engineer",
    department: "Engineering",
    personaKey: "developer"
  },
  {
    id: "emp-nina",
    name: "Nina Reed",
    role: "Frontend Developer",
    department: "Engineering",
    personaKey: "developer"
  },
  {
    id: "emp-kendall",
    name: "Kendall",
    role: "SEO & Growth Lead",
    department: "Digital Marketing",
    personaKey: "marketing_seo"
  },
  {
    id: "emp-sasha",
    name: "Sasha",
    role: "Content Strategy & Copywriter",
    department: "Digital Marketing",
    personaKey: "marketing_seo"
  },
  {
    id: "emp-devon",
    name: "Devon",
    role: "Search Engine Optimization Specialist",
    department: "Digital Marketing",
    personaKey: "marketing_seo"
  },
  {
    id: "emp-casey",
    name: "Casey Brooks",
    role: "Head of People & HR",
    department: "Human Resources",
    personaKey: "hr"
  }
];

interface PersonaHomeRouterProps {
  initialEmployeeId?: string;
  showSwitcher?: boolean;
}

export function PersonaHomeRouter({
  initialEmployeeId = "emp-alex",
  showSwitcher = true
}: PersonaHomeRouterProps) {
  const [selectedEmpId, setSelectedEmpId] = useState<string>(initialEmployeeId);

  // Sync with localStorage if present
  useEffect(() => {
    try {
      const saved = localStorage.getItem("taskboard_active_persona");
      if (saved && EMPLOYEES.some((e) => e.id === saved)) {
        setSelectedEmpId(saved);
      }
    } catch (e) {
      // Ignore in SSR
    }
  }, []);

  const handleSelectEmployee = (empId: string) => {
    setSelectedEmpId(empId);
    try {
      localStorage.setItem("taskboard_active_persona", empId);
    } catch (e) {}
  };

  const activeEmployee =
    EMPLOYEES.find((e) => e.id === selectedEmpId) || EMPLOYEES[0];

  const renderDashboard = () => {
    switch (activeEmployee.personaKey) {
      case "founder":
        return <FounderDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "coo":
        return <CooControlRoomDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "chief_of_staff":
        return <ChiefOfStaffDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "post_sales":
        return <PostSalesDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "outreach":
        return <OutreachDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "requirement_desk":
        return <RequirementDeskDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "bdm":
        return <BdmDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "closer":
        return <CloserDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "designer":
        return <DesignerStudioDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "developer":
        return <DeveloperSprintDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "marketing_seo":
        return <MarketingSeoDashboard {...({ personName: activeEmployee.name } as any)} />;
      case "hr":
        return <HrPeopleDeskDashboard {...({ personName: activeEmployee.name } as any)} />;
      default:
        return <DeveloperSprintDashboard {...({ personName: activeEmployee.name } as any)} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Persona Switcher Header Bar */}
      {showSwitcher && (
        <div className="p-3 bg-card/80 backdrop-blur border border-border/80 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-foreground">
              Persona Lens Active:
            </span>
            <span>
              {activeEmployee.name} ({activeEmployee.role})
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label
              htmlFor="persona-select"
              className="text-xs font-medium text-muted-foreground whitespace-nowrap"
            >
              Switch Role View:
            </label>
            <div className="relative w-full sm:w-64">
              <select
                id="persona-select"
                value={selectedEmpId}
                onChange={(e) => handleSelectEmployee(e.target.value)}
                className="w-full text-xs font-medium bg-background border border-border rounded-lg px-3 py-1.5 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                <optgroup label="Leadership & Ops">
                  <option value="emp-alex">Alex Morgan (Founder & CEO)</option>
                  <option value="emp-jordan">
                    Jordan (COO / Operations)
                  </option>
                  <option value="emp-kit">
                    Kit Morgan (Chief of Staff)
                  </option>
                  <option value="emp-peyton">
                    Peyton (Post-Sales & Accounts)
                  </option>
                  <option value="emp-casey">
                    Casey Brooks (HR & People)
                  </option>
                </optgroup>

                <optgroup label="Sales Pipeline">
                  <option value="emp-nova">Nova (Outreach & Leads)</option>
                  <option value="emp-kai">
                    Kai (Requirement Desk)
                  </option>
                  <option value="emp-skyler">Skyler (BDM & Proposals)</option>
                  <option value="emp-sage">
                    Sage (Closer & Negotiation)
                  </option>
                </optgroup>

                <optgroup label="Design Studio">
                  <option value="emp-lane">
                    Lane (UI/UX & Creative)
                  </option>
                  <option value="emp-sam">
                    Sam (Design Systems)
                  </option>
                </optgroup>

                <optgroup label="Software Engineering">
                  <option value="emp-parker">
                    Parker (Fullstack Developer)
                  </option>
                  <option value="emp-mika">
                    Mika (Senior Developer)
                  </option>
                  <option value="emp-riley">Riley (Backend Engineer)</option>
                  <option value="emp-nina">
                    Nina Reed (Frontend Dev)
                  </option>
                </optgroup>

                <optgroup label="Marketing & Growth">
                  <option value="emp-kendall">Kendall (SEO & Growth Lead)</option>
                  <option value="emp-sasha">
                    Sasha (Content Strategy)
                  </option>
                  <option value="emp-devon">
                    Devon (SEO Specialist)
                  </option>
                </optgroup>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {/* Render Active Persona Dashboard */}
      {renderDashboard()}
    </div>
  );
}
