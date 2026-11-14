import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { effectiveCapsForSession } from "@/lib/scope";

export const dynamic = "force-dynamic";

export interface PipelineTaskTemplate {
  title: string;
  category: "DEVELOPMENT" | "DESIGN" | "CALL" | "MEETING" | "BUG_FIX" | "CRM" | "ADMIN" | "DOCUMENTATION" | "OTHER";
  priority: "P0" | "P1" | "P2" | "P3";
  estimateHrs?: number;
  gainLever?: string;
  subtasks: { title: string; description?: string }[];
  defaultRoleOrTitle?: string;
}

export interface DepartmentPipeline {
  id: string;
  name: string;
  departmentSlug: "dev" | "design" | "sales" | "dm" | "hr" | "leadership" | "custom";
  departmentName: string;
  description: string;
  badge: string;
  color: string;
  tier?: string;
  estimatedDays: number;
  tasks: PipelineTaskTemplate[];
  isCustom?: boolean;
}

export const SEEDED_PIPELINES: DepartmentPipeline[] = [
  {
    id: "pipe-dev-webapp",
    name: "Full-Stack Web App & SaaS Pipeline",
    departmentSlug: "dev",
    departmentName: "Engineering / Dev",
    description: "End-to-end architecture, API contracts, frontend components, automated CI/CD and production hardening.",
    badge: "Engineering",
    color: "#56A7B0",
    estimatedDays: 14,
    tasks: [
      {
        title: "1. Repo Architecture, Branching & CI/CD Setup",
        category: "DEVELOPMENT",
        priority: "P1",
        estimateHrs: 4,
        gainLever: "Standardized git hygiene & instant deployment pipelines",
        defaultRoleOrTitle: "Senior Full Stack Developer",
        subtasks: [
          { title: "Initialize repository with Next.js 14 / TypeScript / Tailwind" },
          { title: "Configure ESLint, Prettier, and Husky pre-commit hooks" },
          { title: "Setup GitHub Actions for automated lint and type check" },
          { title: "Configure Staging VPS reverse proxy & automated deploy webhook" },
        ],
      },
      {
        title: "2. Database Schema, Prisma Migrations & Auth Gateways",
        category: "DEVELOPMENT",
        priority: "P0",
        estimateHrs: 6,
        gainLever: "Robust relational data layer with role-based security",
        defaultRoleOrTitle: "Senior Full Stack Developer",
        subtasks: [
          { title: "Design PostgreSQL schema tables with foreign keys and indexes" },
          { title: "Apply Prisma migrations and generate client types" },
          { title: "Setup NextAuth credentials & session guard middleware" },
          { title: "Seed test data for Super Admin, Leads, and Executives" },
        ],
      },
      {
        title: "3. Core Backend API Routes & External Integrations",
        category: "DEVELOPMENT",
        priority: "P1",
        estimateHrs: 12,
        gainLever: "High-performance, authenticated API endpoints",
        defaultRoleOrTitle: "Senior Full Stack Developer",
        subtasks: [
          { title: "Build CRUD endpoints with Zod payload validation" },
          { title: "Implement webhook receiver endpoints with challenge verification" },
          { title: "Configure background retry queue / transaction rollbacks" },
        ],
      },
      {
        title: "4. Frontend Responsive UI & State Management",
        category: "DEVELOPMENT",
        priority: "P1",
        estimateHrs: 16,
        gainLever: "Clean Linear-grade responsive interface for desktop & mobile",
        defaultRoleOrTitle: "Senior Full Stack Developer",
        subtasks: [
          { title: "Implement modular reusable UI atoms & theme variables" },
          { title: "Build interactive drawers, data tables, and search filters" },
          { title: "Optimize mobile viewport layout and touch targets" },
        ],
      },
      {
        title: "5. Security Audit, Pentest & Production Release",
        category: "DEVELOPMENT",
        priority: "P0",
        estimateHrs: 6,
        gainLever: "Zero vulnerability launch with full monitoring",
        defaultRoleOrTitle: "Senior Full Stack Developer",
        subtasks: [
          { title: "Audit SQL injection, CSRF tokens, and permission escalations" },
          { title: "Perform cross-browser testing (Chrome, Safari, iOS PWA)" },
          { title: "Configure SSL certificate & production systemd service" },
          { title: "Archive technical credentials in Developer Hub" },
        ],
      },
    ],
  },
  {
    id: "pipe-design-uiux",
    name: "UI/UX & Product Design System Pipeline",
    departmentSlug: "design",
    departmentName: "UI/UX Design",
    description: "Complete design process from discovery wireframes to high-fidelity Figma components and developer handoff.",
    badge: "Design",
    color: "#F778BA",
    estimatedDays: 10,
    tasks: [
      {
        title: "1. Discovery, Moodboard & Information Architecture",
        category: "DESIGN",
        priority: "P1",
        estimateHrs: 4,
        gainLever: "Crystal-clear user journey and visual foundation",
        defaultRoleOrTitle: "Designer",
        subtasks: [
          { title: "Analyze client requirements, target personas, and competitor benchmarks" },
          { title: "Create moodboard with typography, color palette, and dark/light tokens" },
          { title: "Map user flow diagrams and screen hierarchy" },
        ],
      },
      {
        title: "2. Low-Fidelity Wireframing & Core Workflows",
        category: "DESIGN",
        priority: "P1",
        estimateHrs: 6,
        gainLever: "Fast structural alignment before high-fidelity detailing",
        defaultRoleOrTitle: "Designer",
        subtasks: [
          { title: "Draft wireframe screens for desktop dashboard layout" },
          { title: "Draft mobile viewport wireframes and navigation drawers" },
          { title: "Conduct internal review with product & engineering leads" },
        ],
      },
      {
        title: "3. High-Fidelity Figma Mockups & Component Tokens",
        category: "DESIGN",
        priority: "P0",
        estimateHrs: 14,
        gainLever: "Pixel-perfect visual design system ready for engineering",
        defaultRoleOrTitle: "Designer",
        subtasks: [
          { title: "Build standardized Figma design system components (buttons, inputs, cards)" },
          { title: "Design high-fidelity screens for all core pages" },
          { title: "Design empty states, loading skeletons, and error screens" },
        ],
      },
      {
        title: "4. Interactive Prototype & Client Walkthrough",
        category: "DESIGN",
        priority: "P1",
        estimateHrs: 4,
        gainLever: "Secures client signoff and clarifies interaction behaviors",
        defaultRoleOrTitle: "Designer",
        subtasks: [
          { title: "Link Figma screens into interactive clickable prototype" },
          { title: "Record Loom walkthrough video explaining key decisions" },
          { title: "Incorporate client feedback and produce final revision" },
        ],
      },
      {
        title: "5. Dev Handoff, Asset Export & Design QA",
        category: "DESIGN",
        priority: "P1",
        estimateHrs: 4,
        gainLever: "Flawless engineering implementation with zero visual drift",
        defaultRoleOrTitle: "Designer",
        subtasks: [
          { title: "Organize Figma auto-layouts, spacing tokens, and asset exports (SVG/PNG)" },
          { title: "Conduct live design-to-code QA with frontend developer" },
        ],
      },
    ],
  },
  {
    id: "pipe-sales-closing",
    name: "High-Ticket Client Acquisition & Closing Pipeline",
    departmentSlug: "sales",
    departmentName: "Sales & Growth",
    description: "Standard operating pipeline for inbound/outbound leads from initial discovery to signed agreement & kickoff.",
    badge: "Sales",
    color: "#6DBB7C",
    estimatedDays: 7,
    tasks: [
      {
        title: "1. Inbound Lead Qualification & Discovery Call",
        category: "CALL",
        priority: "P0",
        estimateHrs: 2,
        gainLever: "Rapid lead response time (<15 min) and BANT qualification",
        defaultRoleOrTitle: "Sales Closer",
        subtasks: [
          { title: "Conduct 20-min discovery call to identify pain points and objectives" },
          { title: "Verify budget, timeline, and decision-maker involvement" },
          { title: "Log notes and update CRM stage to QUALIFIED" },
        ],
      },
      {
        title: "2. Custom Scope of Work (SOW) & Proposal Deck",
        category: "DOCUMENTATION",
        priority: "P0",
        estimateHrs: 4,
        gainLever: "Compelling ROI-focused proposal tailored to client needs",
        defaultRoleOrTitle: "Sales Closer",
        subtasks: [
          { title: "Draft technical scope breakdown and deliverables list" },
          { title: "Calculate project pricing tiers with leadership margin approval" },
          { title: "Assemble branded proposal presentation deck" },
        ],
      },
      {
        title: "3. Solution Pitch & Live Demo Presentation",
        category: "MEETING",
        priority: "P0",
        estimateHrs: 2,
        gainLever: "Live objection handling and value demonstration",
        defaultRoleOrTitle: "Sales Closer",
        subtasks: [
          { title: "Host live Zoom presentation with key stakeholders" },
          { title: "Walk through showcase architecture and project timeline" },
          { title: "Address commercial and technical questions" },
        ],
      },
      {
        title: "4. Contract Sign-off & Advance Retainer Invoice",
        category: "ADMIN",
        priority: "P0",
        estimateHrs: 2,
        gainLever: "Formal commercial commitment and cash collected",
        defaultRoleOrTitle: "Sales Closer",
        subtasks: [
          { title: "Send service agreement and NDA via DocuSign / SignDesk" },
          { title: "Issue 50% advance retainer invoice and confirm receipt" },
          { title: "Mark Lead as CLOSED_WON in CRM" },
        ],
      },
      {
        title: "5. Onboarding Kickoff & Transition to Dev/Design",
        category: "MEETING",
        priority: "P1",
        estimateHrs: 2,
        gainLever: "Smooth transition preventing client buyer remorse",
        defaultRoleOrTitle: "Sales Closer",
        subtasks: [
          { title: "Create client project in TaskBoard OS and link credentials" },
          { title: "Host internal handover meeting with Tech Lead and Designer" },
          { title: "Schedule official client kickoff call" },
        ],
      },
    ],
  },
  {
    id: "pipe-dm-campaign",
    name: "Performance Marketing & Meta Ad Campaign Pipeline",
    departmentSlug: "dm",
    departmentName: "Digital Marketing",
    description: "Multi-channel advertising launch from audience research to live ads, tracking pixels, and ROAS optimization.",
    badge: "Marketing",
    color: "#D29922",
    estimatedDays: 7,
    tasks: [
      {
        title: "1. Competitor Ad Research & Audience Persona Mapping",
        category: "OTHER",
        priority: "P1",
        estimateHrs: 3,
        gainLever: "Data-driven targeting strategy and creative angle discovery",
        defaultRoleOrTitle: "DM Executive",
        subtasks: [
          { title: "Analyze competitor creative angles in Meta Ad Library" },
          { title: "Define top 3 target customer avatars and pain triggers" },
          { title: "Select interest, demographic, and lookalike audience clusters" },
        ],
      },
      {
        title: "2. Ad Copywriting & High-Converting Creative Production",
        category: "DESIGN",
        priority: "P0",
        estimateHrs: 6,
        gainLever: "High CTR creatives with clear call-to-actions",
        defaultRoleOrTitle: "Senior Graphic Designer + Video Editor",
        subtasks: [
          { title: "Write 5 ad copy variations (Hook, Problem, Solution, Social Proof, CTA)" },
          { title: "Design 6 visual banner creatives (1080x1080 & 1080x1920 stories)" },
          { title: "Produce 2 short-form video ads / motion graphics" },
        ],
      },
      {
        title: "3. Meta Pixel, CAPI & Conversion Tracking Setup",
        category: "DEVELOPMENT",
        priority: "P0",
        estimateHrs: 3,
        gainLever: "Accurate server-side attribution for ROAS tracking",
        defaultRoleOrTitle: "DM Team Lead",
        subtasks: [
          { title: "Verify Meta Pixel and Google Analytics 4 tracking events" },
          { title: "Test Lead Form webhook ingestion in TaskBoard OS" },
          { title: "Setup custom conversion triggers on landing page" },
        ],
      },
      {
        title: "4. Campaign Launch & A/B Testing Matrix",
        category: "ADMIN",
        priority: "P1",
        estimateHrs: 3,
        gainLever: "Systematic budget allocation to winning ad sets",
        defaultRoleOrTitle: "DM Team Lead",
        subtasks: [
          { title: "Configure Meta Ads Manager campaign hierarchy (CBO/ABO)" },
          { title: "Set daily budget thresholds and automated stop-loss rules" },
          { title: "Launch ads and verify active delivery status" },
        ],
      },
      {
        title: "5. Weekly Performance Analysis & ROAS Optimization Report",
        category: "DOCUMENTATION",
        priority: "P1",
        estimateHrs: 3,
        gainLever: "Continuous reduction of Cost Per Lead (CPL)",
        defaultRoleOrTitle: "DM Team Lead",
        subtasks: [
          { title: "Review CTR, CPC, CPL, and conversion metrics after 7 days" },
          { title: "Turn off underperforming ad sets and scale top performers" },
          { title: "Generate weekly client performance dashboard report" },
        ],
      },
    ],
  },
  {
    id: "pipe-hr-onboarding",
    name: "Employee 14-Day Onboarding & Induction Pipeline",
    departmentSlug: "hr",
    departmentName: "HR & People Ops",
    description: "Structured onboarding pipeline to ensure new hires become fully productive and integrated within two weeks.",
    badge: "People",
    color: "#8B949E",
    estimatedDays: 14,
    tasks: [
      {
        title: "1. Pre-Boarding, Offer Letter & Document Verification",
        category: "ADMIN",
        priority: "P0",
        estimateHrs: 2,
        gainLever: "Complete compliance and verified documentation before Day 1",
        defaultRoleOrTitle: "HR",
        subtasks: [
          { title: "Collect government ID, address proof, and educational certificates" },
          { title: "Issue signed employment agreement and non-disclosure agreement" },
          { title: "Set up bank account details for payroll processing" },
        ],
      },
      {
        title: "2. Tooling & Workspace Access Provisioning",
        category: "ADMIN",
        priority: "P0",
        estimateHrs: 2,
        gainLever: "Zero downtime on Day 1 with immediate tool access",
        defaultRoleOrTitle: "HR",
        subtasks: [
          { title: "Create company email (name@example.com) and Google Workspace access" },
          { title: "Create TaskBoard OS account with role and department assignment" },
          { title: "Provision GitHub, Figma, Slack, and VPN credentials as required" },
        ],
      },
      {
        title: "3. Day 1 Induction & Department Introduction",
        category: "MEETING",
        priority: "P1",
        estimateHrs: 3,
        gainLever: "Strong culture alignment and clear expectations",
        defaultRoleOrTitle: "HR",
        subtasks: [
          { title: "Conduct company overview and culture induction session" },
          { title: "Introduce team member to department head and assign a peer buddy" },
          { title: "Review office timings, attendance rules (09:30-18:30 IST) and leave policy" },
        ],
      },
      {
        title: "4. First Week Goal Setting & Starter Project Assignment",
        category: "MEETING",
        priority: "P1",
        estimateHrs: 3,
        gainLever: "Hands-on execution with structured guidance",
        defaultRoleOrTitle: "HR",
        subtasks: [
          { title: "Assign initial onboarding tasks in TaskBoard OS" },
          { title: "Conduct 15-minute daily check-in to clear blockers" },
          { title: "Collect feedback at the end of Week 1" },
        ],
      },
      {
        title: "5. Day 14 360 Review & Probation Milestone Check",
        category: "DOCUMENTATION",
        priority: "P2",
        estimateHrs: 2,
        gainLever: "Early performance feedback and alignment",
        defaultRoleOrTitle: "HR",
        subtasks: [
          { title: "Gather feedback from department manager and peer buddy" },
          { title: "Conduct 1-on-1 review session with employee" },
          { title: "Document milestone progress in HRMS ledger" },
        ],
      },
    ],
  },
];

