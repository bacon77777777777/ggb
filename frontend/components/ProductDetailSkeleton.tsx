import { Skeleton } from "@/components/ui/Skeleton";

export default function ProductDetailSkeleton() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20 md:pb-12">
      <div className="max-w-7xl mx-auto px-2 py-2 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-6 items-start">
          {/* Left Column: Product Card (Sticky) */}
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <div className="bg-white dark:bg-neutral-900 rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              {/* Image Section */}
              <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-800">
                <Skeleton className="w-full h-full" />
              </div>
              
              {/* Content Section */}
              <div className="p-3 sm:p-6 space-y-2 sm:space-y-5">
                <Skeleton className="h-8 w-3/4" />
                
                <div className="hidden lg:flex items-end justify-between gap-2 pb-5 border-b border-neutral-50 dark:border-neutral-800">
                  <div className="flex items-baseline gap-2">
                    <Skeleton className="w-5 h-5 rounded-full" />
                    <Skeleton className="h-10 w-24" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>

                <div className="pt-2 hidden lg:block">
                  <Skeleton className="w-full h-[44px] rounded-xl" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Odds, Fairness, Info */}
          <div className="lg:col-span-8 space-y-2 sm:space-y-5">
            {/* Store Odds Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="p-2 sm:p-4 border-b border-neutral-50 dark:border-neutral-800">
                <Skeleton className="h-6 w-24" />
              </div>
              
              <div className="p-4 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-10 h-6 rounded-lg" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            </div>

            {/* Fairness Verification Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 sm:p-6 space-y-3 sm:space-y-6">
              <div className="flex items-center gap-3 pb-3 sm:pb-5 border-b border-neutral-50 dark:border-neutral-800">
                <Skeleton className="w-12 h-12 rounded-2xl" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                 <Skeleton className="h-20 w-full rounded-2xl" />
                 <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
