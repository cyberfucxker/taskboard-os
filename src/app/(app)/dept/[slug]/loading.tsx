import { StatsSkeleton, WidgetSkeleton } from "@/components/dept/ui";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-4 sm:px-6" aria-busy="true">
      <div className="h-4 w-40 animate-pulse rounded bg-raised" />
      <div className="mt-4"><StatsSkeleton /></div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <WidgetSkeleton />
        <WidgetSkeleton />
        <WidgetSkeleton />
        <WidgetSkeleton />
      </div>
    </div>
  );
}
