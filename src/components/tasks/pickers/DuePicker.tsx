"use client";

import { PickerShell, type PickerShellProps } from "./PickerShell";
import { DueMenu } from "./menus";

/** Click-to-set due date popover (quick dates + calendar). `children` is the trigger. */
export function DuePicker({
  value,
  onChange,
  ...shell
}: {
  value: string | null;
  /** ISO day YYYY-MM-DD, or null to clear. */
  onChange: (iso: string | null) => void;
} & Omit<PickerShellProps, "body">) {
  return (
    <PickerShell
      {...shell}
      body={(close) => (
        <DueMenu
          value={value}
          onSelect={(iso) => {
            close();
            if ((iso ?? null) !== (value ? value.slice(0, 10) : null)) onChange(iso);
          }}
        />
      )}
    />
  );
}
