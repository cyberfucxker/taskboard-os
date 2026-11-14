"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Kbd } from "@/components/ui";
import { SHORTCUTS, modKey, type ShortcutDef } from "@/lib/shortcuts";

const GROUPS: ShortcutDef["group"][] = ["General", "Create", "Go to"];

/** Keyboard shortcut cheat-sheet (opened with ?). Rendered from the shortcuts registry. */
export function ShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[95] bg-black/50 tk-fade" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="tk-pop fixed left-1/2 top-1/2 z-[96] max-h-[85vh] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[10px] border border-edge bg-raised p-5 text-ink shadow-popover"
        >
          <div className="mb-3 flex items-center justify-between">
            <DialogPrimitive.Title className="text-[15px] font-medium">Keyboard shortcuts</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="space-y-4">
            {GROUPS.map((g) => (
              <section key={g}>
                <h3 className="mb-1 text-[11px] font-medium text-muted">{g}</h3>
                <ul className="divide-y divide-line">
                  {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                    <li key={s.id} className="flex h-9 items-center justify-between text-[13px]">
                      <span className="text-ink2">{s.label}</span>
                      <span className="flex items-center gap-1 text-muted">
                        {s.keys.map((k, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <span className="text-[11px]">then</span>}
                            <Kbd>{k === "mod" ? modKey() : k}</Kbd>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
