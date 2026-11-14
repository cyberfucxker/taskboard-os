"use client";

import { openTask } from "@/lib/task-drawer";

import React, { useState } from "react";
import { CalendarTimelineView } from "@/components/calendar/CalendarTimelineView";
import { ScheduleMeetingModal } from "@/components/meetings/ScheduleMeetingModal";
import { useRouter } from "next/navigation";

export default function CalendarPage() {
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      <CalendarTimelineView
        onScheduleMeetingClick={() => setIsMeetingModalOpen(true)}
        onSelectTask={(id) => {
          if (id) router.push(`/tasks?task=${id}`);
        }}
      />

      <ScheduleMeetingModal
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
      />
    </div>
  );
}
