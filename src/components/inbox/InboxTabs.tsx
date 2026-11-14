"use client";

import { useState, type ReactNode } from "react";
import { Bell, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { SlackEmbed } from "./SlackEmbed";

const TABS = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "slack", label: "Slack", icon: MessageSquare },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function InboxTabs({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<TabId>("notifications");

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-line bg-surface">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-t border-b-2 transition-colors",
              active === id
                ? "border-[var(--violet)] text-[var(--violet)]"
                : "border-transparent text-muted hover:text-ink"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="flex-1 overflow-auto">
        {active === "notifications" ? children : <SlackEmbed />}
      </div>
    </div>
  );
}
