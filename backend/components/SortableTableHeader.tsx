'use client'

interface SortableTableHeaderProps {
  children: React.ReactNode
  sortKey?: string
  currentSortField?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (field: string) => void
  className?: string
}

export default function SortableTableHeader({
  children,
  sortKey,
  currentSortField,
  sortDirection,
  onSort,
  className = ''
}: SortableTableHeaderProps) {
  const isSortable = sortKey && onSort
  const isActive = currentSortField === sortKey

  const handleClick = () => {
    if (isSortable) {
      onSort(sortKey)
    }
  }

  // 如果 className 包含 text-right 或 text-center，則覆蓋默認的 text-left
  const textAlignClass = className.includes('text-right') || className.includes('text-center')
    ? ''
    : 'text-left'
  
  // 如果 className 包含 py- 或 px-，則不應用默認的 py-3 px-4
  const hasCustomPadding = className.includes('py-') || className.includes('px-')
  const defaultPadding = hasCustomPadding ? '' : 'py-3 px-4'
  
  return (
    <th
      className={`${textAlignClass} ${defaultPadding} text-sm font-semibold text-neutral-700 ${
        isSortable ? 'cursor-pointer hover:bg-neutral-50 select-none' : ''
      } ${className}`}
      onClick={handleClick}
    >
      <div className="flex items-center gap-2 whitespace-nowrap">
        {children}
        {isSortable && (
          <div className="flex flex-col flex-shrink-0">
            <svg
              className={`w-3 h-3 transition-colors ${
                isActive && sortDirection === 'asc'
                  ? 'text-primary'
                  : 'text-neutral-400'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
            <svg
              className={`w-3 h-3 -mt-1 transition-colors ${
                isActive && sortDirection === 'desc'
                  ? 'text-primary'
                  : 'text-neutral-400'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        )}
      </div>
    </th>
  )
}
