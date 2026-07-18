interface TableSkeletonProps {
  rows?: number
  cols?: number
  colSpan?: number
}

/** 表格 loading 骨架，放在 <tbody> 裡 */
export function TableSkeleton({ rows = 6, cols = 5 }: TableSkeletonProps) {
  const colWidths = ['w-24', 'w-40', 'w-32', 'w-20', 'w-16']

  return (
    <>
      {Array.from({ length: rows }).map((_, ri) => (
        <tr key={ri} className="border-b border-neutral-100">
          {Array.from({ length: cols }).map((_, ci) => (
            <td key={ci} className="px-4 py-3">
              <div
                className={`h-4 bg-neutral-200 rounded animate-pulse ${colWidths[ci % colWidths.length]}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
