import { Card } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4 p-4">
      <div className="h-8 w-48 animate-pulse rounded bg-hover dark:bg-hover" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="p-4">
            <div className="space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-hover dark:bg-hover" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-hover dark:bg-hover" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}