export async function GET() {
  try {
    const session = await requireRole("tasks.view");

    // Department SOP Pipelines are commercially/operationally sensitive playbooks —
    // a non-leadership viewer only ever sees their own department's pipelines.
    // `board.view` (executive overview) and `admin.scope` are the two capabilities
    // that already mean "sees across every department" elsewhere in the app.
    const caps = await effectiveCapsForSession(session as any);
    const seesAllDepartments = caps.has("board.view") || caps.has("admin.scope");
    const viewerDeptSlug = (session as any)?.user?.departmentSlug ?? null;
    
    // Also load any custom pipeline templates created by users from the Service table
    const customServices = await prisma.service.findMany({
      where: { isTemplate: true, deletedAt: null },
      include: { department: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
    });

    const customPipelines: DepartmentPipeline[] = customServices.map((s) => {
      let tasks: PipelineTaskTemplate[] = [];
      try {
        if (Array.isArray(s.taskTemplate)) {
          tasks = s.taskTemplate as unknown as PipelineTaskTemplate[];
        }
      } catch {
        tasks = [];
      }

      return {
        id: s.id,
        name: s.name,
        departmentSlug: (s.department?.slug as any) ?? "custom",
        departmentName: s.department?.name ?? "Custom Department",
        description: s.scope ?? "Custom workflow template",
        badge: s.tier ?? "Custom",
        color: "#3E8B93",
        tier: s.tier ?? undefined,
        estimatedDays: tasks.length * 2 || 7,
        tasks: tasks,
        isCustom: true,
      };
    });

    const scopedSeeded = seesAllDepartments
      ? SEEDED_PIPELINES
      : SEEDED_PIPELINES.filter((p) => p.departmentSlug === viewerDeptSlug);
    const scopedCustom = seesAllDepartments
      ? customPipelines
      : customPipelines.filter((p) => p.departmentSlug === viewerDeptSlug);

    return NextResponse.json({
      ok: true,
      seeded: scopedSeeded,
      custom: scopedCustom,
      all: [...scopedSeeded, ...scopedCustom],
      seesAllDepartments,
      viewerDeptSlug,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

const createPipelineSchema = z.object({
  name: z.string().min(2),
  departmentSlug: z.string(),
  description: z.string().optional(),
  tier: z.string().optional(),
  tasks: z.array(
    z.object({
      title: z.string().min(1),
      category: z.enum(["DEVELOPMENT", "DESIGN", "CALL", "MEETING", "BUG_FIX", "CRM", "ADMIN", "DOCUMENTATION", "OTHER"]).default("OTHER"),
      priority: z.enum(["P0", "P1", "P2", "P3"]).default("P1"),
      estimateHrs: z.number().optional(),
      gainLever: z.string().optional(),
      defaultRoleOrTitle: z.string().optional(),
      subtasks: z.array(z.object({ title: z.string().min(1), description: z.string().optional() })),
    })
  ),
});

export async function POST(req: Request) {
  try {
    const session = await requireRole("tasks.manage");
    const body = await req.json();
    const input = createPipelineSchema.parse(body);

    const dept = await prisma.department.findFirst({
      where: { slug: input.departmentSlug },
    });

    const service = await prisma.service.create({
      data: {
        name: input.name,
        departmentId: dept?.id ?? null,
        scope: input.description ?? "",
        tier: input.tier ?? "Custom SOP",
        category: input.departmentSlug,
        isTemplate: true,
        taskTemplate: input.tasks as any,
      },
      include: { department: true },
    });

    return NextResponse.json({ ok: true, pipeline: service });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
