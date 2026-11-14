"use client";

import React, { useState } from "react";
import { Check, Calendar, User, Search, Flag } from "lucide-react";
import {
  STATUS_MENU_ORDER,
  STATUS_META,
  PRIORITY_MENU_ORDER,
  PRIORITY_META,
  StatusIcon,
  PriorityIcon,
  AssigneeAvatar,
  type Status,
  type Priority,
} from "./atoms";
import type { TaskView } from "@/components/tasks/types";

export const PICKER_CONTENT_CLS =
  "z-[120] min-w-[200px] overflow-hidden rounded-lg border border-edge bg-raised p-1.5 shadow-xl text-ink";

export function StatusMenu({
  current,
  value,
  allowed,
  onSelect,
}: {
  current?: Status | string;
  value?: Status | string;
  allowed?: Status[];
  onSelect: (status: Status, reason?: string) => void;
}) {
  const currentStatus = value ?? current;
  const items = allowed ?? STATUS_MENU_ORDER;

  return (
    <div className="space-y-0.5">
      <div className="px-2 py-1 text-[11px] font-mono text-muted uppercase tracking-wider">
        Change Status
      </div>
      {items.map((s) => {
        const meta = STATUS_META[s];
        const isCurrent = currentStatus === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSelect(s)}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition ${
              isCurrent ? "bg-surface font-semibold text-ink" : "hover:bg-hover text-ink"
            }`}
          >
            <span className="flex items-center gap-2">
              <StatusIcon status={s} className="h-3.5 w-3.5" />
              <span>{meta?.label ?? s}</span>
            </span>
            {isCurrent && <Check className="h-3.5 w-3.5 text-teal shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

export function PriorityMenu({
  current,
  value,
  onSelect,
}: {
  current?: Priority | string;
  value?: Priority | string;
  onSelect: (priority: Priority) => void;
}) {
  const currentPriority = value ?? current;

  return (
    <div className="space-y-0.5">
      <div className="px-2 py-1 text-[11px] font-mono text-muted uppercase tracking-wider">
        Priority
      </div>
      {PRIORITY_MENU_ORDER.map((p) => {
        const meta = PRIORITY_META[p];
        const isCurrent = currentPriority === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition ${
              isCurrent ? "bg-surface font-semibold text-ink" : "hover:bg-hover text-ink"
            }`}
          >
            <span className="flex items-center gap-2">
              <PriorityIcon priority={p} className="h-3.5 w-3.5" />
              <span>{meta.label}</span>
            </span>
            {isCurrent && <Check className="h-3.5 w-3.5 text-teal shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

export function AssigneeMenu({
  value,
  assignees,
  employees,
  currentUserId,
  canAssign,
  offerTake,
  onSelect,
  onToggle,
}: {
  value?: string | null;
  assignees?: { id: string; name: string }[];
  employees: { id: string; name: string; avatarUrl?: string | null }[];
  currentUserId?: string;
  canAssign?: boolean;
  offerTake?: boolean;
  onSelect?: (employee: { id: string; name: string }) => void;
  onToggle?: (empId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const assignedIds = new Set(
    assignees ? assignees.map((a) => a.id) : value ? [value] : []
  );

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase())
  );

  function handleClick(emp: { id: string; name: string }) {
    if (onSelect) onSelect(emp);
    if (onToggle) onToggle(emp.id);
  }

  return (
    <div className="space-y-1.5 min-w-[220px]">
      <div className="px-2 py-1 text-[11px] font-mono text-muted uppercase tracking-wider">
        Assignee
      </div>
      <div className="relative px-1">
        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter team..."
          className="w-full rounded-md border border-edge bg-bg py-1.5 pl-8 pr-2 text-[12px] text-ink focus:border-teal focus:outline-none"
          autoFocus
        />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-0.5 pt-1">
        {filtered.length === 0 ? (
          <div className="p-2 text-center text-[12px] text-muted">No members found</div>
        ) : (
          filtered.map((emp) => {
            const isAssigned = assignedIds.has(emp.id);
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => handleClick(emp)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition ${
                  isAssigned ? "bg-surface font-medium text-ink" : "hover:bg-hover text-ink"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <AssigneeAvatar name={emp.name} avatarUrl={emp.avatarUrl} size={18} />
                  <span className="truncate">{emp.name}</span>
                </span>
                {isAssigned && <Check className="h-3.5 w-3.5 text-teal shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function DueMenu({
  currentDate,
  value,
  onSelect,
}: {
  currentDate?: string | null | undefined;
  value?: string | null | undefined;
  onSelect: (dateStr: string | null) => void;
}) {
  const activeDate = value !== undefined ? value : currentDate;
  const [customVal, setCustomVal] = useState(
    activeDate ? activeDate.slice(0, 10) : ""
  );

  function pickPreset(offsetDays: number | null) {
    if (offsetDays === null) {
      onSelect(null);
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    onSelect(d.toISOString().slice(0, 10));
  }

  return (
    <div className="space-y-1 min-w-[200px]">
      <div className="px-2 py-1 text-[11px] font-mono text-muted uppercase tracking-wider">
        Due Date
      </div>
      <button
        type="button"
        onClick={() => pickPreset(null)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-hover text-ink"
      >
        <span>No Due Date</span>
      </button>
      <button
        type="button"
        onClick={() => pickPreset(0)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-hover text-ink font-medium text-amber"
      >
        <span>Due Today</span>
      </button>
      <button
        type="button"
        onClick={() => pickPreset(1)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-hover text-ink font-medium text-teal"
      >
        <span>Due Tomorrow</span>
      </button>
      <button
        type="button"
        onClick={() => pickPreset(7)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-hover text-ink"
      >
        <span>In 1 Week</span>
      </button>

      <div className="border-t border-hover pt-1.5 px-2">
        <label className="text-[11px] font-mono text-muted uppercase block mb-1">
          Custom Date
        </label>
        <input
          type="date"
          value={customVal}
          onChange={(e) => {
            setCustomVal(e.target.value);
            if (e.target.value) onSelect(e.target.value);
          }}
          className="w-full rounded-md border border-edge bg-bg px-2 py-1 text-[12px] text-ink focus:border-teal focus:outline-none"
        />
      </div>
    </div>
  );
}
