"use client";

/**
 * Sales Engine Workbench — Autonomous AI Sales & GaaS (Growth-as-a-Service)
 * engine. The founder's primary showcase.
 *
 * Interactive 5-stage pipeline: inbound WhatsApp qualifier → Calendly +
 * human-escalation fallback → meeting intelligence & dual scoring →
 * AI financial proposal with FTE costing & margin → autonomous multi-stage
 * follow-up engine.
 *
 * Every action calls the /api/sales-engine/* endpoints and falls back to
 * local mock computation so the demo is instant even when the API is down.
 */
import { useMemo, useState } from "react";
import {
  Plus, Calendar, Brain, FileText, Send, MessageSquare, ShieldCheck,
  CheckCircle2, ClipboardList, Zap, ArrowRight, Loader2, Bot, User,
  TrendingUp, Sparkles, AlarmClock, Mic, AlertTriangle,
} from "lucide-react";
import { Card, Badge, SectionLabel, Dot, Bar, Btn, inputCls } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/Toast";
import {
  simulateInbound, analyzeMeeting, buildProposal, makeApproval, makeFollowUps,
  fmtMoney,
} from "@/lib/salesEngine";
import type {
  LeadQualify, MeetingAnalysis, Proposal, Approval, FollowUp,
} from "@/lib/salesEngine";

const TEAL = "var(--teal)";
const GREEN = "var(--emerald)";
const AMBER = "var(--amber)";
const RED = "var(--crimson)";

type PipelineStage = { step: number; icon: React.ReactNode; title: string; sub: string; state: "idle" | "active" | "done" };
const STAGES: Omit<PipelineStage, "state">[] = [
  { step: 1, icon: <MessageSquare className="h-4 w-4" />, title: "Inbound & WhatsApp Qualifier", sub: "AI lead capture" },
  { step: 2, icon: <Calendar className="h-4 w-4" />, title: "Scheduler & Human Escalation", sub: "Calendly fallback" },
  { step: 3, icon: <Brain className="h-4 w-4" />, title: "Meeting Intelligence", sub: "Dual scoring + MOM" },
  { step: 4, icon: <FileText className="h-4 w-4" />, title: "AI Financial Proposal", sub: "FTE costing + margin" },
  { step: 5, icon: <Zap className="h-4 w-4" />, title: "Autonomous Follow-up", sub: "FOMO / price / timing" },
];

// Shared style tokens (Tailwind classes, kept so the compiler includes them)
const cls = {
  bubble: "max-w-[82%] rounded-[10px] rounded-tl-sm px-3 py-2 text-[12px] leading-relaxed",
  bubbleAi: "border border-edge bg-raised text-ink2",
  bubbleHuman: "border border-[color-mix(in_srgb,var(--emerald)_30%,transparent)] bg-[color-mix(in_srgb,var(--emerald)_8%,transparent)] text-ink2",
  bubbleLead: "rounded-tl-xl rounded-tr-sm border border-[color-mix(in_srgb,var(--amber)_30%,transparent)] bg-[color-mix(in_srgb,var(--amber)_8%,transparent)] text-ink2",
  chan: "my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white",
  chip: "inline-flex items-center rounded-full border border-edge bg-raised px-2 py-0.5 text-[10px] text-ink2",
};

