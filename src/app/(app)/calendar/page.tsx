import { guardPage } from "@/lib/pages";
import { CalendarHub } from "@/components/calendar/CalendarHub";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await guardPage("Calendar");
  return <CalendarHub />;
}
