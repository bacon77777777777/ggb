import { Skeleton } from "@/components/ui/Skeleton"

export default function ProductCardSkeleton() {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
      {/* Image Container */}
      <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-800 rounded-t-2xl">
        <Skeleton className="w-full h-full" />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-2">
        <div className="mb-1">
          <Skeleton className="h-4 w-12 rounded-md" />
        </div>
        
        <Skeleton className="h-5 w-full mb-1" />
        <Skeleton className="h-5 w-2/3 mb-2" />
        
        <div className="mt-auto pt-2 border-t border-neutral-50 dark:border-neutral-800">
          <div className="flex items-end justify-between gap-1">
            <div className="flex items-center gap-1">
              <Skeleton className="w-3.5 h-3.5 rounded-full" />
              <Skeleton className="h-5 w-12" />
            </div>

            <div className="flex flex-col items-end gap-1">
              <Skeleton className="h-1 w-12 rounded-full" />
              <Skeleton className="h-3 w-8" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
