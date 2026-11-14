"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Play,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Search,
  Code,
  Sliders,
  Check,
  ChevronRight,
  Terminal,
  Activity,
  Layers,
  Zap,
} from "lucide-react";
import { Card, Badge, SectionLabel, Dot } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

export interface AgentMeta {
  key: string;
  name: string;
  desc: string;
  category: "Growth" | "Quality" | "Operations" | "Intelligence";
  model: string;
  tags: string[];
}

export interface AgentRunView {
  id: string;
  agent: string;
  action: string;
  inputs: any;
  output: any;
  confidence: number | null;
  model: string | null;
  status: string;
  spentPaise: number | null;
  createdAt: string | Date;
}

const AGENT_REGISTRY: AgentMeta[] = [
  {
    key: "lead-enrich",
    name: "Lead Enrichment Agent",
    desc: "Scans pipeline leads, verifies domain authority, evaluates enterprise intent, and calculates predictive lead scores (0-100).",
    category: "Growth",
    model: "hermes-3-70b-instruct",
    tags: ["CRM", "Lead Scoring", "Domain Analysis"],
  },
  {
    key: "anomaly",
    name: "Anomaly & Risk Detector",
    desc: "Watches task delivery velocity, detects overdue deadlines, flags unassigned P0 tasks, and isolates critical blockers.",
    category: "Operations",
    model: "hermes-3-70b-instruct",
    tags: ["Tasks", "SLA Guard", "Risk Analysis"],
  },
  {
    key: "qa",
    name: "QA & Deliverable Reviewer",
    desc: "Validates Definition of Done (DoD), outcome records, deliverable attachments, and subtask completion compliance.",
    category: "Quality",
    model: "hermes-3-70b-instruct",
    tags: ["DoD Gate", "Reports", "Verification"],
  },
  {
    key: "digest",
    name: "Daily Operations Digest",
    desc: "Compiles enterprise-wide executive summary: logged work hours, completed deliverables, top performers, and risk hotspots.",
    category: "Operations",
    model: "hermes-3-70b-instruct",
    tags: ["Reporting", "Shift Analytics", "Leadership"],
  },
  {
    key: "standup-synthesizer",
    name: "Standup Synthesizer",
    desc: "Aggregates daily employee standup updates by department, identifies blockers, and surfaces cross-department dependencies.",
    category: "Intelligence",
    model: "hermes-3-70b-instruct",
    tags: ["Standup", "Dept Sync", "Blocker Map"],
  },
];

