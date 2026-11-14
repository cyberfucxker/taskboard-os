"use client";

/**
 * PickerShell — Popover + trigger + content with optional controlled `open`
 * (so a keyboard shortcut like S/P/A/D can open the picker on a focused row).
 * `disabled` renders the trigger as-is with no popover, for read-only people.
 */
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PICKER_CONTENT_CLS } from "./menus";

export interface PickerShellProps {
  /** The trigger element (a button); it receives the popover's props. */
  children: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  /** Renders the menu body; call `close` after a choice to dismiss. */
  body: (close: () => void) => React.ReactNode;
}

export function PickerShell({ children, open: openProp, onOpenChange, disabled, align = "start", body }: PickerShellProps) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpen = (o: boolean) => {
    if (openProp === undefined) setInner(o);
    onOpenChange?.(o);
  };
  if (disabled) return children;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        collisionPadding={8}
        data-picker-content=""
        className={PICKER_CONTENT_CLS}
        style={{ zIndex: 90 }}
      >
        {body(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}
