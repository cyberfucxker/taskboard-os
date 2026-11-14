"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import { Upload, Download, Trash2, FileText, Image, File, AlertCircle } from "lucide-react";
import { Avatar } from "@/components/ui";
import { useToast } from "@/components/Toast";

const REPORT_KINDS = [
  { value: "DAILY_REPORT", label: "Daily Report" },
  { value: "WEEKLY_REPORT", label: "Weekly Report" },
  { value: "DESIGN_REVIEW", label: "Design Review" },
  { value: "BUG_REPORT", label: "Bug Report" },
  { value: "GENERAL", label: "General" },
] as const;

type ReportKind = (typeof REPORT_KINDS)[number]["value"];

interface ReportMeta {
  id: string;
  kind: ReportKind;
  title: string;
  note: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  authorId: string | null;
  author: string;
}

const fieldCls =
  "w-full rounded-md border border-hover bg-bg px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none";

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <Image className="h-4 w-4 text-teal" />;
  if (mime === "application/pdf") return <FileText className="h-4 w-4 text-crimson" />;
  return <File className="h-4 w-4 text-muted" />;
}

function kindLabel(k: ReportKind) {
  return REPORT_KINDS.find((r) => r.value === k)?.label ?? k;
}

const KIND_COLORS: Record<ReportKind, string> = {
  DAILY_REPORT: "var(--teal)",
  WEEKLY_REPORT: "var(--emerald)",
  DESIGN_REVIEW: "var(--amber)",
  BUG_REPORT: "var(--crimson)",
  GENERAL: "var(--muted)",
};

