/**
 * POST /api/mcp — TaskBoard MCP Bridge
 *
 * Authenticated with `Authorization: Bearer ${TASKBOARD_MCP_KEY}`.
 * Body: { tool: string, args: Record<string, unknown> }
 * Returns: { data: ... } | { error: string }
 *
 * This is the server-side backend for the standalone taskboard-mcp-server binary.
 * Any AI (Claude, GPT-4, Gemini, …) that connects via MCP lands here.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createTask, taskView, changeTaskStatus } from "@/lib/tasks";
import { resolveEmployee, resolveClient } from "@/lib/resolve";

// ─── Auth ────────────────────────────────────────────────────────────────────

function authorized(req: Request): boolean {
  const key = process.env.TASKBOARD_MCP_KEY;
  if (!key) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${key}` || header === key;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function ok(data: unknown) {
  return NextResponse.json({ data });
}

const TASK_INCLUDE = {
  assignee:   { select: { id: true, name: true } },
  creator:    { select: { id: true, name: true } },
  department: { select: { id: true, name: true, color: true } },
  subtasks:   true,
  assignees:  { include: { employee: { select: { id: true, name: true } } } },
  workSessions: true,
  client:  { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
} as const;

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handle_search(args: Record<string, unknown>) {
  const query  = String(args.query  ?? "");
  const entity = String(args.entity ?? "all");
  const results: Record<string, unknown[]> = {};

  if (entity === "all" || entity === "task") {
    const tasks = await prisma.task.findMany({
      where: {
        deletedAt: null,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { code:  { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      include: TASK_INCLUDE,
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    results.tasks = tasks.map(taskView);
  }

  if (entity === "all" || entity === "project") {
    const projects = await prisma.project.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name:        { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      include: { client: { select: { id: true, name: true } } },
      take: 10,
    });
    results.projects = projects.map((p) => ({
      id: p.id, name: p.name, clientName: p.client?.name, status: p.status,
    }));
  }

  if (entity === "all" || entity === "client") {
    const clients = await prisma.client.findMany({
      where: {
        deletedAt: null,
        name: { contains: query, mode: "insensitive" },
      },
      take: 10,
    });
    results.clients = clients.map((c) => ({ id: c.id, name: c.name }));
  }

  if (entity === "all" || entity === "employee") {
    const employees = await prisma.employee.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name:  { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { title: { contains: query, mode: "insensitive" } },
        ],
      },
      include: { department: { select: { name: true } } },
      take: 10,
    });
    results.employees = employees.map((e) => ({
      id: e.id, name: e.name, email: e.email, title: e.title, department: e.department?.name,
    }));
  }

  if (entity === "all" || entity === "lead") {
    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { name:    { contains: query, mode: "insensitive" } },
          { company: { contains: query, mode: "insensitive" } },
          { email:   { contains: query, mode: "insensitive" } },
        ],
      },
      include: { owner: { select: { id: true, name: true } } },
      take: 10,
    });
    results.leads = leads.map((l) => ({
      id: l.id, name: l.name, company: l.company, stage: l.stage, owner: l.owner?.name,
    }));
  }

  return results;
}

async function handle_list_tasks(args: Record<string, unknown>) {
  const { status, assignee, project, client, overdue, priority, department } = args as {
    status?: string; assignee?: string; project?: string; client?: string;
    overdue?: boolean; priority?: string; department?: string;
  };
  const limit = Math.min(Number(args.limit ?? 50), 100);

  const where: Record<string, unknown> = { deletedAt: null };

  if (status) where.status = status.toUpperCase();
  if (priority) where.priority = priority.toUpperCase();

  if (overdue) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    where.dueDate = { lt: today };
    where.status = { not: "DONE" };
  }

  if (assignee) {
    const id = await resolveEmployee(assignee);
    if (id) where.OR = [{ assigneeId: id }, { assignees: { some: { employeeId: id } } }];
  }
  if (project) {
    const p = await prisma.project.findFirst({
      where: { name: { contains: project, mode: "insensitive" }, deletedAt: null },
      select: { id: true },
    });
    if (p) where.projectId = p.id;
  }
  if (client) {
    const c = await resolveClient(client);
    if (c) where.clientId = c;
  }
  if (department) {
    const d = await prisma.department.findFirst({
      where: { name: { contains: department, mode: "insensitive" }, deletedAt: null },
      select: { id: true },
    });
    if (d) where.departmentId = d.id;
  }

  const tasks = await prisma.task.findMany({
    where,
    include: TASK_INCLUDE,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  return tasks.map(taskView);
}

async function handle_get_task(args: Record<string, unknown>) {
  const idOrTitle = String(args.id_or_title ?? args.id ?? args.title ?? "");
  if (!idOrTitle) throw new Error("id_or_title is required");

  if (idOrTitle.match(/^[a-z0-9]{20,}$/i)) {
    const t = await prisma.task.findUnique({ where: { id: idOrTitle }, include: TASK_INCLUDE });
    if (t) return taskView(t);
  }

  if (/^TSK-\d+$/i.test(idOrTitle)) {
    const t = await prisma.task.findFirst({
      where: { code: idOrTitle.toUpperCase(), deletedAt: null }, include: TASK_INCLUDE,
    });
    if (t) return taskView(t);
  }

  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, title: { contains: idOrTitle, mode: "insensitive" } },
    include: TASK_INCLUDE,
    orderBy: { updatedAt: "desc" },
    take: 1,
  });
  if (tasks[0]) return taskView(tasks[0]);

  throw new Error(`Task not found: "${idOrTitle}"`);
}

async function handle_create_task(args: Record<string, unknown>) {
  const { title, description, assignee, assigneeId, projectId, clientId, dueDate, priority } = args as {
    title?: string; description?: string; assignee?: string; assigneeId?: string;
    projectId?: string; clientId?: string; dueDate?: string; priority?: string;
  };

  if (!title?.trim()) throw new Error("title is required");
  if (!description?.trim()) throw new Error("description is required — describe exactly what needs to happen");

  let resolvedAssigneeId = assigneeId ?? null;
  if (!resolvedAssigneeId && assignee) {
    resolvedAssigneeId = await resolveEmployee(assignee);
    if (!resolvedAssigneeId) throw new Error(`Employee not found: "${assignee}"`);
  }

  let resolvedClientId = clientId ?? null;
  if (!resolvedClientId && args.client) {
    resolvedClientId = await resolveClient(String(args.client));
  }

  return createTask({
    title: title.trim(),
    description: description.trim(),
    assigneeId: resolvedAssigneeId,
    projectId:  projectId ?? null,
    clientId:   resolvedClientId,
    dueDate:    dueDate ?? null,
    priority:   (priority?.toUpperCase() as "P0"|"P1"|"P2"|"P3") ?? "P2",
    creatorId:  null,
    gain:       "MCP",
    outcome:    description.trim(),
  });
}

async function handle_update_task(args: Record<string, unknown>) {
  const id = String(args.id ?? "");
  if (!id) throw new Error("id is required");

  const task = await handle_get_task({ id_or_title: id });
  const data: Record<string, unknown> = {};

  if (args.title)       data.title = String(args.title);
  if (args.description !== undefined) data.description = args.description ? String(args.description) : null;
  if (args.priority)    data.priority = String(args.priority).toUpperCase();
  if (args.dueDate !== undefined) data.dueDate = args.dueDate ? new Date(String(args.dueDate)) : null;
  if (args.outcome !== undefined)  data.outcome = args.outcome ? String(args.outcome) : null;

  if (args.assignee || args.assigneeId) {
    let newId = args.assigneeId ? String(args.assigneeId) : null;
    if (!newId && args.assignee) {
      newId = await resolveEmployee(String(args.assignee));
      if (!newId) throw new Error(`Employee not found: "${args.assignee}"`);
    }
    data.assigneeId = newId;
  }

  if (Object.keys(data).length) {
    await prisma.task.update({ where: { id: task.id }, data });
  }

  const updated = await prisma.task.findUnique({ where: { id: task.id }, include: TASK_INCLUDE });
  return taskView(updated!);
}

async function handle_complete_task(args: Record<string, unknown>) {
  const id   = String(args.id ?? args.id_or_title ?? "");
  const note = String(args.completion_note ?? args.note ?? "").trim();

  if (!id) throw new Error("id is required");
  if (!note || note.length < 20) {
    throw new Error("completion_note is required (min 20 characters) — what was actually done?");
  }

  const task = await handle_get_task({ id_or_title: id });

  await prisma.taskComment.create({
    data: { taskId: task.id, body: `✅ Completion note: ${note}`, authorId: null },
  });
  await prisma.task.update({ where: { id: task.id }, data: { outcome: note } });
  await changeTaskStatus(task.id, "DONE", null, null);

  return { success: true, taskId: task.id, title: task.title, completionNote: note };
}

async function handle_flag_task(args: Record<string, unknown>) {
  const id     = String(args.id ?? args.id_or_title ?? "");
  const reason = String(args.reason ?? "").trim();

  if (!id) throw new Error("id is required");
  if (!reason || reason.length < 10) {
    throw new Error("reason is required (min 10 characters) — what is blocking progress?");
  }

  const task = await handle_get_task({ id_or_title: id });
  await changeTaskStatus(task.id, "BLOCKED", null, reason);

  return { success: true, taskId: task.id, title: task.title, reason };
}

async function handle_reassign_task(args: Record<string, unknown>) {
  const id         = String(args.id ?? args.id_or_title ?? "");
  const newAssignee = String(args.new_assignee ?? args.assignee ?? "");

  if (!id) throw new Error("id is required");
  if (!newAssignee && !args.new_assignee_id) throw new Error("new_assignee is required");

  const task = await handle_get_task({ id_or_title: id });

  let newAssigneeId = String(args.new_assignee_id ?? "");
  if (!newAssigneeId) {
    const resolved = await resolveEmployee(newAssignee);
    if (!resolved) throw new Error(`Employee not found: "${newAssignee}"`);
    newAssigneeId = resolved;
  }

  await prisma.task.update({ where: { id: task.id }, data: { assigneeId: newAssigneeId } });
  await prisma.taskAssignee.deleteMany({ where: { taskId: task.id } });
  await prisma.taskAssignee.create({ data: { taskId: task.id, employeeId: newAssigneeId } });

  const emp = await prisma.employee.findUnique({ where: { id: newAssigneeId }, select: { name: true } });
  return { success: true, taskId: task.id, title: task.title, newAssignee: emp?.name };
}

async function handle_list_projects(args: Record<string, unknown>) {
  const { clientId, status } = args as { clientId?: string; status?: string };

  let resolvedClientId = clientId ?? null;
  if (!resolvedClientId && args.client) resolvedClientId = await resolveClient(String(args.client));

  const where: Record<string, unknown> = { deletedAt: null };
  if (resolvedClientId) where.clientId = resolvedClientId;
  if (status) where.status = status.toUpperCase();

  const projects = await prisma.project.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      _count:  { select: { tasks: { where: { deletedAt: null } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return projects.map((p) => ({
    id: p.id, name: p.name, description: p.description, status: p.status,
    clientId: p.clientId, clientName: p.client?.name,
    taskCount: p._count.tasks,
  }));
}

async function handle_create_project(args: Record<string, unknown>) {
  const { name, clientId, description, dueDate } = args as {
    name?: string; clientId?: string; description?: string; dueDate?: string;
  };

  if (!name?.trim()) throw new Error("name is required");

  let resolvedClientId = clientId ?? null;
  if (!resolvedClientId && args.client) {
    resolvedClientId = await resolveClient(String(args.client));
    if (!resolvedClientId) throw new Error(`Client not found: "${args.client}"`);
  }

  if (!resolvedClientId) {
    const firstClient = await prisma.client.findFirst({ where: { deletedAt: null }, select: { id: true } });
    if (!firstClient) throw new Error("clientId or client name is required to create a project");
    resolvedClientId = firstClient.id;
  }

  const project = await prisma.project.create({
    data: {
      name: name.trim(), description: description ?? null,
      clientId: resolvedClientId as string, status: "ACTIVE",
    },
  });

  return { id: project.id, name: project.name, status: project.status, clientId: project.clientId };
}

async function handle_list_clients(args: Record<string, unknown>) {
  const search = String(args.search ?? "");
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    include: { _count: { select: { projects: { where: { deletedAt: null, status: "ACTIVE" } }, tasks: { where: { deletedAt: null } } } } },
    orderBy: { name: "asc" },
    take: 100,
  });

  return clients.map((c) => ({
    id: c.id, name: c.name,
    activeProjects: c._count.projects, taskCount: c._count.tasks,
  }));
}

async function handle_list_employees(args: Record<string, unknown>) {
  const { department, search } = args as { department?: string; search?: string };
  const statusFilter = String(args.status ?? "ACTIVE").split(",").map((s) => s.trim().toUpperCase());

  const where: Record<string, unknown> = { deletedAt: null, status: { in: statusFilter } };

  if (search) {
    where.OR = [
      { name:  { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
    ];
  }
  if (department) {
    const d = await prisma.department.findFirst({
      where: { name: { contains: department, mode: "insensitive" }, deletedAt: null },
      select: { id: true },
    });
    if (d) where.departmentId = d.id;
  }

  const employees = await prisma.employee.findMany({
    where,
    include: { department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return employees.map((e) => ({
    id: e.id, name: e.name, email: e.email, title: e.title,
    department: e.department?.name, status: e.status,
  }));
}

async function handle_get_workload(args: Record<string, unknown>) {
  const { department } = args as { department?: string };
  const where: Record<string, unknown> = { deletedAt: null, status: { in: ["ACTIVE", "PROBATION"] } };

  if (department) {
    const d = await prisma.department.findFirst({
      where: { name: { contains: department, mode: "insensitive" }, deletedAt: null },
      select: { id: true },
    });
    if (d) where.departmentId = d.id;
  }

  const employees = await prisma.employee.findMany({
    where,
    include: {
      department: { select: { name: true } },
      assignedTasks: {
        where: { deletedAt: null, status: { not: "DONE" } },
        select: { id: true, status: true, dueDate: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const today = new Date(); today.setHours(23, 59, 59, 0);

  return employees.map((e) => {
    const counts = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, overdue: 0 };
    for (const t of e.assignedTasks) {
      const s = t.status as keyof typeof counts;
      if (s in counts) counts[s]++;
      if (t.dueDate && t.dueDate < today) counts.overdue++;
    }
    return { id: e.id, name: e.name, department: e.department?.name, totalActive: e.assignedTasks.length, ...counts };
  });
}

async function handle_list_leads(args: Record<string, unknown>) {
  const { stage, assignee, search } = args as { stage?: string; assignee?: string; search?: string };
  const limit = Math.min(Number(args.limit ?? 50), 100);

  const where: Record<string, unknown> = {};
  if (stage)  where.stage = stage.toUpperCase();
  if (search) {
    where.OR = [
      { name:    { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
      { email:   { contains: search, mode: "insensitive" } },
    ];
  }
  if (assignee) {
    const id = await resolveEmployee(assignee);
    if (id) where.ownerId = id;
  }

  const leads = await prisma.lead.findMany({
    where,
    include: { owner: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return leads.map((l) => ({
    id: l.id, name: l.name, company: l.company, email: l.email,
    stage: l.stage, score: l.score, source: l.source,
    owner: l.owner?.name, nextStep: l.nextStep,
    updatedAt: l.updatedAt.toISOString(),
  }));
}

async function handle_update_lead(args: Record<string, unknown>) {
  const { id, stage, nextStep, assignee, assigneeId } = args as {
    id?: string; stage?: string; nextStep?: string; assignee?: string; assigneeId?: string;
  };

  if (!id) throw new Error("id is required");

  const data: Record<string, unknown> = {};
  if (stage)    data.stage    = stage.toUpperCase();
  if (nextStep) data.nextStep = nextStep;

  let resolvedOwnerId = assigneeId ?? null;
  if (!resolvedOwnerId && assignee) resolvedOwnerId = await resolveEmployee(assignee);
  if (resolvedOwnerId) data.ownerId = resolvedOwnerId;

  const lead = await prisma.lead.update({ where: { id }, data });
  return { id: lead.id, name: lead.name, stage: lead.stage, nextStep: lead.nextStep };
}

async function handle_get_dashboard() {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const [overdue, flagged, inProgress, doneToday, todo, activeLeads] = await Promise.all([
    prisma.task.count({ where: { deletedAt: null, status: { not: "DONE" }, dueDate: { lt: today } } }),
    prisma.task.count({ where: { deletedAt: null, status: "BLOCKED" } }),
    prisma.task.count({ where: { deletedAt: null, status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { deletedAt: null, status: "DONE", completedAt: { gte: today, lt: tomorrow } } }),
    prisma.task.count({ where: { deletedAt: null, status: "TODO" } }),
    prisma.lead.count({ where: { stage: { notIn: ["WON", "LOST"] } } }),
  ]);

  return { overdue, flagged, inProgress, doneToday, todo, activeLeads, date: today.toISOString().slice(0, 10) };
}

async function handle_get_standup(args: Record<string, unknown>) {
  const dateStr = args.date ? String(args.date) : new Date().toISOString().slice(0, 10);
  const date = new Date(dateStr);
  const nextDay = new Date(date); nextDay.setDate(nextDay.getDate() + 1);

  const entries = await prisma.dailyUpdate.findMany({
    where: { createdAt: { gte: date, lt: nextDay } },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return entries.map((e) => ({
    id: e.id, employee: e.employee?.name, date: dateStr,
    ...Object.fromEntries(
      Object.entries(e).filter(([k]) => !["id","employeeId","employee","createdAt","updatedAt"].includes(k))
    ),
  }));
}

// ─── Tool router ──────────────────────────────────────────────────────────────

const TOOLS: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  search:         handle_search,
  list_tasks:     handle_list_tasks,
  get_task:       handle_get_task,
  create_task:    handle_create_task,
  update_task:    handle_update_task,
  complete_task:  handle_complete_task,
  flag_task:      handle_flag_task,
  reassign_task:  handle_reassign_task,
  list_projects:  handle_list_projects,
  create_project: handle_create_project,
  list_clients:   handle_list_clients,
  list_employees: handle_list_employees,
  get_workload:   handle_get_workload,
  list_leads:     handle_list_leads,
  update_lead:    handle_update_lead,
  get_dashboard:  handle_get_dashboard,
  get_standup:    handle_get_standup,
};

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!authorized(req)) return err("Unauthorized", 401);

  let body: { tool?: string; args?: Record<string, unknown> };
  try { body = await req.json(); } catch { return err("Invalid JSON body"); }

  const { tool, args = {} } = body;
  if (!tool) return err("tool is required");

  const handler = TOOLS[tool];
  if (!handler) return err(`Unknown tool: "${tool}". Available: ${Object.keys(TOOLS).join(", ")}`);

  try {
    const data = await handler(args);
    return ok(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = typeof (e as Record<string,unknown>).status === "number"
      ? Number((e as Record<string,unknown>).status) : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// Tool manifest — lets the MCP binary auto-discover what's available
export async function GET(req: Request) {
  if (!authorized(req)) return err("Unauthorized", 401);
  return ok({ version: "1.0", name: "taskboard", tools: Object.keys(TOOLS) });
}
