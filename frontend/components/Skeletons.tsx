
import { Skeleton } from "@/components/ui/Skeleton";

export function ChallengeSkeleton() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-28">
      <div className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-4 pt-[env(safe-area-inset-top)] py-4">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-3 w-36 mt-1.5" />
      </div>
      <div className="px-4 pt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden flex border border-neutral-100 dark:border-neutral-800">
            <Skeleton className="w-28 h-28 rounded-none flex-shrink-0" />
            <div className="flex-1 px-4 py-3 flex flex-col justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <div className="flex items-center justify-between mt-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-14" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChallengeDetailSkeleton() {
  return (
    <div className="min-h-screen pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-0 bg-neutral-50 dark:bg-neutral-950">
      <div className="block pb-8">
        <div className="bg-white dark:bg-neutral-900 shadow-sm border-b border-neutral-100 dark:border-neutral-800">
          <Skeleton className="w-full rounded-none" style={{ aspectRatio: '4/3' }} />
          <div className="px-4 py-4 space-y-2.5">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
              <Skeleton className="flex-1 h-12 rounded-xl" />
              <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
        <div className="max-w-[560px] mx-auto px-2 mt-2">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 p-3 space-y-2">
            <Skeleton className="h-5 w-32 mb-1" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                <Skeleton className="w-11 h-11 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MissionSkeleton() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-[400px] mx-auto px-4 pt-6 pb-28 space-y-4">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-xl" />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 bg-white dark:bg-neutral-900 rounded-2xl p-3 border border-neutral-100 dark:border-neutral-800">
            <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="w-16 h-8 rounded-full flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BannerSkeleton() {
  return (
    <div className="w-full aspect-[1200/298] overflow-hidden rounded-none sm:rounded-3xl">
      <Skeleton className="w-full h-full" />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>
      
      {/* List Items Skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border border-neutral-100 dark:border-neutral-800 rounded-2xl">
            <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
