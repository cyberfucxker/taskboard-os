"use client";

import { useState } from "react";
import { LayoutDashboard, CheckSquare, ClipboardList, Command, X } from "lucide-react";
import { Kbd } from "@/components/ui";

export const ONBOARDING_KEY = "taskboard-onboarded";

const STEPS = [
  {
    icon: LayoutDashboard,
    kicker: "Step 1 of 4",
    title: "This is your Workspace",
    body: "Your personal home. Here you see only YOUR tasks, your running timer, your standup and your projects — nothing to wade through. Start or mark a task done with single click.",
  },
  {
    icon: CheckSquare,
    kicker: "Step 2 of 4",
    title: "Tracking time & tasks",
    body: "Hit ▶ Start on a task to begin tracking, Pause to stop, and Done when it's finished. Your weekly logged hours add up under My Projects.",
  },
  {
    icon: ClipboardList,
    kicker: "Step 3 of 4",
    title: "Daily standup",
    body: "Post a 30-second standup every morning — what you did, what you're doing, what's blocking you. It's the pulse of the team.",
  },
  {
    icon: Command,
    kicker: "Step 4 of 4",
    title: "Jump anywhere with ⌘K",
    body: "Press ",
    key: true,
  },
];

export function OnboardingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  if (!open) return null;

  const s = STEPS[step];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-[10px] border border-edge bg-raised shadow-popover anim-up">
        <div className="flex items-start justify-between border-b border-edge px-5 py-4">
          <div className="flex items-center gap-2">
            <s.icon className="h-5 w-5 text-tealhi" />
            <span className="text-sm font-semibold text-ink">Welcome to TaskBoard OS</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tealhi">{s.kicker}</div>
          <h2 className="mt-1 text-lg font-semibold text-ink">{s.title}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {s.body}
            {s.key && (
              <span className="inline-flex items-center gap-1 align-middle">
                <Kbd>⌘K</Kbd>
                <span>to jump to any task, client or page — and to capture a task in seconds.</span>
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-edge px-5 py-3">
          <button onClick={onClose} className="text-[12px] text-muted hover:text-ink">
            Skip
          </button>
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-tealhi" : "bg-edge"}`}
              />
            ))}
          </div>
          <button
            onClick={() => (step === STEPS.length - 1 ? onClose() : setStep(step + 1))}
            className="rounded-md bg-teal px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-tealhi"
          >
            {step === STEPS.length - 1 ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}