'use client'

import { useState, useEffect, useRef, Fragment, ReactNode } from 'react'
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
  onExpandChange,
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

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current)
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
  const handleToggleExpand = (id: number | string) => {
    if (!onExpandChange) return
    const newExpanded = new Set(expandedIds)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    onExpandChange(newExpanded)
  }

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
          <tr className="border-b border-neutral-200">
            {selectable && (
              <th className={`text-left ${getDensityClasses()} text-sm font-semibold text-neutral-700 w-12`}>
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
                ? 'sticky right-0 bg-white z-20 border-l border-neutral-200' 
                : ''
              
              if (column.sortable && onSort) {
                return (
                  <SortableTableHeader
                    key={column.key}
                    sortKey={column.key}
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    className={`${column.className || ''} ${stickyClass}`}
                  >
                    {column.label}
                  </SortableTableHeader>
                )
              }
              return (
                <th
                  key={column.key}
                  className={`text-left ${getDensityClasses()} text-sm font-semibold text-neutral-700 whitespace-nowrap ${column.className || ''} ${stickyClass}`}
                >
                  <span className="whitespace-nowrap">{column.label}</span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {displayData.length === 0 ? (
            <tr>
              <td
                colSpan={filteredColumns.length + (selectable ? 1 : 0)}
                className="py-12 text-center text-neutral-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            displayData.map((item, index) => {
              const itemId = item[keyField] as number | string
              const isHighlighted = highlightedId === itemId
              const isExpanded = expandedIds.has(itemId)
              const isItemSelectable = isSelectable(item)
              const customRowClass = rowClassName?.(item, index) || ''

              return (
                <Fragment key={itemId}>
                  <tr
                    ref={isHighlighted ? highlightedRef : null}
                    onClick={() => expandable && handleToggleExpand(itemId)}
                    className={`group border-b border-neutral-100 hover:bg-neutral-50 transition-all duration-300 ${
                      expandable ? 'cursor-pointer' : ''
                    } ${
                      isHighlighted
                        ? 'bg-yellow-200 border-yellow-400 border-2 shadow-lg ring-4 ring-yellow-300 ring-opacity-50 animate-highlight-flash'
                        : isExpanded
                          ? 'bg-neutral-50'
                          : ''
                    } ${customRowClass}`}
                  >
                    {selectable && (
                      <td className={getDensityClasses()} onClick={(e) => e.stopPropagation()}>
                        {isItemSelectable ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(itemId)}
                            onChange={() => handleSelectOne(itemId)}
                            className="w-4 h-4 text-primary focus:ring-primary rounded cursor-pointer"
                          />
                        ) : (
                          <span className="w-4 h-4 block"></span>
                        )}
                      </td>
                    )}
                    {filteredColumns.map((column) => {
                      const stickyClass = column.sticky 
                        ? `sticky right-0 z-20 border-l border-neutral-200 transition-colors duration-300 ${
                            isHighlighted
                              ? 'bg-yellow-200'
                              : isExpanded
                                ? 'bg-neutral-50'
                                : 'bg-white group-hover:bg-neutral-50'
                          }`
                        : ''
                      
                      return (
                        <td
                          key={column.key}
                          className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap ${column.className || ''} ${stickyClass}`}
                          onClick={column.sticky ? (e) => e.stopPropagation() : undefined}
                        >
                          <span className="whitespace-nowrap">{column.render ? column.render(item, index) : String((item as any)[column.key] || '')}</span>
                        </td>
                      )
                    })}
                  </tr>
                  {expandable && isExpanded && renderExpanded && (
                    <tr className="bg-neutral-50">
                      <td colSpan={filteredColumns.length + (selectable ? 1 : 0)} className="py-4 px-4">
                        {renderExpanded(item)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>

      {/* 無限滾動載入區 */}
      {enableInfiniteScroll && hasMore && (
        <div ref={observerTarget} className="py-8 text-center">
          {isLoadingMore ? (
            <div className="flex items-center justify-center gap-2 text-neutral-500">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span className="text-sm">載入中...</span>
            </div>
          ) : (
            <div className="h-4"></div>
          )}
        </div>
      )}
    </div>
  )
}
