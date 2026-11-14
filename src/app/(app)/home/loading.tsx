export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4" aria-busy="true" aria-label="Loading Home">
      <div className="h-8 w-56 animate-pulse rounded-md bg-raised" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border border-edge bg-surface" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-lg border border-edge bg-surface" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg border border-edge bg-surface" />
        ))}
      </div>
    </div>
  );
}
