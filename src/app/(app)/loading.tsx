import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <div className="flex h-[calc(100vh-60px)] w-full items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 rounded-[10px] border border-edge bg-surface px-6 py-5 shadow-popover">
        <Loader2 className="h-6 w-6 animate-spin text-teal" />
        <div className="flex flex-col items-center gap-1">
          <div className="text-[13px] font-medium text-ink">Loading view...</div>
          <div className="font-mono text-[11px] text-muted">Fetching latest workspace data</div>
        </div>
      </div>
    </div>
  );
}
