"use client";

import { useState } from "react";
import {
  Code2,
  GitBranch,
  Github,
  Globe,
  Key,
  Layers,
  Palette,
  Eye,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  Plus,
  Trash2,
  Lock
} from "lucide-react";
import { Card, SectionLabel, Badge } from "@/components/ui";

export interface DevCredential {
  label: string;
  type: "API_KEY" | "SSH_SERVER" | "DATABASE" | "ADMIN_LOGIN" | "ENV_VAR" | "OTHER";
  value: string;
  notes?: string;
}

export interface DevHubData {
  githubRepo?: string;
  stagingUrl?: string;
  productionUrl?: string;
  figmaUrl?: string;
  docsUrl?: string;
  techStack?: string[];
  credentials?: DevCredential[];
}

export function ProjectDevHub({
  projectId,
  initialData,
  canManage = true,
}: {
  projectId: string;
  initialData?: DevHubData;
  canManage?: boolean;
}) {
  const [data, setData] = useState<DevHubData>(initialData || {
    githubRepo: "https://github.com/your-org",
    stagingUrl: "",
    productionUrl: "",
    figmaUrl: "",
    docsUrl: "",
    techStack: ["Next.js", "TypeScript", "PostgreSQL", "Tailwind CSS"],
    credentials: []
  });

  const [activeTab, setActiveTab] = useState<"dev" | "design" | "credentials">("dev");
  const [revealedIdx, setRevealedIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showAddCred, setShowAddCred] = useState(false);
  const [newCred, setNewCred] = useState<DevCredential>({ label: "", type: "API_KEY", value: "", notes: "" });

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/20 text-tealhi">
            <Code2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-ink">Project Workflows & Technical Hub</h3>
            <p className="text-[11px] text-muted">Repo links, environments, and developer access credentials</p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1.5 rounded-lg border border-edge bg-raised p-1">
          <button
            onClick={() => setActiveTab("dev")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              activeTab === "dev" ? "bg-teal text-white" : "text-muted hover:text-ink"
            }`}
          >
            <Github className="h-3 w-3" /> Dev & Git
          </button>
          <button
            onClick={() => setActiveTab("design")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              activeTab === "design" ? "bg-pink text-white" : "text-muted hover:text-ink"
            }`}
          >
            <Palette className="h-3 w-3" /> Design & Assets
          </button>
          <button
            onClick={() => setActiveTab("credentials")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              activeTab === "credentials" ? "bg-emerald text-white" : "text-muted hover:text-ink"
            }`}
          >
            <Lock className="h-3 w-3" /> Access & Secrets
          </button>
        </div>
      </div>

      {/* TAB 1: DEV & GIT */}
      {activeTab === "dev" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* GitHub Repo */}
            <div className="rounded-[10px] border border-edge bg-raised p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                  <Github className="h-3.5 w-3.5 text-ink" /> Repository
                </span>
                <span className="text-[11px] tnum text-emerald bg-emerald/10 px-1.5 py-0.5 rounded">active</span>
              </div>
              <div className="text-[13px] tnum text-tealhi truncate">
                {data.githubRepo || "Not configured"}
              </div>
              {data.githubRepo && (
                <a
                  href={data.githubRepo}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink transition"
                >
                  <ExternalLink className="h-3 w-3" /> Open in GitHub
                </a>
              )}
            </div>

            {/* Staging URL */}
            <div className="rounded-[10px] border border-edge bg-raised p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                  <Globe className="h-3.5 w-3.5 text-tealhi" /> Staging Server
                </span>
                <span className="text-[11px] tnum text-tealhi bg-tealhi/10 px-1.5 py-0.5 rounded">staging</span>
              </div>
              <div className="text-[13px] tnum text-ink truncate">
                {data.stagingUrl || "http://localhost:3001"}
              </div>
              <a
                href={data.stagingUrl || "http://localhost:3001"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-tealhi hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Launch Staging
              </a>
            </div>

            {/* Production URL */}
            <div className="rounded-[10px] border border-edge bg-raised p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                  <Globe className="h-3.5 w-3.5 text-emerald" /> Production Live
                </span>
                <span className="text-[11px] tnum text-emerald bg-emerald/10 px-1.5 py-0.5 rounded">live</span>
              </div>
              <div className="text-[13px] tnum text-ink truncate">
                {data.productionUrl || "https://taskboard.example.com"}
              </div>
              <a
                href={data.productionUrl || "https://taskboard.example.com"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-emerald hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Visit Live App
              </a>
            </div>
          </div>

          {/* Tech Stack Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-muted mr-1">Stack:</span>
            {data.techStack?.map((t) => (
 <span key={t} className="rounded-md border border-edge bg-raised h-8 px-3 text-[13px] tnum text-ink">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: DESIGN & CREATIVE */}
      {activeTab === "design" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-[10px] border border-edge bg-raised p-3.5 space-y-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-pink">
              <Palette className="h-3.5 w-3.5" /> Figma Workspace
            </span>
            <p className="text-[12px] text-muted">Interactive UI components, wireframes, and creative design tokens.</p>
            {data.figmaUrl ? (
              <a
                href={data.figmaUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-pink/10 border border-pink/30 px-2.5 py-1 text-[11px] font-medium text-pink hover:bg-pink/20 transition"
              >
                <ExternalLink className="h-3 w-3" /> Open Figma Design
              </a>
            ) : (
              <p className="text-[11px] text-faint">No Figma link set for this project yet.</p>
            )}
          </div>

          <div className="rounded-[10px] border border-edge bg-raised p-3.5 space-y-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber">
              <Layers className="h-3.5 w-3.5" /> Brand Assets & Drive
            </span>
            <p className="text-[12px] text-muted">High-res logos, stationery, typography, and marketing assets.</p>
            {data.docsUrl ? (
              <a
                href={data.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-amber/10 border px-2.5 py-1 text-[11px] font-medium text-amber hover:bg-amber/20 transition"
              >
                <ExternalLink className="h-3 w-3" /> View Brand Drive
              </a>
            ) : (
              <p className="text-[11px] text-faint">No Drive link set for this project yet.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CREDENTIALS & ACCESS SECRETS */}
      {activeTab === "credentials" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-amber">
              Not saved yet — this list only lives in your browser tab and is lost on refresh.
              Don\'t rely on it to actually share credentials with the team.
            </p>
            {canManage && (
              <button
                onClick={() => setShowAddCred(!showAddCred)}
 className="flex items-center gap-1 rounded-md border border-edge bg-raised text-ink hover:bg-hover h-8 px-3 text-[13px] font-medium /30 transition"
              >
                <Plus className="h-3 w-3" /> Add Secret
              </button>
            )}
          </div>

          {/* Add form */}
          {showAddCred && (
            <div className="rounded-[10px] border bg-raised p-3.5 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Secret Label (e.g. AWS S3 Key)"
                  value={newCred.label}
                  onChange={(e) => setNewCred({ ...newCred, label: e.target.value })}
                  className="rounded-md border border-edge bg-transparent px-2.5 py-1 text-[12px] text-ink outline-none focus:border-teal"
                />
                <select
                  value={newCred.type}
                  onChange={(e) => setNewCred({ ...newCred, type: e.target.value as DevCredential["type"] })}
                  className="rounded-md border border-edge bg-transparent px-2.5 py-1 text-[12px] text-ink outline-none focus:border-teal"
                >
                  <option value="API_KEY">API Key</option>
                  <option value="SSH_SERVER">SSH Server</option>
                  <option value="DATABASE">Database URL</option>
                  <option value="ADMIN_LOGIN">Admin Login</option>
                  <option value="ENV_VAR">Env Variable</option>
                  <option value="OTHER">Other</option>
                </select>
                <input
                  type="text"
                  placeholder="Secret Value / Connection String"
                  value={newCred.value}
                  onChange={(e) => setNewCred({ ...newCred, value: e.target.value })}
                  className="rounded-md border border-edge bg-transparent px-2.5 py-1 text-[12px] text-ink outline-none focus:border-teal"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowAddCred(false)}
                  className="rounded-md border border-edge px-2.5 py-1 text-[11px] text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (newCred.label && newCred.value) {
                      setData({ ...data, credentials: [...(data.credentials || []), newCred] });
                      setNewCred({ label: "", type: "API_KEY", value: "", notes: "" });
                      setShowAddCred(false);
                    }
                  }}
 className="rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white hover:bg-tealhi"
                >
                  Save Secret
                </button>
              </div>
            </div>
          )}

          {/* Credentials List */}
          <div className="space-y-2">
            {data.credentials?.map((c, idx) => {
              const isRevealed = revealedIdx === idx;
              const isCopied = copiedIdx === idx;

              return (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-[10px] border border-edge bg-raised px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-ink">{c.label}</span>
                      <span className="rounded bg-transparent border border-edge px-1.5 py-0.5 text-[9px] tnum text-muted">
                        {c.type}
                      </span>
                    </div>
                    <div className="mt-1 tnum text-[12px] text-tealhi truncate">
                      {isRevealed ? c.value : "••••••••••••••••••••••••••••••"}
                    </div>
                    {c.notes && <div className="text-[11px] text-muted mt-0.5">{c.notes}</div>}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setRevealedIdx(isRevealed ? null : idx)}
                      className="p-1.5 rounded-md border border-edge text-muted hover:text-ink transition"
                      title={isRevealed ? "Hide Secret" : "Reveal Secret"}
                    >
                      {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-tealhi" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(c.value, idx)}
                      className="flex items-center gap-1 rounded-md bg-hover border border-edge px-2 py-1 text-[11px] text-ink hover:bg-edge transition"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald" />
                          <span className="text-emerald">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
