/** Skeleton shaped like the task page (header, title, body lines, property column). */
export default function Loading() {
  const bar = "animate-pulse rounded-md bg-hover";
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Loading task">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
        <div className={`${bar} h-4 w-40`} />
        <div className={`${bar} ml-auto h-4 w-20`} />
      </div>
      <div className="mx-auto grid w-full max-w-[1080px] gap-x-12 gap-y-6 px-4 py-6 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-6">
          <div className={`${bar} h-8 w-3/4`} />
          <div className="space-y-2">
            <div className={`${bar} h-4 w-full`} />
            <div className={`${bar} h-4 w-11/12`} />
            <div className={`${bar} h-4 w-2/3`} />
          </div>
          <div className={`${bar} h-24 w-full`} />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={`${bar} h-7 w-full`} />
          ))}
        </div>
      </div>
    </div>
  );
}
