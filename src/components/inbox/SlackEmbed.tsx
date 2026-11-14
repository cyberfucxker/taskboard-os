"use client";

import { useState } from "react";
import { ExternalLink, MessageSquare } from "lucide-react";

export function SlackEmbed() {
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);

  return (
    <div className="flex flex-col h-full min-h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line bg-surface">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <MessageSquare size={15} className="text-[var(--violet)]" />
          Slack — Acme workspace
        </div>
        <a
          href="https://your-workspace.slack.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
        >
          <ExternalLink size={12} /> Open in Slack
        </a>
      </div>

      {/* Embed attempt */}
      {blocked ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
          <div className="h-14 w-14 rounded-2xl bg-[var(--violet)]/10 flex items-center justify-center">
            <MessageSquare size={28} className="text-[var(--violet)]" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-ink">Slack can&apos;t be embedded here</p>
            <p className="mt-1 text-[13px] text-muted max-w-xs">
              Slack&apos;s security policy prevents embedding. Open your workspace directly to chat and share files.
            </p>
          </div>
          <a
            href="https://your-workspace.slack.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--violet)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
          >
            <ExternalLink size={14} /> Open Acme Slack
          </a>
          <a
            href="slack://open"
            className="text-[12px] text-muted hover:text-ink underline"
          >
            Open in desktop app
          </a>
        </div>
      ) : (
        <div className="relative flex-1">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-[var(--violet)]" />
                <span className="text-[12px] text-muted">Loading Slack…</span>
              </div>
            </div>
          )}
          <iframe
            src="https://your-workspace.slack.com"
            className="h-full w-full border-0"
            style={{ minHeight: "600px" }}
            onLoad={() => setLoaded(true)}
            onError={() => setBlocked(true)}
            title="Slack — Acme workspace"
            allow="camera; microphone; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          />
        </div>
      )}
    </div>
  );
}
