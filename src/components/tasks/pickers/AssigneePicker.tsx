"use client";

import { PickerShell, type PickerShellProps } from "./PickerShell";
import { AssigneeMenu } from "./menus";

/** Click-to-reassign popover. `children` is the trigger button. */
export function AssigneePicker({
  value,
  employees,
  currentUserId,
  canAssign,
  offerTake,
  onChange,
  ...shell
}: {
  value: string | null;
  employees: { id: string; name: string }[];
  currentUserId?: string;
  canAssign: boolean;
  offerTake?: boolean;
  onChange: (employee: { id: string; name: string }) => void;
} & Omit<PickerShellProps, "body">) {
  return (
    <PickerShell
      {...shell}
      body={(close) => (
        <AssigneeMenu
          value={value}
          employees={employees}
          currentUserId={currentUserId}
          canAssign={canAssign}
          offerTake={offerTake}
          onSelect={(e) => {
            close();
            if (e.id !== value) onChange(e);
          }}
        />
      )}
    />
  );
}
