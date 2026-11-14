/** Sales Engine (GaaS) mock computation + formatting helpers.
 *  Shared by the /api/sales-engine/* route handlers and the client workbench
 *  (client keeps its own mirror of these so the demo is instant even offline).
 */

export const FTE_ROLES = ["Delivery Lead", "Full-Stack Engineer", "AI Automation Engineer", "QA / DevOps", "Project Manager"] as const;

export interface LeadQualify {
  name: string;
  company: string;
  country: string;
  email: string;
  intent: string;
  budgetBand: string;
  teamSize: number;
  timeline: string;
  seriousnessScore: number;
  qualified: boolean;
  chat: { from: "ai" | "human" | "lead"; text: string; at: string }[];
}

export interface MeetingAnalysis {
  duration: number;
  attendees: string[];
  transcript: string;
  seriousnessScore: number;
  repPitchScore: number;
  mom: string[];
  keySignals: string[];
  redFlags: string[];
  recommendedNext: string;
}

export interface FteRow {
  role: string;
  slots: number;
  monthlyRate: number;
  annFteCost: number;
}

export interface Proposal {
  region: "US" | "IN";
  marginPct: number;
  monthlyYield: number;
  fte: FteRow[];
  annTotalFteCost: number;
  annRevenue: number;
  annGrossMargin: number;
  annGrossMarginPct: number;
  monthlyClientInvoice: number;
  pricingTier: string;
}

export interface Approval {
  approved: boolean;
  approver: string;
  at: string;
  notes: string;
}

export interface FollowUp {
  id: number;
  kind: "FOMO" | "PRICE" | "TIMING" | "VALUE";
  delayHrs: number;
  channel: string;
  subject: string;
  body: string;
  sent: boolean;
  sentAt?: string;
}

/* ---------- predictable but lively pseudo-random ---------- */
let seed = 0x2f6e2b1;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function int(min: number, max: number): number {
  return Math.floor(min + rnd() * (max - min + 1));
}

const FIRST = ["Aarav", "Zara", "Elena", "Marcus", "Priya", "Diego", "Naomi", "Jonas", "Ananya", "Omar", "Sofia", "Rene"];
const LAST = ["Kapoor", "Novak", "Reyes", "Turner", "Iyer", "Dubois", "Tanaka", "Berg", "Brooks", "Haddad", "Moreau", "Solanki"];
const COMPANIES = ["Northwind Labs", "Helios Pay", "Quantum Retail", "Bluepeak Health", "Vantage Robotics", "Aurora Logistics", "Nexis Insurance", "Farmfolio", "Urban Clean Energy", "Swiftly Fintech"];
const INTENTS = [
  "Wants to replace their manual back-office operations with AI agents across billing, support and reconciliation.",
  "Needs a dedicated GaaS (Growth-as-a-Service) team to run outbound + nurture across 3 geographies.",
  "Evaluating a dedicated FTE team to build and maintain automation for their customer-success workflows.",
];
const BUDGETS = ["$30k–50k/yr", "$50k–80k/yr", "$80k–120k/yr", "$120k–200k/yr"];
const TIMELINES = ["ASAP — this quarter", "Within 3 months", "Planning for next fiscal"];

const SAMPLE_TRANSCRIPT_LINES = [
  "Rep: Thanks for joining, Priya. To start — what's the single biggest bottleneck in your revenue ops right now?",
  "Lead: Honestly, we're drowning in onboarding tickets. Each client takes ~9 manual steps and our success team can't keep up.",
  "Rep: Understood. And what have you tried so far to automate it?",
  "Lead: A couple of point tools, but they don't talk to each other. We want one team that owns the whole thing end to end.",
  "Rep: That's exactly the GaaS model — a dedicated, managed delivery team. Roughly how many FTEs would you want inside?",
  "Lead: Two to three to start, with a clear path to scale. Budget's approved for this fiscal year.",
  "Rep: Great — that's a strong signal. What's the decision timeline looking like?",
  "Lead: We want a proposal and a starting team by next month. If the economics work, we'll move fast.",
];

