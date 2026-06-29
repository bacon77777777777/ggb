'use client'

import { useEffect, useRef, Fragment, ReactNode } from 'react'
import SortableTableHeader from './SortableTableHeader'

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  render?: (item: T, index: number) => ReactNode
  className?: string
  sticky?: boolean
  visible?: boolean
}

interface DataTableProps<T> {
  // 數據
  data: T[]
  columns: Column<T>[]
  keyField: keyof T
  
  // 排序
  sortField?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (field: string) => void
  
  // 選擇
  selectable?: boolean
  selectedIds?: Set<number | string>
  onSelectChange?: (ids: Set<number | string>) => void
  isSelectable?: (item: T) => boolean
  
  // 展開
  expandable?: boolean
  expandedIds?: Set<number | string>
  onExpandChange?: (ids: Set<number | string>) => void
  renderExpanded?: (item: T) => ReactNode
  
  // 行樣式
  rowClassName?: (item: T, index: number) => string
  highlightedId?: number | string | null
  highlightedRef?: React.RefObject<HTMLTableRowElement>
  
  // 密度
  density?: 'compact' | 'normal' | 'comfortable'
  
  // 無限滾動
  enableInfiniteScroll?: boolean
  displayCount?: number
  onLoadMore?: () => void
  isLoadingMore?: boolean
  totalCount?: number
  
  // 空狀態
  emptyMessage?: string
  
  // 可見欄位
  visibleColumns?: { [key: string]: boolean }
}

export default function DataTable<T extends { id: number | string }>({
  data,
  columns,
  keyField,
  sortField,
  sortDirection,
  onSort,
  selectable = false,
  selectedIds = new Set(),
  onSelectChange,
  isSelectable = () => true,
  expandable = false,
  expandedIds = new Set(),
  // onExpandChange,
  renderExpanded,
  rowClassName,
  highlightedId,
  highlightedRef,
  density = 'compact',
  enableInfiniteScroll = false,
  displayCount,
  onLoadMore,
  isLoadingMore = false,
  totalCount,
  emptyMessage = '沒有資料',
  visibleColumns
}: DataTableProps<T>) {
  const observerTarget = useRef<HTMLDivElement>(null)

  // 密度樣式
  const getDensityClasses = () => {
    switch (density) {
      case 'compact': return 'py-2 px-2'
      case 'normal': return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  // 無限滾動
  useEffect(() => {
    if (!enableInfiniteScroll || !onLoadMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    const currentTarget = observerTarget.current
    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [enableInfiniteScroll, onLoadMore, isLoadingMore])

  // 全選處理
  const handleSelectAll = (checked: boolean) => {
    if (!onSelectChange) return
    if (checked) {
      const selectableIds = data.filter(isSelectable).map(item => item[keyField] as number | string)
      onSelectChange(new Set(selectableIds))
    } else {
      onSelectChange(new Set())
    }
  }

  // 單選處理
  const handleSelectOne = (id: number | string) => {
    if (!onSelectChange) return
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    onSelectChange(newSelected)
  }

  // 展開處理
  // const handleToggleExpand = (id: number | string) => {
  //   if (!onExpandChange) return
  //   const newExpanded = new Set(expandedIds)
  //   if (newExpanded.has(id)) {
  //     newExpanded.delete(id)
  //   } else {
  //     newExpanded.add(id)
  //   }
  //   onExpandChange(newExpanded)
  // }

  // 過濾可見欄位
  const filteredColumns = columns.filter(col => {
    if (!visibleColumns) return col.visible !== false
    return visibleColumns[col.key] !== false && col.visible !== false
  })

  // 計算顯示數據
  const displayData = displayCount ? data.slice(0, displayCount) : data
  const hasMore = totalCount ? displayCount && displayCount < totalCount : false

  // 計算全選狀態
  const selectableItems = data.filter(isSelectable)
  const isAllSelected = selectableItems.length > 0 && 
    selectableItems.every(item => selectedIds.has(item[keyField] as number | string))

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            {selectable && (
              <th className={`text-left ${getDensityClasses()} text-sm font-semibold text-neutral-700 dark:text-neutral-300 w-12`}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-primary focus:ring-primary rounded"
                />
              </th>
            )}
            {filteredColumns.map((column) => {
              const stickyClass = column.sticky 
                ? 'sticky right-0 bg-white dark:bg-neutral-900 z-20 border-l border-neutral-200 dark:border-neutral-800' 
                : ''
              
              if (column.sortable && onSort) {
                return (
                  <SortableTableHeader
                    key={column.key}
                    sortKey={column.key}
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    className={`${getDensityClasses()} ${column.className || ''} ${stickyClass}`}
                  >
                    {column.label}
                  </SortableTableHeader>
                )
              }
              return (
                <th
                  key={column.key}
                  className={`text-left ${getDensityClasses()} text-sm font-semibold text-neutral-700 dark:text-neutral-300 ${column.className || ''} ${stickyClass}`}
                >
                  {column.label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {displayData.length > 0 ? (
            displayData.map((item, index) => {
              const id = item[keyField] as number | string
              const isSelected = selectedIds.has(id)
              const isExpanded = expandedIds.has(id)
              const isHighlighted = highlightedId === id
              
              return (
                <Fragment key={id}>
                  <tr 
                    ref={isHighlighted ? highlightedRef : undefined}
                    className={`
                      border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors
                      ${isSelected ? 'bg-primary/5' : ''}
                      ${isHighlighted ? 'bg-yellow-50 dark:bg-yellow-900/20 animate-pulse' : ''}
                      ${rowClassName ? rowClassName(item, index) : ''}
                    `}
                  >
                    {selectable && (
                      <td className={`${getDensityClasses()} w-12`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(id)}
                          disabled={!isSelectable(item)}
                          className="w-4 h-4 text-primary focus:ring-primary rounded disabled:opacity-50"
                        />
                      </td>
                    )}
                    {filteredColumns.map((column) => {
                      const stickyClass = column.sticky 
                        ? 'sticky right-0 bg-white dark:bg-neutral-900 z-20 border-l border-neutral-200 dark:border-neutral-800 group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800' 
                        : ''
                        
                      return (
                        <td 
                          key={column.key} 
                          className={`${getDensityClasses()} text-sm text-neutral-600 dark:text-neutral-400 ${column.className || ''} ${stickyClass}`}
                        >
                          {column.render ? column.render(item, index) : (item as Record<string, unknown>)[column.key] as ReactNode}
                        </td>
                      )
                    })}
                  </tr>
                  {expandable && isExpanded && renderExpanded && (
                    <tr className="bg-neutral-50/50 dark:bg-neutral-800/50">
                      <td colSpan={filteredColumns.length + (selectable ? 1 : 0)} className="p-0">
                        {renderExpanded(item)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          ) : (
            <tr>
              <td 
                colSpan={filteredColumns.length + (selectable ? 1 : 0)} 
                className="py-12 text-center text-neutral-500 dark:text-neutral-400"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      
      {/* 無限滾動觸發點 */}
      {enableInfiniteScroll && hasMore && (
        <div ref={observerTarget} className="py-4 text-center text-neutral-500 text-sm">
          {isLoadingMore ? '載入更多...' : '向下捲動載入更多'}
        </div>
      )}
    </div>
  )
}
