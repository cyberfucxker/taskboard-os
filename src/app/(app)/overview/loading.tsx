import { Card } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4 p-4">
      <div className="h-8 w-48 animate-pulse rounded bg-hover " />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4">
            <div className="h-20 animate-pulse rounded bg-hover " />
          </Card>
        ))}
      </div>
    </div>
  );
}