export function SalesEngineWorkbench() {
  const toast = useToast();

  // Stage 1 — lead qualifier + chat simulator
  const [lead, setLead] = useState<LeadQualify | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatTyping, setChatTyping] = useState<string | null>(null);
  const doesHR = useMemo(() => !!lead && lead.chat.some((m) => m.from === "human"), [lead]);

  // Stage 2 — meeting booked state
  const [meetingBooked, setMeetingBooked] = useState(false);

  // Stage 3 — meeting analysis
  const [analysis, setAnalysis] = useState<MeetingAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Stage 4 — proposal & approval
  const [region, setRegion] = useState<"US" | "IN">("US");
  const [marginPct, setMarginPct] = useState(25);
  const [teamSize, setTeamSize] = useState(3);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [generating, setGenerating] = useState(false);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Stage 5 — follow-ups
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  /* ---------- stage 1: simulate inbound lead ---------- */
  async function simulate() {
    setChatBusy(true);
    let l: LeadQualify | null = null;
    try {
      const res = await fetch("/api/sales-engine/simulate");
      const data = await res.json();
      if (data.ok) l = data.lead;
    } catch { /* fall through to local mock */ }
    l = l ?? simulateInbound();
    setLead(l);
    setAnalysis(null); setProposal(null); setApproval(null); setMeetingBooked(false);
    setFollowUps(makeFollowUps(l.seriousnessScore, l.qualified));
    setChatBusy(false);
    setChatTyping("Qualifying intent & budget signals…");
    setTimeout(() => {
      setChatTyping(null);
      toast(`${l!.name} (${l!.company}) qualified at ${l!.seriousnessScore}/100`, "success");
    }, 1200);
  }

  /* ---------- stage 1: chat simulation ---------- */
  async function sendChat() {
    const text = chatInput.trim();
    if (!text || !lead) return;
    setChatInput("");
    setLead({ ...lead, chat: [...lead.chat, { from: "lead", text, at: "now" }] });
    setChatBusy(true);
    const reply = await aiReply(text);
    setChatBusy(false);
    setChatTyping(reply.text);
    setTimeout(() => {
      setChatTyping(null);
      setLead((prev) => prev ? { ...prev, chat: [...prev.chat, { from: "ai", text: reply.text, at: "now" }] } : prev);
    }, 1200);
  }

  /* ---------- stage 2: book meeting / escalate ---------- */
  function bookMeeting() {
    setMeetingBooked(true);
    toast("Simulated slot hold — no Calendly call was made and no invite was sent", "default");
    setTimeout(() => {
      if (!lead || lead.chat.some((m) => m.from === "human")) return;
      setLead({ ...lead, chat: [...lead.chat, { from: "human", text: "Heads-up — I'm Sarah from the founding team. The AI qualifier graded this high-intent, so I'm hopping in personally. 😊", at: "now" }] });
      toast("Simulated escalation — no one was actually notified", "default");
    }, 12000);
  }

  /* ---------- stage 3: analyze meeting ---------- */
  async function analyze() {
    setAnalyzing(true);
    let a: MeetingAnalysis | null = null;
    try {
      const res = await fetch("/api/sales-engine/analyze");
      const data = await res.json();
      if (data.ok) a = data.analysis;
    } catch { /* local mock fallback */ }
    a = a ?? analyzeMeeting();
    setTimeout(() => {
      setAnalysis(a); setAnalyzing(false); setShowTranscript(false);
      toast(`Meeting scored — Seriousness ${a!.seriousnessScore} · Rep ${a!.repPitchScore}`, "success");
    }, 1100);
  }

  /* ---------- stage 4: proposal ---------- */
  async function generateProposal() {
    setGenerating(true);
    let p: Proposal | null = null;
    try {
      const res = await fetch("/api/sales-engine/proposal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region, marginPct, teamSize }),
      });
      const data = await res.json();
      if (data.ok) p = data.proposal;
    } catch { /* local mock fallback */ }
    p = p ?? buildProposal(region, marginPct, teamSize);
    setTimeout(() => { setProposal(p); setGenerating(false); }, 900);
  }

  /* ---------- stage 4: approval + dispatch ---------- */
  async function submitApproval() {
    setSubmitting(true);
    let ap: Approval | null = null;
    try {
      const res = await fetch("/api/sales-engine/approve");
      const data = await res.json();
      if (data.ok) ap = data.approval;
    } catch { /* local mock fallback */ }
    ap = ap ?? makeApproval();
    setTimeout(() => {
      setApproval(ap); setSubmitting(false);
      toast("Simulated approval — nothing was approved or signed off", "default");
    }, 1300);
  }

  async function dispatch(channel: "WhatsApp" | "Email") {
    try {
      await fetch("/api/sales-engine/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
    } catch { /* local fallback below */ }
    toast(
      `Simulated ${channel} dispatch — no message was sent and no PDF exists. `
      + "Connect a WhatsApp/email provider to make this real.",
      "default",
    );
  }

  /* ---------- stage 5: follow-up engine ---------- */
  function spinFollowUps() {
    if (!lead) return;
    const f = makeFollowUps(lead.seriousnessScore, true);
    setFollowUps(f);
    f.forEach((item, i) => {
      setTimeout(() => {
        setFollowUps((prev) => prev.map((x) => x.id === item.id ? { ...x, sent: true, sentAt: new Date().toISOString() } : x));
        if (i === f.length - 1) toast("Simulated follow-up sequence — nothing was sent", "default");
      }, 900 * (i + 1));
    });
  }

  function stageState(step: number): PipelineStage["state"] {
    if (step === 1) return lead ? "active" : "idle";
    if (step === 2) return (meetingBooked || doesHR) ? "active" : "idle";
    if (step === 3) return analysis ? "done" : "idle";
    if (step === 4) return proposal ? (approval ? "done" : "active") : "idle";
    return followUps.length ? "active" : "idle";
  }
  const stageList: PipelineStage[] = STAGES.map((s) => ({ ...s, state: stageState(s.step) }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* -------- pipeline strip -------- */}
      <div className="flex items-stretch gap-1 overflow-x-auto border-b border-edge px-4 py-3">
        {stageList.map((s) => (
          <div key={s.step} className="flex min-w-[150px] flex-1 items-center gap-2 rounded-md border border-edge bg-raised px-3 py-2">
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
              s.state === "active" ? "bg-teal text-white" : s.state === "done" ? "bg-[color-mix(in_srgb,var(--emerald)_15%,transparent)] text-emerald" : "bg-hover text-faint")}>
              {s.state === "done" ? <CheckCircle2 className="h-4 w-4" /> : s.icon}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-ink">{s.title}</div>
              <div className="truncate text-[10px] text-faint">Step {s.step}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-4 xl:grid-cols-3">

          {/* ============ LEFT: qualifier (steps 1 & 2) ============ */}
          <Card className="flex flex-col p-4">
            <Header icon={<MessageSquare className="h-4 w-4" />} title="Inbound & WhatsApp Qualifier" sub="AI lead capture · step 1"
              badge={<Badge text={lead ? (lead.qualified ? "QUALIFIED" : "LOW INTENT") : "IDLE"} kind={lead ? (lead.qualified ? "info" : "blocked") : "todo"} />} />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!lead ? (
                <Btn icon={<Plus className="h-4 w-4" />} onClick={simulate} disabled={chatBusy}>Simulate Inbound Lead</Btn>
              ) : (
                <Btn variant="ghost" icon={<Sparkles className="h-4 w-4" />} onClick={simulate} disabled={chatBusy}>New lead</Btn>
              )}
              {lead && <span className="ml-auto text-[11px] text-faint">Seriousness <b className="text-ink">{lead.seriousnessScore}</b>/100</span>}
            </div>

            {lead && (
              <div className="mt-4 flex flex-1 flex-col">
                <SectionLabel className="mb-2">Live chat simulator</SectionLabel>
                <div className="flex-1 space-y-2 overflow-y-auto rounded-md border border-edge bg-bg p-2.5" style={{ minHeight: 220 }}>
                  {chatTyping && (
                    <div className="flex items-start gap-2">
                      <div className={cn(cls.chan, "bg-teal")}><Bot className="h-3.5 w-3.5" /></div>
                      <div className={cn(cls.bubble, cls.bubbleAi)}><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />{chatTyping}</div>
                    </div>
                  )}
                  {lead.chat.map((m, i) => (
                    <div key={i} className={cn("flex items-start gap-2", m.from === "lead" && "flex-row-reverse")}>
                      <div className={cls.chan} style={{ background: m.from === "lead" ? AMBER : m.from === "human" ? GREEN : TEAL }}>
                        {m.from === "lead" ? <User className="h-3.5 w-3.5" /> : m.from === "human" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                      </div>
                      <div className={cn(cls.bubble, m.from === "lead" ? cls.bubbleLead : m.from === "human" ? cls.bubbleHuman : cls.bubbleAi)}>
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <span className="text-[9px] font-medium opacity-60">
                            {m.from === "lead" ? lead.name.split(" ")[0] : m.from === "human" ? "Human · Sarah" : "AI Agent"}
                          </span>
                          <span className="text-[9px] text-faint">{m.at}</span>
                        </div>
                        <div className="text-ink">{m.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input className={inputCls} placeholder={lead.qualified ? "Ask to book a slot…" : "Qualify further…"} value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} />
                  <Btn icon={<Send className="h-4 w-4" />} onClick={sendChat} disabled={chatBusy || !chatInput} aria-label="Send" />
                </div>
              </div>
            )}
          </Card>

          {/* ============ CENTER: scheduler / intelligence (2 & 3) ============ */}
          <Card className="flex flex-col p-4">
            <Header icon={<Brain className="h-4 w-4" />} title="Scheduler & Meeting Intelligence" sub="steps 2–3 · dual scoring"
              badge={<Badge text={meetingBooked ? "MEETING DONE" : "STANDBY"} kind={meetingBooked ? "info" : "todo"} />} />

            <div className="mt-4 rounded-md border border-edge bg-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" color={TEAL} />
                  <span className="text-[12px] font-medium text-ink">Calendly auto-scheduler</span>
                </div>
                <div className="flex items-center gap-2">
                  <Dot color={meetingBooked ? GREEN : doesHR ? AMBER : TEAL} pulse={meetingBooked} />
                  <Btn variant="ghost" size="sm" onClick={bookMeeting} disabled={!lead || meetingBooked}>{meetingBooked ? "Booked" : "Book meeting"}</Btn>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                When the AI qualifier scores high intent, it auto-issues a Calendly link. Low-intent leads trigger a
                <b className="text-emerald"> human escalation fallback</b> in-the-loop.
              </p>
            </div>

            <div className="mt-3 flex items-center justify-end">
              <Btn variant="ghost" size="sm" icon={analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                onClick={analyze} disabled={analyzing || !lead}>
                Analyze transcript
              </Btn>
            </div>

            {analysis ? (
              <div className="mt-2 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <ScoreTile label="Client Seriousness" value={analysis.seriousnessScore} tone={scoreTone(analysis.seriousnessScore)} hint={`${analysis.duration} min call`} />
                  <ScoreTile label="Rep Pitch Score" value={analysis.repPitchScore} tone={scoreTone(analysis.repPitchScore)} hint="AI-ranked delivery" />
                </div>
                <Btn variant="ghost" size="sm" className="w-full justify-between" onClick={() => setShowTranscript((v) => !v)}>
                  <span className="inline-flex items-center gap-1.5"><Mic className="h-3.5 w-3.5" /> Full transcript</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Btn>
                {showTranscript && (
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-edge bg-bg p-3 text-[11px] leading-relaxed text-muted">{analysis.transcript}</pre>
                )}
                <div>
                  <SectionLabel className="mb-1.5">AI Meeting Minutes (MOM)</SectionLabel>
                  <ul className="space-y-1.5">
                    {analysis.mom.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-ink2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald" />{m}</li>
                    ))}
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniBox tone="up" title="Key signals" items={analysis.keySignals} />
                  <MiniBox tone="warn" title="Red flags" items={analysis.redFlags} />
                </div>
                <div className="rounded-md border border-[color-mix(in_srgb,var(--emerald)_20%,transparent)] bg-[color-mix(in_srgb,var(--emerald)_7%,transparent)] p-2.5 text-[12px] text-emerald">
                  <b>Recommended next:</b> {analysis.recommendedNext}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                After the call, the engine ingests the transcript and scores both the <b className="text-ink">client's seriousness</b> and
                the <b className="text-ink">rep's pitch quality</b> on a 0–100 scale, then drafts an MOM and surfaces red flags.
              </p>
            )}
          </Card>

          {/* ============ RIGHT: proposal (4) & follow-up (5) ============ */}
          <Card className="flex flex-col p-4">
            <Header icon={<FileText className="h-4 w-4" />} title="AI Financial Proposal" sub="steps 4–5 · GaaS pricing"
              badge={<Badge text={approval ? "APPROVED" : proposal ? "DRAFT" : "IDLE"} kind={approval ? "info" : proposal ? "P1" : "todo"} />} />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <SectionLabel className="mb-1">Region / pricing tier</SectionLabel>
                <div className="grid grid-cols-2 overflow-hidden rounded-md border border-edge">
                  {(["US", "IN"] as const).map((r) => (
                    <button key={r} onClick={() => setRegion(r)} className={cn("py-1.5 text-[12px] font-medium transition disabled:opacity-50", region === r ? "bg-teal text-white" : "bg-transparent text-muted hover:text-ink")} disabled={!!proposal}>
                      {r} delivery
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel className="mb-1">Team size (FTE)</SectionLabel>
                <div className="flex items-center gap-1.5">
                  {[2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setTeamSize(n)} disabled={!!proposal} className={cn("h-7 w-7 rounded-md border text-[12px] font-medium transition disabled:opacity-40",
                      teamSize === n ? "border-teal bg-teal text-white" : "border-edge text-muted hover:text-ink")}>{n}</button>
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel className="mb-1">Margin {marginPct}%</SectionLabel>
                <input type="range" min={15} max={45} value={marginPct} onChange={(e) => setMarginPct(Number(e.target.value))} disabled={!!proposal} className="w-full accent-teal disabled:opacity-40" />
              </div>
            </div>

            <Btn icon={generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              onClick={generateProposal} disabled={generating || !analysis} className="mt-3 w-full justify-center">
              {generating ? "Generating…" : "Generate AI Proposal"}
            </Btn>

            {proposal && (
              <div className="mt-3 space-y-3">
                <div className="rounded-md border border-edge bg-raised p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="label">Pricing tier</div>
                      <div className="text-[13px] font-medium text-ink">{proposal.pricingTier}</div>
                    </div>
                    <Badge text={`${proposal.annGrossMarginPct}% GM`} kind="info" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Metric k="Monthly invoice" v={fmtMoney(proposal.monthlyClientInvoice)} />
                    <Metric k="Ann. revenue" v={fmtMoney(proposal.annRevenue)} />
                    <Metric k="FTE cost (ann.)" v={fmtMoney(proposal.annTotalFteCost)} />
                    <Metric k="Gross margin" v={fmtMoney(proposal.annGrossMargin)} accent={GREEN} />
                  </div>
                  <Bar pct={proposal.annGrossMarginPct} color={GREEN} />
                </div>

                <div>
                  <SectionLabel className="mb-1.5">FTE team allocation</SectionLabel>
                  <div className="overflow-hidden rounded-md border border-edge">
                    {proposal.fte.map((r, i) => (
                      <div key={r.role} className={cn("flex items-center justify-between px-3 py-2 text-[12px]", i % 2 ? "" : "bg-raised")}>
                        <span className="text-ink2">{r.role} × {r.slots}</span>
                        <span className="font-mono text-muted">{fmtMoney(r.annFteCost)}/yr</span>
                      </div>
                    ))}
                  </div>
                </div>

                {approval ? (
                  <div className="rounded-md border border-[color-mix(in_srgb,var(--emerald)_25%,transparent)] bg-[color-mix(in_srgb,var(--emerald)_7%,transparent)] p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald" />
                      <span className="text-[13px] font-medium text-emerald">Approved by {approval.approver}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">{approval.notes}</p>
                    <div className="mt-2 flex gap-2">
                      <Btn variant="primary" size="sm" className="flex-1 justify-center" onClick={() => dispatch("WhatsApp")}>
                        <Send className="h-3.5 w-3.5" /> WhatsApp
                      </Btn>
                      <Btn variant="ghost" size="sm" className="flex-1 justify-center" onClick={() => dispatch("Email")}>
                        <ClipboardList className="h-3.5 w-3.5" /> Email
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <Btn icon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    onClick={submitApproval} disabled={submitting} className="w-full justify-center">
                    {submitting ? "Submitting…" : "Submit for Leadership Approval"}
                  </Btn>
                )}
              </div>
            )}

            {lead && (
              <div className="mt-4 border-t border-edge pt-3">
                <div className="flex items-center justify-between">
                  <SectionLabel>Autonomous Follow-up Engine</SectionLabel>
                  <Btn variant="ghost" size="sm" icon={<Zap className="h-3.5 w-3.5" />} onClick={spinFollowUps} disabled={followUps.some((f) => f.sent)}>
                    {followUps.some((f) => f.sent) ? "Running…" : "Run sequence"}
                  </Btn>
                </div>
                {followUps.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted">After approval, the engine autonomously schedules objection-handling sequences (FOMO, price, timing) across WhatsApp &amp; email.</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {followUps.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 rounded-md border border-edge bg-raised px-2.5 py-2">
                        <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white", f.sent ? "bg-emerald" : "bg-hover text-faint")}>
                          {f.sent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlarmClock className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-medium text-ink">{f.kind}</span>
                            <Badge text={f.channel} kind="info" />
                          </div>
                          <div className="truncate text-[11px] text-muted">{f.subject}</div>
                        </div>
                        <div className="text-right">
                          {f.sent ? <span className="text-[10px] text-emerald">sent ✓</span> : <span className="font-mono text-[10px] text-faint">+{f.delayHrs}h</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- small local helpers ---------- */
async function aiReply(text: string): Promise<{ text: string }> {
  const t = text.toLowerCase();
  const answers = [
    "Great — noted. I'll fold that into your qualification profile and check budget fit.",
    "Understood. Let me capture that and adjust the proposed delivery scope.",
    "Perfect, that aligns with how we typically onboard GaaS clients. Anything on timeline?",
    "Thanks — I've logged that. I'll surface a Calendly slot if it looks like a strong fit.",
  ];
  if (t.includes("price") || t.includes("cost") || t.includes("budget"))
    return { text: "Budget-wise, our GaaS teams start around a blended US/IN FTE mix — the founder will share exact margins after the intro call." };
  if (t.includes("time") || t.includes("when") || t.includes("soon"))
    return { text: "We can typically spin up a starting team within 2–3 weeks of signature. Does that timeline work for you?" };
  if (t.includes("meeting") || t.includes("book") || t.includes("call") || t.includes("schedule"))
    return { text: "Say no more — I'm auto-issuing a Calendly link now, and the human escalation path is armed as a fallback." };
  if (t.includes("yes") || t.includes("ok") || t.includes("good"))
    return { text: "Excellent. Locking in that signal and escalating to scheduling for next steps." };
  return { text: answers[Math.floor(Math.random() * answers.length)] };
}

function Header({ icon, title, sub, badge }: { icon: React.ReactNode; title: string; sub: string; badge: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-teal text-white">{icon}</div>
        <div>
          <div className="text-[14px] font-medium text-ink">{title}</div>
          <div className="label">{sub}</div>
        </div>
      </div>
      {badge}
    </div>
  );
}

function scoreTone(n: number): "up" | "mid" | "low" {
  if (n >= 80) return "up";
  if (n >= 60) return "mid";
  return "low";
}

function ScoreTile({ label, value, tone, hint }: { label: string; value: number; tone: "up" | "mid" | "low"; hint?: string }) {
  const color = tone === "up" ? GREEN : tone === "mid" ? AMBER : RED;
  return (
    <div className="rounded-md border border-edge bg-raised p-3">
      <div className="label">{label}</div>
      <div className="mt-1 flex items-end justify-between">
        <span className="font-mono text-[26px] font-medium tnum" style={{ color }}>{value}</span>
        <span className="text-[10px] text-faint">{hint}</span>
      </div>
      <Bar pct={value} color={color} />
    </div>
  );
}

function MiniBox({ tone, title, items }: { tone: "up" | "warn"; title: string; items: string[] }) {
  const icon = tone === "up"
    ? <TrendingUp className="h-3.5 w-3.5 text-emerald" />
    : <AlertTriangle className="h-3.5 w-3.5 text-amber" />;
  return (
    <div className="rounded-md border border-edge bg-raised p-2.5">
      <div className="mb-1 flex items-center gap-1.5">{icon}<span className="text-[11px] font-medium text-ink">{title}</span></div>
      <ul className="space-y-1">
        {items.map((x, i) => (<li key={i} className="text-[11px] text-muted">· {x}</li>))}
      </ul>
    </div>
  );
}

function Metric({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div>
      <div className="label">{k}</div>
      <div className="font-mono text-[15px] font-medium tnum" style={{ color: accent ?? "var(--ink)" }}>{v}</div>
    </div>
  );
}