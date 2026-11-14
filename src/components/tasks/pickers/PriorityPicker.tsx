"use client";

import { PickerShell, type PickerShellProps } from "./PickerShell";
import { PriorityMenu } from "./menus";
import type { Priority } from "./atoms";

/** Click-to-change priority popover. `children` is the trigger button. */
export function PriorityPicker({
  value,
  onChange,
  ...shell
}: {
  value: Priority;
  onChange: (p: Priority) => void;
} & Omit<PickerShellProps, "body">) {
  return (
    <PickerShell
      {...shell}
      body={(close) => (
        <PriorityMenu
          value={value}
          onSelect={(p) => {
            close();
            if (p !== value) onChange(p);
          }}
        />
      )}
    />
  );
}
