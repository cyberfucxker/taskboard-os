"use client";

import { createContext, useContext, useCallback, useState } from "react";
import { cn } from "@/lib/cn";

interface Toast {
  id: number;
  msg: string;
  tone?: "default" | "success" | "error";
}

const ToastCtx = createContext<(msg: string, tone?: Toast["tone"]) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

const TONES: Record<NonNullable<Toast["tone"]>, string> = {
  default: "border-edge bg-raised text-ink",
  success: "border-emerald/50 bg-raised text-emerald",
  error: "border-crimson/50 bg-raised text-crimson",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((msg: string, tone: Toast["tone"] = "default") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-5 lg:bottom-5 lg:right-5 z-[70] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "anim-up pointer-events-auto rounded-[10px] border px-3.5 py-2 text-[13px] shadow-popover",
              TONES[t.tone ?? "default"]
            )}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
