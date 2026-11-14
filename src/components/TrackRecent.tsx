"use client";

import { useEffect } from "react";
import { pushRecent, type RecentType } from "@/lib/useRecents";

/** Renders nothing; records this record in the viewer's Recents once per mount. */
export function TrackRecent({
  type,
  id,
  label,
  path,
}: {
  type: RecentType;
  id: string;
  label: string;
  path: string;
}) {
  useEffect(() => {
    pushRecent({ type, id, label, path });
  }, [type, id, label, path]);
  return null;
}