export function simulateInbound(): LeadQualify {
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const company = pick(COMPANIES);
  const intent = pick(INTENTS);
  const budgetBand = pick(BUDGETS);
  const timeline = pick(TIMELINES);
  const seriousness = int(55, 96);
  const teamSize = int(1, 4);
  const qualified = seriousness >= 60;
  const aiMsgs = [
    `Hi ${name.split(" ")[0]}, thanks for reaching out about ${company}! 👋 How can our AI Sales & GaaS engine help you this quarter?`,
    `Got it — let me capture that. Can you tell me roughly your current team size and the # of manual workflows you'd want automated?`,
    `Perfect. Based on what you've shared, you'd be a strong fit for a dedicated Delivery + AI automation team. Shall I lock in 15 min with our founder?`,
  ];
  const humanMsgs = [
    `Top of your inbox, ${name.split(" ")[0]}! I'm Sarah, the founding team. Since the AI detected a high-intent lead, I personally queued a slot on your Calendly link.`,
    `I've scheduled the call for you below — feel free to slide it. Looking forward to scoping this with you.`,
  ];
  const humanFold = qualified ? int(0, 1) === 0 : int(0, 1) === 1;

  const chat: LeadQualify["chat"] = [
    { from: "lead", text: intent, at: "10:04" },
    { from: "ai", text: aiMsgs[0], at: "10:04" },
    { from: "lead", text: "We're about 40 people, and honestly the founder is doing half the sales ops. Lots of spreadsheets.", at: "10:05" },
    { from: "ai", text: aiMsgs[1], at: "10:05" },
    { from: "lead", text: `Software dev is the burning one. I'd say ${teamSize * 2} teams worth of manual workflows daily.`, at: "10:06" },
    { from: "ai", text: aiMsgs[2], at: "10:06" },
  ];
  if (!humanFold) {
    chat.push({ from: "human", text: humanMsgs[0], at: "10:07" });
    chat.push({ from: "human", text: humanMsgs[1], at: "10:07" });
    chat.push({ from: "lead", text: "Perfect, booking it now. Talk soon.", at: "10:08" });
  }
  return {
    name, company, country: pick(["USA", "Canada", "UK", "UAE", "Australia", "Germany"]),
    email: `${name.split(" ")[0].toLowerCase()}@${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
    intent, budgetBand, teamSize, timeline, seriousnessScore: seriousness, qualified,
    chat,
  };
}

export function analyzeMeeting(): MeetingAnalysis {
  const seriousness = int(58, 97);
  const repPitch = Math.max(40, Math.min(99, seriousness + int(-18, 8)));
  const mom = [
    "Lead has a funded, approved GaaS budget for the current fiscal year (strong buying signal).",
    "Primary pain: manual client-onboarding (~9 steps) and founder-run sales ops.",
    "Requirement: 2–3 dedicated FTEs now, with a documented path to scale.",
    "Regional split of 60% US / 40% IN is acceptable to the lead.",
    "Decision owner is the founder/COO; procurement already briefed.",
  ];
  const keySignals = [
    "Mentioned an approved budget card and a fiscal-year deadline.",
    `${seriousness >= 80 ? "Fast" : "Moderate"} response cadence through the WhatsApp qualifier.`,
    "Asked pointed questions about gross margin and onboarding time to value.",
  ];
  const redFlags = seriousness >= 75 ? ["None material raised."] : ["Indicated they are still comparing 2 alternative vendors.", "Timeline may slip into next quarter."];
  return {
    duration: 48,
    attendees: ["Founder (Lead)", "Rep — Sarah (AE)"],
    transcript: SAMPLE_TRANSCRIPT_LINES.join("\n"),
    seriousnessScore: seriousness,
    repPitchScore: repPitch,
    mom,
    keySignals,
    redFlags,
    recommendedNext: seriousness >= 80 ? "Fast-track to proposal generation & approval queue." : "Send a value recap and confirm reach before proposal.",
  };
}

const US_RATES: Record<string, number> = { "Delivery Lead": 18000, "Full-Stack Engineer": 13500, "AI Automation Engineer": 15000, "QA / DevOps": 12500, "Project Manager": 14500 };
const IN_RATES: Record<string, number> = { "Delivery Lead": 7500, "Full-Stack Engineer": 5000, "AI Automation Engineer": 6000, "QA / DevOps": 4200, "Project Manager": 5200 };

export function buildProposal(region: "US" | "IN", marginPct: number, teamSize: number): Proposal {
  const rates = region === "US" ? US_RATES : IN_RATES;
  const alloc: number[] = [];
  let remaining = teamSize;
  alloc.push(1); remaining -= 1; // always a Delivery Lead
  while (remaining > 0) {
    const pickIdx = int(1, 4); // FTEs only
    alloc.push(pickIdx === 1 ? 1 : pickIdx === 2 ? 2 : pickIdx === 3 ? 3 : 4);
    remaining -= 1;
  }
  const fte: FteRow[] = FTE_ROLES.map((role, i) => {
    const slots = i === 0 ? 1 : alloc.filter((x) => x === i).length || 0;
    return { role, slots, monthlyRate: rates[role], annFteCost: slots * rates[role] * 12 };
  }).filter((r) => r.slots > 0);

  const annTotalFteCost = fte.reduce((s, r) => s + r.annFteCost, 0);
  const tierMul = region === "US" ? 3.1 : 2.25;
  const annRevenue = annTotalFteCost * tierMul;
  const annGrossMargin = annRevenue - annTotalFteCost;
  const marginPctActual = Math.round((annGrossMargin / annRevenue) * 100);
  const monthlyYield = Math.round(annRevenue / 12);
  const monthlyClientInvoice = Math.round(monthlyYield);
  const pricingTier = region === "US"
    ? (marginPctActual >= 70 ? "Premium US — GRO (Growth-as-a-Result)" : "Standard US — Dedicated Delivery")
    : (marginPctActual >= 58 ? "Premium IN — Dedicated Delivery" : "Standard IN — Managed Augmentation");

  // Margin slider modifies realized yield within a sane band
  const realized = annGrossMargin * (0.6 + (marginPct / 100) * 0.4);
  const realizedRev = annTotalFteCost + realized;

  return {
    region, marginPct,
    monthlyYield: Math.round(realizedRev / 12),
    fte,
    annTotalFteCost,
    annRevenue: Math.round(realizedRev),
    annGrossMargin: Math.round(realized),
    annGrossMarginPct: Math.round((realized / realizedRev) * 100),
    monthlyClientInvoice: Math.round(realizedRev / 12),
    pricingTier,
  };
}

export function makeApproval(): Approval {
  return { approved: true, approver: "Robin Hart (Founder / CEO)", at: new Date().toISOString(), notes: "Auto-OK'd: margin above floor, client budget band confirmed." };
}

export function makeFollowUps(seriousnessScore: number, qualified: boolean): FollowUp[] {
  const kindMap: { kind: FollowUp["kind"]; delayHrs: number; channel: string; subject: string; body: string }[] = [
    {
      kind: "FOMO", delayHrs: 2, channel: "WhatsApp",
      subject: "Spots filling for this intake",
      body: `Heads up — we move in cohorts and the current intake closes Friday. If ${seriousnessScore >= 80 ? "you're serious, I'd lock your starting team this week" : "you'd like a seat, I'd move soon"}. Happy to hold a slot for you.`,
    },
    {
      kind: "PRICE", delayHrs: 24, channel: "Email",
      subject: "Re: economics — here's the margin math",
      body: "A common question is price-per-FTE. At our blended US/IN mix, you get a senior delivery-led team at roughly 55% of a US-only engagement — same output, faster onboarding. Worth a 10-min deep dive?",
    },
    {
      kind: "TIMING", delayHrs: 72, channel: "WhatsApp",
      subject: "Planning for next quarter?",
      body: "If you're targeting next fiscal, I can park a proposal-ready team and a fixed quote now — prices lock on signature. Want me to hold that for you?",
    },
    {
      kind: "VALUE", delayHrs: 168, channel: "Email",
      subject: "A quick win list for your back-office",
      body: "Our kickoff playbook automates your 9-step onboarding down to ~3 within the first 6 weeks. I'll include that as a committed roadmap item if we move forward.",
    },
  ];
  const active = qualified ? kindMap : kindMap.filter((k) => k.kind !== "TIMING");
  return active.map((k, i) => ({ id: i + 1, ...k, sent: false }));
}

export const fmtMoney = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1000).toFixed(0)}k`);