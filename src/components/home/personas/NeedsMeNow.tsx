"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Clock, MessageSquare, PhoneCall, ShieldAlert, Sparkles } from "lucide-react";
import { RowActions } from "./RowActions";
import { HelperText } from "./HelperText";

export interface ActionItem {
  id: string;
  type?: "task" | "approval" | "lead" | "client_reply" | "blocker" | "leave";
  category?: string;
  title: string;
  subtitle?: string;
  helper?: string;
  tooltip?: string;
  badge?: { label: string; variant?: "danger" | "warning" | "info" | "neutral" };
  taskId?: string;
  leadId?: string;
  approvalId?: string;
  href?: string;
  contextUrl?: string;
  status?: string;
  urgency?: "high" | "medium" | "low";
  dueText?: string;
  assigneeName?: string;
  onActionSuccess?: () => void;
}

export type NeedsMeItem = ActionItem;

interface NeedsMeNowProps {
  items: ActionItem[];
  title?: string;
  helper?: string;
  emptyMessage?: string;
  onItemHandled?: (id: string) => void;
  className?: string;
}

export function NeedsMeNow({
  items,
  title = "Needs me now",
  helper = "Top items requiring your immediate action or reply",
  emptyMessage = "You're all caught up! Nothing waiting on you right now.",
  onItemHandled,
  className = "",
}: NeedsMeNowProps) {
  const displayItems = items.slice(0, 5);

  const getIcon = (type?: ActionItem["type"]) => {
    switch (type) {
      case "client_reply":
        return <MessageSquare className="h-4 w-4 text-amber" />;
      case "blocker":
        return <ShieldAlert className="h-4 w-4 text-rose" />;
      case "leave":
      case "approval":
        return <CheckCircle2 className="h-4 w-4 text-teal" />;
      case "lead":
        return <PhoneCall className="h-4 w-4 text-sky" />;
      case "task":
      default:
        return <AlertCircle className="h-4 w-4 text-amber" />;
    }
  };

  const getBadgeClass = (variant?: string) => {
    switch (variant) {
      case "danger":
        return "bg-rose/10 text-rose border-rose/20";
      case "warning":
        return "bg-amber/10 text-amber border-amber/20";
      case "info":
        return "bg-teal/10 text-teal border-teal/20";
      default:
        return "bg-raised text-muted border-edge";
    }
  };

  return (
    <section className={`rounded-xl border border-edge bg-surface p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-edge/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber/10 text-amber font-semibold text-[11px]">
            ⚡
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-ink leading-none">{title}</h2>
            {helper && <HelperText text={helper} className="mt-0.5" />}
          </div>
        </div>
        <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="mt-3 divide-y divide-edge/50">
        {displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Sparkles className="h-6 w-6 text-teal/60 mb-2" />
            <p className="text-[13px] font-medium text-ink">{emptyMessage}</p>
            <p className="text-[11px] text-muted mt-0.5">New items will appear here automatically when triggers occur.</p>
          </div>
        ) : (
          displayItems.map((item) => {
            const targetHref = item.href || item.contextUrl;
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-1 last:pb-1">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="mt-0.5 shrink-0">{getIcon(item.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {targetHref ? (
                        <Link
                          href={targetHref}
                          className="text-[13px] font-medium text-ink hover:text-teal hover:underline truncate"
                        >
                          {item.title}
                        </Link>
                      ) : (
                        <span className="text-[13px] font-medium text-ink truncate">{item.title}</span>
                      )}

                      {item.badge && (
                        <span
                          className={`rounded border px-1.5 py-0.2 text-[10px] font-medium ${getBadgeClass(
                            item.badge.variant
                          )}`}
                        >
                          {item.badge.label}
                        </span>
                      )}

                      {item.category && (
                        <span className="rounded border border-edge bg-raised px-1.5 py-0.2 text-[10px] font-medium text-muted">
                          {item.category}
                        </span>
                      )}
                    </div>

                    {item.subtitle && (
                      <div className="text-[12px] text-muted truncate mt-0.5">{item.subtitle}</div>
                    )}

                    {item.dueText && (
                      <div className="text-[11px] text-amber mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{item.dueText}</span>
                      </div>
                    )}

                    {item.helper && (
                      <HelperText text={item.helper} tooltip={item.tooltip} className="mt-0.5" />
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {item.taskId || item.leadId ? (
                    <RowActions
                      taskId={item.taskId}
                      leadId={item.leadId}
                      currentStatus={item.status}
                      onSuccess={() => {
                        item.onActionSuccess?.();
                        onItemHandled?.(item.id);
                      }}
                    />
                  ) : targetHref ? (
                    <Link
                      href={targetHref}
                      className="inline-flex items-center gap-1 rounded border border-edge bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:bg-raised transition-colors"
                    >
                      <span>View</span>
                      <ArrowRight className="h-3 w-3 text-muted" />
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}