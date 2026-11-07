// Copied from ManuQueue's members loading.tsx

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-zinc-100 px-4 py-3 dark:border-white/5">
      <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <div className="h-5 w-20 rounded-full bg-zinc-200 dark:bg-zinc-700" />
    </div>
  );
}

export function MembersLoading() {
  return (
    <div className="mx-auto min-w-0 max-w-[95vw] px-4 py-6 xl:max-w-7xl">
      {/* Header */}
      <div className="mb-6 animate-pulse space-y-2">
        <div className="h-6 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-4 w-56 rounded bg-zinc-200 dark:bg-zinc-700" />
      </div>

      {/* Table skeleton */}
      <div className="animate-pulse rounded-xl border border-zinc-200 bg-white/95 shadow-sm dark:border-white/10 dark:bg-white/5">
        {/* Table header */}
        <div className="flex gap-4 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
          <div className="h-4 w-8 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="flex-1" />
          <div className="h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>

        {/* Rows */}
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
