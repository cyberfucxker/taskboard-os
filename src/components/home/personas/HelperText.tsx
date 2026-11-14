import React from "react";
import { HelpCircle } from "lucide-react";

interface HelperTextProps {
  children?: React.ReactNode;
  text?: string;
  tooltip?: string;
  className?: string;
}

/**
 * Plain-language helper text for non-technical users.
 * Shows grey sub-text and optional hover tooltip with "?" icon.
 */
export function HelperText({ children, text, tooltip, className = "" }: HelperTextProps) {
  const content = text || children;

  return (
    <span className={`inline-flex items-center gap-1 text-[12px] text-muted ${className}`}>
      {content && <span>{content}</span>}
      {tooltip && (
        <span className="group relative inline-flex items-center cursor-help">
          <HelpCircle className="h-3.5 w-3.5 text-muted hover:text-ink transition-colors" />
          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden w-48 rounded bg-surface border border-edge p-1.5 text-[11px] text-ink shadow-md group-hover:block z-50 text-center leading-tight">
            {tooltip}
          </span>
        </span>
      )}
    </span>
  );
}
