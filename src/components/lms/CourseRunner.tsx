"use client";
import { BackButton } from "@/components/ui/BackButton";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Rocket, Trophy, ListChecks, PenLine, CircleCheck, AlertTriangle,
  Lightbulb, ChevronDown, Check, MessageCircleQuestion, Sparkles,
} from "lucide-react";
import { Bar, Stat } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { CourseBlockContent, CourseContent } from "@/lib/lmsContent";

interface BlockState {
  checks: Record<string, boolean>;
  fields: Record<string, string>;
  drillAnswers: Record<string, { answer: string; revealed: boolean }>;
  completed: boolean;
  elapsedSec: number;
}
type SavePatch = Partial<Pick<BlockState, "checks" | "fields" | "drillAnswers">> & { completed?: boolean; elapsedSec?: number };

function emptyBlockState(): BlockState {
  return { checks: {}, fields: {}, drillAnswers: {}, completed: false, elapsedSec: 0 };
}

function mmss(totalSec: number) {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

function isReady(block: CourseBlockContent, s: BlockState): boolean {
  if (block.drills) return block.drills.every((_, i) => (s.drillAnswers[String(i)]?.answer ?? "").trim().length >= 12);
  const tasksOk = (block.tasks ?? []).every((_, i) => Boolean(s.checks[String(i)]));
  const fieldsOk = (block.fields ?? []).every((f) => f.required === false || Boolean(s.fields[f.id]?.trim()));
  return tasksOk && fieldsOk;
}

/** A friendly, non-urgent read on how far along someone is — never mentions time. */
function encourage(done: number, total: number): string {
  if (total === 0) return "";
  if (done === 0) return "Ready when you are.";
  const pct = done / total;
  if (pct < 0.34) return "Nice start — keep going.";
  if (pct < 0.67) return "You're building momentum.";
  if (pct < 1) return "Almost there — finish strong.";
  return "That's the whole module.";
}

const inputCls =
  "w-full select-text rounded-lg border border-edge bg-transparent px-3 py-2 text-[14px] text-ink placeholder:text-faint focus:border-teal focus:outline-none";
const primaryBtn = "rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white disabled:opacity-40";
const ghostBtn = "rounded-md border border-edge px-3 py-1.5 text-[12px] text-ink";
const summaryCls =
  "flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-tealhi hover:text-ink [&::-webkit-details-marker]:hidden";

/** Renders prose that's split into "\n\n" paragraphs: the first paragraph shows
 *  up front, the rest tuck behind a "Keep reading" toggle. Single-paragraph
 *  text (however long) just renders in full — no mid-sentence truncation. */
function ExpandableProse({ text, className }: { text: string; className: string }) {
  const paras = text.split(/\n\n+/).filter(Boolean);
  if (paras.length <= 1) return <p className={className}>{text}</p>;
  const [first, ...rest] = paras;
  return (
    <div>
      <p className={className}>{first}</p>
      <details className="group mt-2.5">
        <summary className={summaryCls}>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          <span className="group-open:hidden">Keep reading</span>
          <span className="hidden group-open:inline">Show less</span>
        </summary>
        <div className={className + " mt-2.5 space-y-3"}>
          {rest.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </details>
    </div>
  );
}

interface InitialProgress {
  currentBlockIdx: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  blocks: Array<{
    blockId: string;
    checks: Record<string, boolean>;
    fields: Record<string, string>;
    drillAnswers: Record<string, { answer: string; revealed: boolean }>;
    completed: boolean;
    elapsedSec: number;
  }>;
}

export function CourseRunner({
  course,
  initialProgress,
  restrictCopy,
}: {
  course: { id: string; title: string; description: string | null; content: CourseContent };
  initialProgress: InitialProgress | null;
  /** Blocks copy/cut/paste/right-click on the mission content for everyone
   *  except leadership — the content is meant to be typed, not lifted. Never
   *  applied to the learner's own "Copy my work" export, which stays a
   *  deliberate self-service action regardless. */
  restrictCopy: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const blocks = course.content.blocks;

  const copyGuard = restrictCopy
    ? {
        onCopy: (e: React.ClipboardEvent) => {
          e.preventDefault();
          toast("Copying is disabled in Learning", "error");
        },
        onCut: (e: React.ClipboardEvent) => {
          e.preventDefault();
          toast("Copying is disabled in Learning", "error");
        },
        onPaste: (e: React.ClipboardEvent) => {
          e.preventDefault();
          toast("Pasting is disabled — write it in your own words", "error");
        },
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : {};
  const guardCls = restrictCopy ? " select-none [-webkit-touch-callout:none]" : "";

  const [started, setStarted] = useState(initialProgress !== null);
  const [idx, setIdx] = useState(initialProgress?.currentBlockIdx ?? 0);
  const [far, setFar] = useState(initialProgress?.currentBlockIdx ?? 0);
  const [states, setStates] = useState<Record<string, BlockState>>(() => {
    const init: Record<string, BlockState> = {};
    for (const b of blocks) init[b.id] = emptyBlockState();
    initialProgress?.blocks.forEach((bp) => {
      init[bp.blockId] = {
        checks: bp.checks,
        fields: bp.fields,
        drillAnswers: bp.drillAnswers,
        completed: bp.completed,
        elapsedSec: bp.elapsedSec,
      };
    });
    return init;
  });

  const latestRef = useRef(states);
  useEffect(() => {
    latestRef.current = states;
  }, [states]);

  const [revealedModel, setRevealedModel] = useState<Record<string, boolean>>({});

  const [sessionStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const blockMountedAt = useRef<Record<string, number>>({});
  const currentBlock = idx < blocks.length ? blocks[idx] : null;
  useEffect(() => {
    if (currentBlock) blockMountedAt.current[currentBlock.id] = Date.now();
  }, [currentBlock?.id]);

  const pendingRef = useRef<Record<string, SavePatch>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function elapsedFor(blockId: string) {
    const base = latestRef.current[blockId]?.elapsedSec ?? 0;
    const mountedAt = blockMountedAt.current[blockId];
    const live = mountedAt ? Math.floor((now - mountedAt) / 1000) : 0;
    return base + live;
  }

  function updateBlock(blockId: string, patch: Partial<BlockState>) {
    setStates((prev) => ({ ...prev, [blockId]: { ...prev[blockId], ...patch } }));
  }

  async function persistNow(blockId: string, patch: SavePatch, posIdx?: number) {
    const currentIdx = posIdx ?? idx;
    try {
      const res = await fetch(`/api/lms/courses/${course.id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId, currentIdx, ...patch }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Save failed");
    } catch {
      toast("Couldn't save — check your connection", "error");
    }
  }

  function flush(blockId: string, extra?: { completed?: boolean }) {
    clearTimeout(saveTimers.current[blockId]);
    const pending = pendingRef.current[blockId] ?? {};
    pendingRef.current[blockId] = {};
    return persistNow(blockId, { ...pending, elapsedSec: elapsedFor(blockId), ...(extra ?? {}) });
  }

  function scheduleSave(blockId: string, partial: SavePatch) {
    const pending = pendingRef.current[blockId] ?? {};
    pendingRef.current[blockId] = {
      checks: { ...(pending.checks ?? {}), ...(partial.checks ?? {}) },
      fields: { ...(pending.fields ?? {}), ...(partial.fields ?? {}) },
      drillAnswers: { ...(pending.drillAnswers ?? {}), ...(partial.drillAnswers ?? {}) },
    };
    clearTimeout(saveTimers.current[blockId]);
    saveTimers.current[blockId] = setTimeout(() => void flush(blockId), 400);
  }

  function toggleCheck(blockId: string, i: number, checked: boolean) {
    const cur = latestRef.current[blockId];
    const checks = { ...cur.checks, [String(i)]: checked };
    updateBlock(blockId, { checks });
    scheduleSave(blockId, { checks: { [String(i)]: checked } });
  }

  function setFieldValue(blockId: string, fieldId: string, value: string) {
    const cur = latestRef.current[blockId];
    const fields = { ...cur.fields, [fieldId]: value };
    updateBlock(blockId, { fields });
    scheduleSave(blockId, { fields: { [fieldId]: value } });
  }

  function setDrillAnswer(blockId: string, i: number, answer: string) {
    const cur = latestRef.current[blockId];
    const key = String(i);
    const nextDrill = { ...(cur.drillAnswers[key] ?? { answer: "", revealed: false }), answer };
    updateBlock(blockId, { drillAnswers: { ...cur.drillAnswers, [key]: nextDrill } });
    scheduleSave(blockId, { drillAnswers: { [key]: nextDrill } });
  }

  function revealDrill(blockId: string, i: number) {
    const cur = latestRef.current[blockId];
    const key = String(i);
    const nextDrill = { ...(cur.drillAnswers[key] ?? { answer: "", revealed: false }), revealed: true };
    updateBlock(blockId, { drillAnswers: { ...cur.drillAnswers, [key]: nextDrill } });
    scheduleSave(blockId, { drillAnswers: { [key]: nextDrill } });
    void flush(blockId);
  }

  /** Move to a block and persist the new position so revisits resume there. */
  function navigateTo(nextIdx: number) {
    setIdx(nextIdx);
    setFar((f) => Math.max(f, nextIdx));
    const b = blocks[nextIdx];
    if (b) void persistNow(b.id, {}, nextIdx);
    window.scrollTo(0, 0);
  }
  async function completeBlock() {
    if (!currentBlock) return;
    const blockId = currentBlock.id;
    updateBlock(blockId, { completed: true });
    await flush(blockId, { completed: true });
    const nextIdx = idx + 1;
    toast(nextIdx >= blocks.length ? "That's the module — nice work." : "Nice — that one's done.", "success");
    navigateTo(nextIdx);
  }

  const blocksDone = blocks.filter((b) => states[b.id]?.completed).length;
  const sessionElapsed = Math.floor((now - sessionStart) / 1000);

  const exportText = useMemo(() => {
    const lines: string[] = [`# ${course.title} — ${new Date().toLocaleDateString()}`, ""];
    blocks.forEach((b, i) => {
      lines.push(`## ${i}. ${b.title}`);
      (b.fields ?? []).forEach((f) => {
        const v = states[b.id]?.fields[f.id];
        if (v?.trim()) lines.push(`**${f.label}**\n${v.trim()}\n`);
      });
      (b.drills ?? []).forEach((d, j) => {
        const v = states[b.id]?.drillAnswers[String(j)]?.answer;
        if (v?.trim()) lines.push(`**${d.q}**\n${v.trim()}\n`);
      });
      lines.push("");
    });
    return lines.join("\n");
  }, [blocks, course.title, states]);

  if (!started) {
    return (
      <div className={"mx-auto max-w-xl p-8" + guardCls} {...copyGuard}>
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] bg-teal">
          <Rocket className="h-5 w-5 text-white" />
        </div>
        <h1 className="mb-3 text-3xl font-bold leading-tight text-ink">{course.title}</h1>
        {course.description && <p className="mb-4 text-[15px] text-muted">{course.description}</p>}
        <ul className="mb-6 border-t border-edge">
          {[
            "Each block ends with real work you produce — a list, a message, an answer — nothing unlocks until it's filled in.",
            "There's no timer to beat. Work at your pace — the clock on screen is just so leadership can see how a cycle goes.",
            "Write in your own voice — copying the examples word for word defeats the point.",
            "Your work autosaves as you type, so you can leave and come back whenever.",
          ].map((r) => (
            <li key={r} className="flex items-start gap-2.5 border-b border-edge py-3 text-[13.5px] text-muted">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
              {r}
            </li>
          ))}
        </ul>
        <button className={primaryBtn} onClick={() => setStarted(true)}>
          Let's start →
        </button>
      </div>
    );
  }

  if (!currentBlock) {
    const mins = Math.round(sessionElapsed / 60);
    let words = 0;
    Object.values(states).forEach((s) => {
      Object.values(s.fields).forEach((v) => (words += (v || "").trim().split(/\s+/).filter(Boolean).length));
      Object.values(s.drillAnswers).forEach((d) => (words += (d.answer || "").trim().split(/\s+/).filter(Boolean).length));
    });
    return (
      <div className={"mx-auto max-w-xl p-8" + guardCls} {...copyGuard}>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald/15">
          <Trophy className="h-6 w-6 text-emerald" />
        </div>
        <h1 className="mb-2 text-3xl font-bold text-ink">Nice work — you finished it.</h1>
        <p className="mb-5 text-[15px] text-muted">
          Everything below is your own work. Copy it into your tracker or CRM notes — it's yours to reuse.
        </p>
        <div className="mb-6 flex gap-8 rounded-[10px] border border-edge bg-raised p-4">
          <Stat label="blocks cleared" value={blocks.length} accent="var(--emerald)" />
          <Stat label="minutes on the clock" value={mins} />
          <Stat label="words written" value={words} />
        </div>
        <textarea readOnly value={exportText} rows={12} className={inputCls + " mb-4 tnum text-[12px]"} />
        <div className="flex flex-wrap gap-2">
          <button
            className={primaryBtn}
            onClick={() => {
              navigator.clipboard.writeText(exportText).then(
                () => toast("Copied", "success"),
                () => toast("Select the text and copy manually", "error")
              );
            }}
          >
            Copy my work
          </button>
          <button className={ghostBtn} onClick={() => navigateTo(0)}>
            Go back through the blocks
          </button>
          <BackButton fallbackHref="/lms" label="Back to Learning" className="px-3 py-2 text-[13px]" />
        </div>
      </div>
    );
  }

  const s = states[currentBlock.id];
  const ready = isReady(currentBlock, s);
  const isLast = idx === blocks.length - 1;
  const hasHelp = Boolean(currentBlock.trap || currentBlock.rubric || currentBlock.modelAnswer);

  return (
    <div className={"grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-0" + guardCls} {...copyGuard}>
      <nav className="sticky top-0 h-fit border-r border-edge py-4">
        <div className="mb-3 px-4">
          <BackButton fallbackHref="/lms" label="Back to LMS" />
        </div>
        <div className="mb-2 px-4 text-[11px] text-muted">Session run-sheet</div>
        {blocks.map((b, i) => {
          const open = i <= far;
          const on = i === idx;
          return (
            <button
              key={b.id}
              disabled={!open}
              onClick={() => navigateTo(i)}
              className={
                "flex w-full items-center gap-2.5 border-l-2 px-4 py-2 text-left text-[13px] disabled:opacity-30 " +
                (on ? "border-teal bg-raised text-ink" : "border-transparent text-muted hover:bg-raised")
              }
            >
              <span className="w-4 text-[12px] text-muted">{i}</span>
              <span className="flex-1">{b.title}</span>
              {states[b.id]?.completed && <Check className="h-3.5 w-3.5 text-emerald" />}
            </button>
          );
        })}
      </nav>

      <div className="mx-auto w-full max-w-3xl p-6">
        <div className="mb-5 rounded-[10px] border border-edge bg-raised p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <Sparkles className="h-3.5 w-3.5 text-teal" />
              {encourage(blocksDone, blocks.length)}
            </div>
            <div className="text-[11px] text-muted">{blocksDone} / {blocks.length} blocks</div>
          </div>
          <Bar pct={(blocksDone / blocks.length) * 100} color="var(--teal)" />
          <div className="mt-3 flex gap-6">
            <Stat label="this block" value={mmss(elapsedFor(currentBlock.id))} />
            <Stat label="session" value={mmss(sessionElapsed)} />
          </div>
        </div>

        <div className="mb-1.5 text-[12.5px] text-muted">
          Block {idx + 1} of {blocks.length}
        </div>
        <h2 className="mb-2.5 text-[26px] font-bold leading-tight text-ink">{currentBlock.title}</h2>
        <ExpandableProse text={currentBlock.goal} className="max-w-[60ch] text-[15px] text-muted" />

        {currentBlock.tasks && (
          <Section title="Start here" icon={ListChecks}>
            {currentBlock.tasks.map((t, i) => {
              const key = String(i);
              const on = Boolean(s.checks[key]);
              return (
                <label key={i} className="flex items-start gap-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => toggleCheck(currentBlock.id, i, e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-teal"
                  />
                  <span className={"max-w-[66ch] text-[14px] " + (on ? "text-muted line-through" : "text-ink")}>
                    {t}
                  </span>
                </label>
              );
            })}
          </Section>
        )}

        {currentBlock.fields && (
          <Section title="Your work" icon={PenLine}>
            {currentBlock.fields.map((f) => {
              const v = s.fields[f.id] ?? "";
              const over = f.limit ? v.length > f.limit : false;
              return (
                <div key={f.id} className="mb-4">
                  <div className="mb-1.5 flex items-baseline gap-2 text-[13.5px] font-semibold text-ink">
                    {f.label}
                    {f.required === false && <span className="text-[12.5px] font-normal text-muted">optional</span>}
                    {f.hint && <span className="text-[12.5px] font-normal text-muted">{f.hint}</span>}
                    {f.limit && (
                      <span className={"ml-auto text-[12px] " + (over ? "font-bold text-crimson" : "text-muted")}>
                        {v.length} / {f.limit}
                      </span>
                    )}
                  </div>
                  {f.type === "text" ? (
                    <input
                      type="text"
                      value={v}
                      placeholder={f.ph}
                      onChange={(e) => setFieldValue(currentBlock.id, f.id, e.target.value)}
                      className={inputCls}
                    />
                  ) : (
                    <textarea
                      value={v}
                      rows={f.rows ?? 4}
                      placeholder={f.ph}
                      onChange={(e) => setFieldValue(currentBlock.id, f.id, e.target.value)}
                      className={inputCls}
                    />
                  )}
                </div>
              );
            })}
          </Section>
        )}

        {currentBlock.drills && (
          <Section title="Try it, then compare" icon={MessageCircleQuestion}>
            {currentBlock.drills.map((d, i) => {
              const key = String(i);
              const drill = s.drillAnswers[key] ?? { answer: "", revealed: false };
              const canReveal = drill.answer.trim().length >= 12;
              return (
                <div key={i} className="mb-3 rounded-md border border-edge bg-raised p-3.5">
                  <div className="mb-1 font-semibold text-ink">{d.q}</div>
                  <div className="mb-2 text-[12.5px] text-muted">{d.c}</div>
                  <textarea
                    value={drill.answer}
                    rows={3}
                    placeholder="Your reply, out loud then typed"
                    onChange={(e) => setDrillAnswer(currentBlock.id, i, e.target.value)}
                    className={inputCls}
                  />
                  <button
                    disabled={!canReveal || drill.revealed}
                    onClick={() => revealDrill(currentBlock.id, i)}
                    className={ghostBtn + " mt-2 disabled:opacity-40"}
                  >
                    {drill.revealed ? "Model answer shown" : "Show a model answer"}
                  </button>
                  {drill.revealed && (
                    <div className="mt-2.5 border-l-2 border-emerald pl-3 text-[14px] text-ink">
                      <em className="mb-0.5 block text-[12.5px] not-italic text-muted">One way to play it</em>
                      {d.a}
                    </div>
                  )}
                </div>
              );
            })}
          </Section>
        )}

        <Section title="Quick gut-check" icon={CircleCheck}>
          <ul className="space-y-1.5">
            {currentBlock.checks.map((c, i) => (
              <li key={i} className="relative max-w-[62ch] pl-4 text-[14px] text-ink">
                <span className="absolute left-0 top-[9px] h-[6px] w-[6px] bg-teal" />
                {c}
              </li>
            ))}
          </ul>
        </Section>

        {hasHelp && (
          <div className="mb-6">
            <details className="group rounded-[10px] border border-edge bg-raised open:pb-4">
              <summary className={summaryCls + " px-4 py-3"}>
                <Lightbulb className="h-4 w-4 text-amber" />
                <span className="flex-1 text-ink">Need a hand?</span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-5 px-4">
                {currentBlock.trap && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-amber">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      The mistake everyone makes here
                    </div>
                    <ExpandableProse
                      text={currentBlock.trap}
                      className="max-w-[62ch] whitespace-pre-line text-[13.5px] text-muted"
                    />
                  </div>
                )}

                {currentBlock.rubric && (
                  <div>
                    <div className="mb-2 text-[12px] font-semibold text-ink">What good looks like</div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-[12.5px]">
                        <thead>
                          <tr className="text-left text-muted">
                            <th className="border-b border-edge py-1.5 pr-3 font-medium">Criterion</th>
                            <th className="border-b border-edge py-1.5 pr-3 font-medium">Weak (1)</th>
                            <th className="border-b border-edge py-1.5 pr-3 font-medium">Okay (3)</th>
                            <th className="border-b border-edge py-1.5 font-medium">Strong (5)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentBlock.rubric.map((r) => (
                            <tr key={r.key} className="align-top text-ink">
                              <td className="border-b border-edge py-2 pr-3 font-medium">{r.name}</td>
                              <td className="border-b border-edge py-2 pr-3 text-muted">{r.anchor1}</td>
                              <td className="border-b border-edge py-2 pr-3 text-muted">{r.anchor3}</td>
                              <td className="border-b border-edge py-2 text-muted">{r.anchor5}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {currentBlock.modelAnswer && (
                  <div>
                    <div className="mb-2 text-[12px] font-semibold text-ink">See a model answer</div>
                    <button
                      disabled={revealedModel[currentBlock.id]}
                      onClick={() => setRevealedModel((r) => ({ ...r, [currentBlock.id]: true }))}
                      className={ghostBtn + " disabled:opacity-40"}
                    >
                      {revealedModel[currentBlock.id] ? "Model answer shown" : "Show a model answer"}
                    </button>
                    {revealedModel[currentBlock.id] && (
                      <ExpandableProse
                        text={currentBlock.modelAnswer}
                        className="mt-2.5 max-w-[62ch] whitespace-pre-line border-l-2 border-emerald pl-3 text-[14px] text-ink"
                      />
                    )}
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

        {currentBlock.asset && (
          <p className="mb-6 text-[12.5px] text-muted">
            <span className="font-semibold text-ink">Reusable asset this produces:</span> {currentBlock.asset}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4">
          {idx > 0 && (
            <button className={ghostBtn} onClick={() => navigateTo(idx - 1)}>
              Back
            </button>
          )}
          <button className={primaryBtn} disabled={!ready} onClick={completeBlock}>
            {isLast ? "Finish and see my summary" : "Mark done, next block"}
          </button>
          <span className="text-[12.5px] text-muted">
            {ready ? "Everything on this block is filled in." : "Fill every box and tick every task to unlock this."}
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-1.5 border-b border-edge pb-1.5 text-[13px] font-semibold text-ink">
        <Icon className="h-4 w-4 text-teal" />
        {title}
      </div>
      {children}
    </div>
  );
}
