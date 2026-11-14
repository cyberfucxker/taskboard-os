"use client";

import { PickerShell, type PickerShellProps } from "./PickerShell";
import { StatusMenu } from "./menus";
import { allowedStatuses, type Status } from "./atoms";

/** Click-to-change status popover. `children` is the trigger button. */
export function StatusPicker({
  value,
  onChange,
  ...shell
}: {
  value: Status;
  onChange: (status: Status, reason?: string) => void;
} & Omit<PickerShellProps, "body">) {
  return (
    <PickerShell
      {...shell}
      body={(close) => (
        <StatusMenu
          value={value}
          allowed={allowedStatuses(value)}
          onSelect={(s, reason) => {
            close();
            if (s !== value) onChange(s, reason);
          }}
        />
      )}
    />
  );
}
