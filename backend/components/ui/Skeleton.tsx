/** 單行骨架 */
export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`h-4 bg-neutral-200 rounded animate-pulse ${className}`} />
}

/** 卡片/區塊載入骨架，替換散落各處的「載入中…」div */
export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6']
  return (
    <div className="space-y-3 py-6 px-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} className={widths[i % widths.length]} />
      ))}
    </div>
  )
}
