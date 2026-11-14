" use client";

import React from "react";
import {
  FileText,
  Paperclip,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Layers,
  Calendar,
} from "lucide-react";

/* -------------------------------------------------------------------------
   6. VisualBoard: Creative request board with brief & file attachments
------------------------------------------------------------------------- */
export interface VisualCardItem {
  id: string;
  title: string;
  clientOrProject?: string;
  category?: string; // "UI/UX" | "Social Post" | "Ad Banner" | "Logo"
  deadline?: string;
  status: string; // "IN_PROGRESS" | "REVIEW" | "DONE"
  hasBrief?: boolean;
  fileCount?: number;
  priority?: string;
}

export function VisualBoard({
  title,
  items = [],
  onCardClick,
}: {
  title: string;
  items: VisualCardItem[];
  onCardClick?: (item: VisualCardItem) => void;
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
      <div className="flex items-center justify-between border-b border-hover pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-tealhi" />
          <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        </div>
        <span className="text-[11.5px] font-mono text-muted">{items.length} designs active</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onCardClick?.(item)}
            className="group cursor-pointer rounded-lg border border-edge bg-bg p-3 hover:border-teal/50 hover:bg-surface transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <span className="rounded bg-surface border border-edge px-1.5 py-0.2 text-[9.5px] font-mono text-muted">
                  {item.category || "Design Request"}
                </span>
                <span className="rounded bg-teal/10 px-1.5 py-0.2 text-[9.5px] font-mono font-bold text-tealhi">
                  {item.status}
                </span>
              </div>
              <h4 className="text-[13px] font-semibold text-ink group-hover:text-tealhi transition line-clamp-2">
                {item.title}
              </h4>
              <p className="mt-1 text-[11px] text-muted truncate">📁 {item.clientOrProject || "Direct Request"}</p>
            </div>

            <div className="mt-3 pt-2 border-t border-hover flex items-center justify-between text-[11px] text-muted">
              <div className="flex items-center gap-2">
                {item.hasBrief && (
                  <span className="flex items-center gap-0.5 text-tealhi" title="Creative brief attached">
                    <FileText className="h-3 w-3" />
                    <span>Brief</span>
                  </span>
                )}
                {item.fileCount ? (
                  <span className="flex items-center gap-0.5" title="Attached assets">
                    <Paperclip className="h-3 w-3" />
                    <span>{item.fileCount}</span>
                  </span>
                ) : null}
              </div>
              {item.deadline && (
                <div className="flex items-center gap-1 font-mono">
                  <Clock className="h-2.5 w-2.5" />
                  <span>{item.deadline}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   7. AutoReportDigest: Auto-compiled Daily / Monthly Summary
------------------------------------------------------------------------- */
export function AutoReportDigest({
  title = "Auto-Compiled Daily Digest",
  dateStr = "Today",
  metrics = [],
  summaryPoints = [],
}: {
  title?: string;
  dateStr?: string;
  metrics?: { label: string; value: string | number; change?: string }[];
  summaryPoints?: string[];
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
      <div className="flex items-center justify-between border-b border-hover pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber" />
          <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        </div>
        <span className="text-[11.5px] font-mono text-muted">{dateStr}</span>
      </div>

      {metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {metrics.map((m, idx) => (
            <div key={idx} className="rounded-lg border border-edge bg-bg p-2.5 text-center">
              <div className="text-[18px] font-bold font-mono text-ink">{m.value}</div>
              <div className="text-[11px] text-muted">{m.label}</div>
              {m.change && <div className="text-[10px] text-tealhi font-mono mt-0.5">{m.change}</div>}
            </div>
          ))}
        </div>
      )}

      {summaryPoints.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-edge bg-bg p-3 text-[12px] text-ink">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">Key Takeaways</div>
          {summaryPoints.map((pt, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-tealhi mt-0.5">•</span>
              <span className="text-muted">{pt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
