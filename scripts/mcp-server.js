#!/usr/bin/env node
/**
 * TASKBOARD-OS Model Context Protocol (MCP) Server
 * Stdio-based JSON-RPC server implementing the official MCP specification.
 * Connects directly to TaskBoard OS database or HTTP endpoint.
 */

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// Auto-load .env
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2]?.replace(/^['"]|['"]$/g, "") || "";
    }
  }
}

const prisma = new PrismaClient();

const TOOLS = [
  {
    name: "taskboard_list_tasks",
    description: "List tasks in TaskBoard OS with optional filters (assignee, client, status, priority, category).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] },
        priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
        category: { type: "string" },
        clientName: { type: "string" },
        assigneeEmail: { type: "string" },
        search: { type: "string" },
        limit: { type: "number", default: 20 }
      }
    }
  },
  {
    name: "taskboard_create_task",
    description: "Create a new task with subtasks, priority, client attribution, and category.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["P0", "P1", "P2", "P3"], default: "P2" },
        category: { type: "string", default: "OTHER" },
        clientName: { type: "string" },
        subtasks: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "taskboard_update_task",
    description: "Update task status, mark done with outcome, or log blockers with reasons.",
    inputSchema: {
      type: "object",
      required: ["taskIdOrCode"],
      properties: {
        taskIdOrCode: { type: "string" },
        status: { type: "string", enum: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] },
        blockerReason: { type: "string" },
        outcome: { type: "string" }
      }
    }
  },
  {
    name: "taskboard_log_time",
    description: "Log active work time for a task or general workstream.",
    inputSchema: {
      type: "object",
      required: ["taskIdOrCode", "durationMinutes"],
      properties: {
        taskIdOrCode: { type: "string" },
        durationMinutes: { type: "number" },
        note: { type: "string" }
      }
    }
  },
  {
    name: "taskboard_crm_leads",
    description: "Fetch leads in CRM pipeline with stage and source filters.",
    inputSchema: {
      type: "object",
      properties: {
        stage: { type: "string" },
        source: { type: "string" }
      }
    }
  },
  {
    name: "taskboard_create_lead",
    description: "Ingest a new lead into the CRM pipeline (from Meta, WhatsApp, or outbound).",
    inputSchema: {
      type: "object",
      required: ["name", "company"],
      properties: {
        name: { type: "string" },
        company: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        source: { type: "string", default: "INBOUND" },
        nextStep: { type: "string" }
      }
    }
  },
  {
    name: "taskboard_standup_summary",
    description: "Generate automated daily standup summary of completed tasks, active time, and deliverables.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

function sendJson(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

let buffer = "";
process.stdin.on("data", async (chunk) => {
  buffer += chunk.toString("utf-8");
  let newlineIdx;
  while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (!line) continue;

    try {
      const req = JSON.parse(line);
      await handleRequest(req);
    } catch (e) {
      sendJson({ jsonrpc: "2.0", id: null, error: { code: -32700, message: e.message } });
    }
  }
});

async function handleRequest(req) {
  const { method, params, id = 1 } = req;

  if (method === "initialize") {
    sendJson({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "taskboard-os-mcp", version: "2.4.0" }
      }
    });
    return;
  }

  if (method === "tools/list") {
    sendJson({
      jsonrpc: "2.0",
      id,
      result: { tools: TOOLS }
    });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};

    try {
      if (name === "taskboard_list_tasks") {
        const where = { deletedAt: null, archivedAt: null };
        if (args.status) where.status = args.status;
        if (args.priority) where.priority = args.priority;
        if (args.category) where.category = args.category;
        if (args.search) {
          where.OR = [
            { title: { contains: args.search, mode: "insensitive" } },
            { code: { contains: args.search, mode: "insensitive" } }
          ];
        }
        if (args.clientName) {
          where.client = { name: { contains: args.clientName, mode: "insensitive" } };
        }

        const tasks = await prisma.task.findMany({
          where,
          take: args.limit || 20,
          orderBy: [{ createdAt: "desc" }],
          include: {
            client: { select: { name: true, code: true } },
            assignees: { include: { employee: { select: { name: true, email: true } } } },
            subtasks: { select: { id: true, title: true, done: true } }
          }
        });

        sendJson({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify({ count: tasks.length, tasks }, null, 2) }]
          }
        });
        return;
      }

      if (name === "taskboard_create_task") {
        let clientId = null;
        if (args.clientName) {
          const client = await prisma.client.findFirst({
            where: { name: { contains: args.clientName, mode: "insensitive" }, deletedAt: null },
            select: { id: true }
          });
          clientId = client?.id || null;
        }

        const count = await prisma.task.count();
        const code = `TSK-${count + 101}`;

        const task = await prisma.task.create({
          data: {
            title: args.title,
            description: args.description || null,
            priority: args.priority || "P2",
            category: args.category || "OTHER",
            clientId,
            code,
            status: "TODO",
            subtasks: args.subtasks?.length
              ? {
                  create: args.subtasks.map((st, idx) => ({
                    title: st,
                    order: idx,
                    done: false
                  }))
                }
              : undefined
          }
        });

        sendJson({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Task created: ${task.code} (${task.title})` }]
          }
        });
        return;
      }

      if (name === "taskboard_update_task") {
        const target = await prisma.task.findFirst({
          where: {
            deletedAt: null,
            OR: [{ id: args.taskIdOrCode }, { code: args.taskIdOrCode }]
          },
          select: { id: true, code: true }
        });
        if (!target) {
          sendJson({ jsonrpc: "2.0", id, error: { code: -32602, message: "Task not found" } });
          return;
        }

        const updateData = {};
        if (args.status) {
          updateData.status = args.status;
          if (args.status === "DONE") {
            updateData.completedAt = new Date();
            if (args.outcome) updateData.outcome = args.outcome;
          }
        }

        const updated = await prisma.task.update({
          where: { id: target.id },
          data: updateData
        });

        sendJson({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Task ${target.code} updated to ${updated.status}.` }]
          }
        });
        return;
      }

      if (name === "taskboard_log_time") {
        const target = await prisma.task.findFirst({
          where: {
            deletedAt: null,
            OR: [{ id: args.taskIdOrCode }, { code: args.taskIdOrCode }]
          },
          select: { id: true, code: true }
        });
        if (!target) {
          sendJson({ jsonrpc: "2.0", id, error: { code: -32602, message: "Task not found" } });
          return;
        }

        const ms = Math.round(Number(args.durationMinutes) * 60 * 1000);
        const author = await prisma.employee.findFirst({ select: { id: true } });

        if (author) {
          await prisma.workSession.create({
            data: {
              taskId: target.id,
              employeeId: author.id,
              durationMs: ms,
              startedAt: new Date(Date.now() - ms),
              endedAt: new Date(),
              note: args.note || "Logged via TaskBoard MCP"
            }
          });
        }

        sendJson({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Logged ${args.durationMinutes}m on ${target.code}.` }]
          }
        });
        return;
      }

      if (name === "taskboard_standup_summary") {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [completedTasks, sessions, reports] = await Promise.all([
          prisma.task.findMany({
            where: { deletedAt: null, completedAt: { gte: todayStart } },
            select: { code: true, title: true, outcome: true, client: { select: { name: true } } }
          }),
          prisma.workSession.findMany({
            where: { startedAt: { gte: todayStart } },
            include: { task: { select: { code: true, title: true } } }
          }),
          prisma.taskReport.findMany({
            where: { createdAt: { gte: todayStart } },
            select: { title: true, fileName: true, kind: true, task: { select: { code: true } } }
          })
        ]);

        const totalMs = sessions.reduce((acc, s) => acc + (s.durationMs || 0), 0);
        const totalHours = (totalMs / 3600000).toFixed(1);

        const summaryText = [
          `📊 TASKBOARD-OS DAILY WORK SUMMARY (${todayStart.toISOString().slice(0, 10)})`,
          `• Total Tracked Time: ${totalHours}h across ${sessions.length} sessions`,
          `• Completed Tasks (${completedTasks.length}):`,
          ...completedTasks.map((t) => `  - [${t.code}] ${t.title} (${t.client?.name || "Internal"})${t.outcome ? ` → Outcome: ${t.outcome}` : ""}`),
          `• Reports Uploaded (${reports.length}):`,
          ...reports.map((r) => `  - [${r.task.code}] ${r.title} (${r.fileName}) [${r.kind}]`),
        ].join("\n");

        sendJson({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: summaryText }]
          }
        });
        return;
      }

      sendJson({ jsonrpc: "2.0", id, error: { code: -32601, message: `Tool not found: ${name}` } });
    } catch (err) {
      sendJson({ jsonrpc: "2.0", id, error: { code: -32603, message: err.message } });
    }
  }
}
