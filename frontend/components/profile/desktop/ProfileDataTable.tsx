'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ProfileColumn<T> = {
  key: string
  header: ReactNode
  className?: string
  cellClassName?: string
  render: (row: T) => ReactNode
}

export default function ProfileDataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isRowExpanded,
  renderExpanded,
  empty,
  className,
}: {
  columns: Array<ProfileColumn<T>>
  rows: T[]
  rowKey: (row: T, index: number) => string
  onRowClick?: (row: T) => void
  isRowExpanded?: (row: T) => boolean
  renderExpanded?: (row: T) => ReactNode
  empty?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('w-full overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800', className)}>
      <div className="w-full overflow-auto">
        <table className="min-w-full text-left">
          <thead className="bg-neutral-50 dark:bg-neutral-900/40 border-b border-neutral-200 dark:border-neutral-800">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn('px-3 py-2 text-[12px] font-black text-neutral-600 dark:text-neutral-300 whitespace-nowrap', c.className)}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-neutral-950">
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-10 text-center text-[13px] text-neutral-500 dark:text-neutral-400" colSpan={columns.length}>
                  {empty || '目前沒有資料'}
                </td>
              </tr>
            ) : (
              rows.flatMap((row, idx) => {
                const key = rowKey(row, idx)
                const expanded = Boolean(isRowExpanded?.(row))
                const expandedNode = expanded ? renderExpanded?.(row) : null

                const mainRow = (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-neutral-100 dark:border-neutral-900 last:border-b-0 hover:bg-neutral-50/70 dark:hover:bg-neutral-900/30 transition-colors',
                      onRowClick && 'cursor-pointer'
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn('px-3 py-2 text-[13px] text-neutral-900 dark:text-neutral-100 align-middle', c.cellClassName)}
                      >
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                )

                if (!expandedNode) return [mainRow]

                return [
                  mainRow,
                  <tr key={`${key}__expanded`} className="border-b border-neutral-100 dark:border-neutral-900 last:border-b-0">
                    <td colSpan={columns.length} className="px-3 py-3 bg-neutral-50/60 dark:bg-neutral-900/20">
                      {expandedNode}
                    </td>
                  </tr>,
                ]
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