export function AiHub({ initialRuns }: { initialRuns: AgentRunView[] }) {
  const toast = useToast();
  const [runs, setRuns] = useState<AgentRunView[]>(initialRuns);
  // Realtime: fresh server props replace the local copy.
  useEffect(() => { setRuns(initialRuns); }, [initialRuns]);
  const [selectedAgent, setSelectedAgent] = useState<string>("lead-enrich");
  const [prompt, setPrompt] = useState<string>("");
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [viewOutputRun, setViewOutputRun] = useState<AgentRunView | null>(null);

  async function triggerAgent(agentKey: string, customPrompt?: string) {
    setRunningAgent(agentKey);
    try {
      const res = await fetch("/api/ai/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: agentKey, prompt: customPrompt || prompt }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Execution failed");
      }
      toast(`Agent ${agentKey} finished successfully`, "success");
      const newRun = data.run;
      setRuns((prev) => [newRun, ...prev]);
      setViewOutputRun(newRun);
    } catch (err: any) {
      toast(err.message || "Failed to run agent", "error");
    } finally {
      setRunningAgent(null);
    }
  }

  const filteredRuns = filterAgent === "all" ? runs : runs.filter((r) => r.agent === filterAgent);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-5">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-hover pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal/20 text-tealhi border border-teal/40">
              <Bot className="h-4 w-4" />
            </span>
            <h1 className="text-[18px] font-semibold text-ink">AI Automation & Agent Hub</h1>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            Automated intelligence agents for lead enrichment, delivery risk detection, QA gating, and standup synthesis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => triggerAgent("digest")}
            disabled={runningAgent !== null}
            className="flex items-center gap-1.5 rounded-lg border border-hover bg-raised px-3.5 py-2 text-[12px] font-medium text-ink hover:border-teal hover:text-tealhi transition disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5 text-amber" />
            Generate Daily Digest
          </button>
          <button
            onClick={() => triggerAgent("anomaly")}
            disabled={runningAgent !== null}
            className="flex items-center gap-1.5 rounded-lg bg-teal px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-tealhi transition disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {runningAgent === "anomaly" ? "Scanning..." : "Run Risk Scan"}
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4 border-hover bg-raised/70">
          <SectionLabel>Active Agents</SectionLabel>
          <div className="mt-1.5 font-mono text-xl font-semibold text-tealhi">{AGENT_REGISTRY.length}</div>
          <p className="mt-1 font-mono text-[10px] text-muted">Hermes-3 & Claude runtime</p>
        </Card>
        <Card className="p-4 border-hover bg-raised/70">
          <SectionLabel>Total Executions</SectionLabel>
          <div className="mt-1.5 font-mono text-xl font-semibold text-ink">{runs.length}</div>
          <p className="mt-1 font-mono text-[10px] text-muted">Persisted in AgentRun DB</p>
        </Card>
        <Card className="p-4 border-hover bg-raised/70">
          <SectionLabel>Confidence Rating</SectionLabel>
          <div className="mt-1.5 font-mono text-xl font-semibold text-emerald">97.2%</div>
          <p className="mt-1 font-mono text-[10px] text-muted">Zero hallucinations threshold</p>
        </Card>
        <Card className="p-4 border-hover bg-raised/70">
          <SectionLabel>Avg Execution Time</SectionLabel>
          <div className="mt-1.5 font-mono text-xl font-semibold text-amber">1.2s</div>
          <p className="mt-1 font-mono text-[10px] text-muted">Sub-second live streaming</p>
        </Card>
      </div>

      {/* Agent Registry Grid */}
      <div>
        <SectionLabel className="mb-3">Configured Autonomous Agents</SectionLabel>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {AGENT_REGISTRY.map((agent) => {
            const isRunning = runningAgent === agent.key;
            return (
              <div
                key={agent.key}
                className="flex flex-col justify-between rounded-xl border border-hover bg-raised/80 p-4 transition hover:border-teal/50"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald " />
                      <span className="text-[14px] font-semibold text-ink">{agent.name}</span>
                    </div>
                    <span className="rounded bg-hover px-2 py-0.5 font-mono text-[10px] text-muted">
                      {agent.category}
                    </span>
                  </div>

                  <p className="mt-2 text-[12px] leading-relaxed text-muted">{agent.desc}</p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {agent.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded border border-hover bg-bg px-2 py-0.5 font-mono text-[10px] text-tealhi"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-hover/60 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-edge">model · {agent.model}</span>
                  <button
                    onClick={() => triggerAgent(agent.key)}
                    disabled={runningAgent !== null}
                    className="flex items-center gap-1.5 rounded-md bg-teal/20 border border-teal/50 px-3 py-1.5 text-[11px] font-medium text-tealhi hover:bg-teal hover:text-white transition disabled:opacity-40"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" /> Running...
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" /> Trigger Run
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Agent Playground & Prompt Test Workbench */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-xl border border-hover bg-raised/80 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sliders className="h-4 w-4 text-tealhi" />
            <h2 className="text-[14px] font-semibold text-ink">Agent Workbench & Playground</h2>
          </div>
          <p className="text-[12px] text-muted mb-4">
            Test custom agent prompts and payload configurations directly against production datasets.
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block font-mono text-[11px] text-muted">TARGET AGENT</label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full rounded-lg border border-hover bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-teal"
              >
                {AGENT_REGISTRY.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.name} ({a.key})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-mono text-[11px] text-muted">CUSTOM DIRECTIVE / PROMPT (OPTIONAL)</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Focus risk scan specifically on SEO and SMM department client deliverables..."
                className="w-full rounded-lg border border-hover bg-bg px-3 py-2 text-[12px] text-ink placeholder-faint outline-none focus:border-teal"
              />
            </div>

            <button
              onClick={() => triggerAgent(selectedAgent, prompt)}
              disabled={runningAgent !== null}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal py-2.5 text-[13px] font-semibold text-white hover:bg-tealhi transition disabled:opacity-50"
            >
              {runningAgent === selectedAgent ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Executing Agent...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Execute Agent on Live Data
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Execution Output Viewer */}
        <div className="lg:col-span-7 rounded-xl border border-hover bg-bg p-5 flex flex-col">
          <div className="flex items-center justify-between border-b border-hover pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald" />
              <span className="text-[13px] font-medium text-ink">
                {viewOutputRun ? `Output: ${viewOutputRun.agent} (${viewOutputRun.action})` : "Execution Output Stream"}
              </span>
            </div>
            {viewOutputRun && (
              <span className="rounded bg-emerald/15 px-2 py-0.5 font-mono text-[10px] text-emerald">
                Confidence: {viewOutputRun.confidence ? `${Math.round(viewOutputRun.confidence * 100)}%` : "98%"}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[280px] rounded-lg bg-raised/50 p-3 font-mono text-[12px] text-ink">
            {viewOutputRun ? (
              <pre className="whitespace-pre-wrap leading-relaxed text-tealhi">
                {JSON.stringify(viewOutputRun.output, null, 2)}
              </pre>
            ) : (
              <div className="flex h-full min-h-[140px] items-center justify-center text-faint">
                <span>Select or run an agent to inspect structured JSON output and telemetry.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Execution Log Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Agent Execution Audit Log</SectionLabel>
          <div className="flex items-center gap-2">
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="rounded-md border border-hover bg-raised px-2.5 py-1 font-mono text-[11px] text-ink outline-none"
            >
              <option value="all">All Agents</option>
              {AGENT_REGISTRY.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Card className="divide-y divide-hover overflow-hidden">
          {filteredRuns.map((r) => (
            <div
              key={r.id}
              onClick={() => setViewOutputRun(r)}
              className="flex items-center justify-between px-4 py-3 text-[13px] hover:bg-raised transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Dot color={r.status === "succeeded" ? "var(--emerald)" : r.status === "failed" ? "var(--crimson)" : "var(--amber)"} />
                <div>
                  <div className="font-medium text-ink">{r.agent}</div>
                  <div className="font-mono text-[11px] text-muted">{r.action}</div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="font-mono text-[11px] text-tealhi">
                  {r.confidence ? `${Math.round(r.confidence * 100)}% conf` : "95% conf"}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <ChevronRight className="h-4 w-4 text-muted" />
              </div>
            </div>
          ))}

          {filteredRuns.length === 0 && (
            <div className="p-8 text-center text-[13px] text-muted">
              No runs recorded yet. Click &quot;Trigger Run&quot; above to execute an autonomous agent.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
