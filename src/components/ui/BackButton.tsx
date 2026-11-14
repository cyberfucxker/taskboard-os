"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

export function BackButton({
  className,
  label = "Back",
  fallbackHref,
}: {
  className?: string;
  label?: string;
  fallbackHref?: string;
}) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (fallbackHref) {
      router.push(fallbackHref);
    } else {
      router.back();
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-hover bg-raised px-2.5 py-1 text-[12px] font-medium text-muted transition hover:border-edge hover:bg-hover hover:text-ink",
        className
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
