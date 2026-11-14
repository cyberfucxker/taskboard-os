"use client";

import { useState } from "react";
import { Link2, CheckCircle, AlertTriangle, Loader2, HardDrive } from "lucide-react";

interface VerificationState {
  isVerifying: boolean;
  isVerified: boolean;
  status?: string;
  isDrive?: boolean;
  previewUrl?: string;
  error?: string;
}

export function DeliverableArtifactsInput({
  deliverableUrl,
  onChangeUrl,
  artifactTitle,
  onChangeTitle,
}: {
  deliverableUrl: string;
  onChangeUrl: (val: string) => void;
  artifactTitle: string;
  onChangeTitle: (val: string) => void;
}) {
  const [verification, setVerification] = useState<VerificationState>({
    isVerifying: false,
    isVerified: false,
  });

  async function handleVerify(urlToVerify: string) {
    if (!urlToVerify || !urlToVerify.trim()) {
      setVerification({ isVerifying: false, isVerified: false });
      return;
    }

    setVerification({ isVerifying: true, isVerified: false });
    try {
      const res = await fetch("/api/artifacts/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToVerify.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.data) {
        setVerification({
          isVerifying: false,
          isVerified: data.data.ok,
          status: data.data.status,
          isDrive: data.data.isDrive,
          error: data.data.error,
        });
      } else {
        setVerification({
          isVerifying: false,
          isVerified: false,
          error: data.error || "URL could not be verified",
        });
      }
    } catch {
      setVerification({
        isVerifying: false,
        isVerified: false,
        error: "Verification request failed",
      });
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-hover bg-bg p-3">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-medium text-ink flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 text-teal" />
          <span>Deliverable URL / Asset Link</span>
        </label>
        {verification.isVerifying ? (
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <Loader2 className="h-3 w-3 animate-spin text-teal" /> Verifying link...
          </span>
        ) : verification.isVerified ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald">
            <CheckCircle className="h-3 w-3" /> Verified Link ✓
          </span>
        ) : verification.error ? (
          <span className="flex items-center gap-1 text-[11px] text-crimson">
            <AlertTriangle className="h-3 w-3" /> {verification.error}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="url"
          value={deliverableUrl}
          onChange={(e) => {
            onChangeUrl(e.target.value);
            setVerification({ isVerifying: false, isVerified: false });
          }}
          onBlur={() => handleVerify(deliverableUrl)}
          placeholder="https://drive.google.com/..., Figma, GitHub, or live URL"
          className="flex-1 rounded-md border border-hover bg-raised px-3 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
        />
        <button
          type="button"
          onClick={() => handleVerify(deliverableUrl)}
          disabled={!deliverableUrl.trim() || verification.isVerifying}
          className="rounded border border-hover bg-raised px-2.5 py-1.5 text-[11px] font-medium text-muted hover:bg-hover hover:text-ink disabled:opacity-40 transition"
        >
          Check
        </button>
      </div>

      {deliverableUrl.trim() && (
        <input
          type="text"
          value={artifactTitle}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="Deliverable title (e.g., Final Figma Deck, SEO Audit Sheet, PR Link)"
          className="w-full rounded-md border border-hover bg-raised px-3 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
        />
      )}

      {verification.isDrive && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-amber">
          <HardDrive className="h-3 w-3" />
          <span>Google Drive deliverable detected & configured for preview</span>
        </div>
      )}
    </div>
  );
}
