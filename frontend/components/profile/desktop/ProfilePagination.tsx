'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ProfilePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  className?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const clampedPage = Math.min(Math.max(1, page), totalPages)
  const start = total === 0 ? 0 : (clampedPage - 1) * pageSize + 1
  const end = Math.min(total, clampedPage * pageSize)

  const sizes = [10, 20, 50]

  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
        {start}-{end} / {total}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[12px] font-bold text-neutral-700 dark:text-neutral-200"
        >
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s} / 頁
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(clampedPage - 1)}
            disabled={clampedPage <= 1}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 disabled:opacity-50"
            aria-label="prev"
          >
            <ChevronLeft className="w-4 h-4 text-neutral-700 dark:text-neutral-200" />
          </button>
          <div className="min-w-[64px] text-center text-[12px] font-bold text-neutral-700 dark:text-neutral-200">
            {clampedPage} / {totalPages}
          </div>
          <button
            type="button"
            onClick={() => onPageChange(clampedPage + 1)}
            disabled={clampedPage >= totalPages}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 disabled:opacity-50"
            aria-label="next"
          >
            <ChevronRight className="w-4 h-4 text-neutral-700 dark:text-neutral-200" />
          </button>
        </div>
      </div>
    </div>
  )
}

