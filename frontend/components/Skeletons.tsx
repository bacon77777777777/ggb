
import { Skeleton } from "@/components/ui/Skeleton";

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