export function TaskReports({
  taskId,
  currentUserId,
  currentUserRole,
  open,
}: {
  taskId: string;
  currentUserId?: string;
  currentUserRole?: string;
  open: boolean;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadKind, setUploadKind] = useState<ReportKind>("GENERAL");
  const [uploadNote, setUploadNote] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const isLeadership = ["SUPER_ADMIN", "DEPARTMENT_HEAD", "HR"].includes(currentUserRole ?? "");

  // All assignees can now view everything.
  async function loadReports() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/reports`);
      const data = await res.json();
      if (data.ok) setReports(data.reports ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const live = useLiveVersion();
  useEffect(() => {
    if (open && taskId) loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, open, live]);

  function resetUpload() {
    setUploadFile(null);
    setUploadTitle("");
    setUploadKind("GENERAL");
    setUploadNote("");
    setShowUpload(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onFilePick(f: File) {
    setUploadFile(f);
    if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/, ""));
    setShowUpload(true);
  }

  async function submitUpload() {
    if (!uploadFile || !uploadTitle.trim() || uploading) return;
    if (uploadFile.size > 10 * 1024 * 1024) {
      toast("File too large (max 10 MB)", "error");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("title", uploadTitle.trim());
      fd.append("kind", uploadKind);
      if (uploadNote.trim()) fd.append("note", uploadNote.trim());

      const res = await fetch(`/api/tasks/${taskId}/reports`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.ok) {
        toast("Report submitted", "success");
        resetUpload();
        await loadReports();
      } else {
        toast(data.error ?? "Upload failed", "error");
      }
    } catch {
      toast("Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  async function deleteReport(r: ReportMeta) {
    if (!window.confirm(`Delete "${r.title}"?`)) return;
    setDeleting(r.id);
    try {
      const res = await fetch(`/api/tasks/${taskId}/reports/${r.id}/file`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        toast("Report deleted", "success");
        setReports((prev) => prev.filter((x) => x.id !== r.id));
      } else {
        toast(data.error ?? "Delete failed", "error");
      }
    } catch {
      toast("Delete failed", "error");
    } finally {
      setDeleting(null);
    }
  }

  function downloadUrl(r: ReportMeta) {
    return `/api/tasks/${taskId}/reports/${r.id}/file`;
  }

  return (
    <div className="border-t border-hover px-4 py-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted">
          Reports &amp; Files ({reports.length})
        </span>
        <button
          onClick={() => {
            if (showUpload) {
              resetUpload();
            } else {
              fileInputRef.current?.click();
            }
          }}
          className="flex items-center gap-1 rounded-md border border-hover px-2 py-1 text-[11px] text-muted transition hover:border-teal hover:text-teal"
        >
          <Upload className="h-3.5 w-3.5" />
          {showUpload ? "Cancel" : "Submit report"}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,text/*,.csv,.xlsx,.xls,.doc,.docx,.zip,video/mp4,video/webm"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFilePick(f);
        }}
      />

      {/* Drop zone — shown when upload panel is open */}
      {showUpload && (
        <div
          className={`mt-3 space-y-2 rounded-lg border p-3 transition ${
            dragOver
              ? "border-teal bg-teal/5"
              : "border-dashed border-edge bg-bg"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFilePick(f);
          }}
        >
          {/* File selected indicator */}
          {uploadFile ? (
            <div className="flex items-center gap-2 rounded-md bg-raised px-2.5 py-2">
              <FileIcon mime={uploadFile.type} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{uploadFile.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted">{fmtSize(uploadFile.size)}</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 text-[11px] text-muted hover:text-teal"
              >
                change
              </button>
            </div>
          ) : (
            <div
              className="flex cursor-pointer flex-col items-center gap-1 py-4 text-faint"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6" />
              <span className="text-[12px]">Drop file here or click to select</span>
              <span className="text-[11px]">PDF, image, CSV, Word, zip — max 10 MB</span>
            </div>
          )}

          {/* Form fields */}
          {uploadFile && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <div className="mb-1 text-[11px] text-muted">Title</div>
                  <input
                    className={fieldCls}
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Report title…"
                    maxLength={200}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[11px] text-muted">Type</div>
                  <select
                    className={fieldCls}
                    value={uploadKind}
                    onChange={(e) => setUploadKind(e.target.value as ReportKind)}
                  >
                    {REPORT_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-[11px] text-muted">Note (optional)</div>
                  <input
                    className={fieldCls}
                    value={uploadNote}
                    onChange={(e) => setUploadNote(e.target.value)}
                    placeholder="Short note…"
                  />
                </div>
              </div>

              {uploadFile.size > 10 * 1024 * 1024 && (
                <div className="flex items-center gap-1.5 text-[12px] text-crimson">
                  <AlertCircle className="h-3.5 w-3.5" />
                  File exceeds 10 MB limit
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={resetUpload}
                  className="rounded-md border border-hover px-3 py-1.5 text-[12px] text-muted hover:bg-bg"
                >
                  Cancel
                </button>
                <button
                  onClick={submitUpload}
                  disabled={
                    uploading ||
                    !uploadTitle.trim() ||
                    !uploadFile ||
                    uploadFile.size > 10 * 1024 * 1024
                  }
                  className="flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-tealhi disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? "Uploading…" : "Submit"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Reports list */}
      {loading ? (
        <p className="mt-2 text-[12px] text-faint">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="mt-2 text-[12px] text-faint">No reports yet. Submit one instead of posting to Slack.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {reports.map((r) => {
            const canDelete = isLeadership || r.authorId === currentUserId;
            return (
              <li
                key={r.id}
                className="rounded-lg border border-hover bg-bg px-3 py-2.5"
              >
                <div className="flex items-start gap-2">
                  <FileIcon mime={r.mimeType} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-ink truncate">{r.title}</span>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: `${KIND_COLORS[r.kind]}1f`,
                          color: KIND_COLORS[r.kind],
                          border: `1px solid ${KIND_COLORS[r.kind]}40`,
                        }}
                      >
                        {kindLabel(r.kind)}
                      </span>
                    </div>
                    {r.note && (
                      <p className="mt-0.5 text-[12px] text-muted">{r.note}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-faint">
                      <Avatar name={r.author} size={14} />
                      <span>{r.author}</span>
                      <span>·</span>
                      <span className="font-mono">{r.fileName}</span>
                      <span>·</span>
                      <span>{fmtSize(r.sizeBytes)}</span>
                      <span>·</span>
                      <span>{timeAgo(r.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <a
                      href={downloadUrl(r)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open / download"
                      className="text-muted transition hover:text-teal"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    {canDelete && (
                      <button
                        onClick={() => deleteReport(r)}
                        disabled={deleting === r.id}
                        title="Delete report"
                        className="text-muted transition hover:text-crimson disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
