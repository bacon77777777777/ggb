'use client'

import { Fragment, ReactNode, useMemo, useState } from 'react'
import PageCard from './PageCard'
import SearchToolbar from './SearchToolbar'
import FilterTags from './FilterTags'
import SortableTableHeader from './SortableTableHeader'
import { TableSkeleton } from './ui/TableSkeleton'
import { useTablePrefs } from '@/hooks/useTablePrefs'

/**
 * ListTableCard —— 後台列表頁的定版樣板（老闆 2026-08-09 定案）
 *
 * 「SearchToolbar＋商品管理同款密度表格」收成一個具名元件：
 * 單一 PageCard、工具列（新增＋搜尋＋篩選＋密度＋欄位開關）、
 * FilterTags、灰底表頭＋排序箭頭、密度記憶（useTablePrefs）、
 * sticky 操作欄、TableSkeleton 載入態。
 *
 * 以後要改後台列表的長相（列高、表頭、操作欄樣式…）改這裡一處，
 * 所有用它的頁面同步變 —— 頁面端只提供數據與欄位定義，不碰版型。
 *
 * 視覺基準：app/products/page.tsx（商品管理）。那頁因為有勾選、
 * 展開列、無限載入等重功能暫未搬進來；等功能補齊後它也會換用這裡。
 */

export interface ListColumn<T> {
  key: string
  label: string
  render: (row: T) => ReactNode
  /** 排序值。有給就會出現排序箭頭 */
  sortValue?: (row: T) => string | number
  /** td 追加 class（如 font-mono / text-right） */
  className?: string
  /** 操作欄：sticky 右緣＋左分隔線，且不進欄位開關（永遠顯示） */
  isActions?: boolean
}

interface FilterSelect {
  key: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

interface ListTableCardProps<T> {
  /** useTablePrefs 的記憶 key（每頁唯一，例：'categories'） */
  pageKey: string
  data: T[]
  columns: ListColumn<T>[]
  keyField: keyof T
  isLoading?: boolean
  emptyMessage?: string
  /** 預設排序欄（columns 的 key） */
  defaultSortField?: string
  defaultSortDirection?: 'asc' | 'desc'
  // 工具列
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  addButtonText?: string
  onAddClick?: () => void
  filters?: FilterSelect[]
  /** 額外的工具列按鈕（批量上架那類），放在新增鈕右側 */
  toolbarChildren?: ReactNode
  /** 匯出 CSV（報表頁用） */
  onExportCSV?: () => void
  /** 勾選＋批次操作（商品管理同款）：三個一起給才會出現勾選欄 */
  selectable?: boolean
  selectedIds?: Set<string | number>
  onSelectChange?: (ids: Set<string | number>) => void
  batchActions?: Array<{ label: string; onClick: () => void; variant?: 'primary' | 'danger' | 'secondary' }>
  /**
   * 展開列（商品管理／消費紀錄那種點一列看明細）。
   * 給了 renderExpanded 就會啟用：整列可點、最右加收合箭頭，
   * 展開內容用一個橫跨整列的 tr 呈現。展開狀態由頁面持有 ——
   * 有些頁面只允許展開一列，有些可以同時展開多列，交給頁面決定。
   */
  expandedIds?: Set<string | number>
  onExpandChange?: (ids: Set<string | number>) => void
  renderExpanded?: (row: T) => ReactNode
  /**
   * 置頂合計列（報表類用）。傳一個 render 函式，收到目前顯示中的欄位，
   * 自己吐 <td>；元件負責外框樣式與欄位對齊，排序時不會被打亂。
   */
  summaryRow?: (shownColumns: ListColumn<T>[]) => ReactNode
}

export default function ListTableCard<T>({
  pageKey,
  data,
  columns,
  keyField,
  isLoading = false,
  emptyMessage = '沒有找到符合條件的資料',
  defaultSortField = '',
  defaultSortDirection = 'asc',
  searchPlaceholder,
  searchValue,
  onSearchChange,
  addButtonText,
  onAddClick,
  filters = [],
  toolbarChildren,
  onExportCSV,
  selectable = false,
  selectedIds,
  onSelectChange,
  batchActions,
  expandedIds,
  onExpandChange,
  renderExpanded,
  summaryRow,
}: ListTableCardProps<T>) {
  const [sortField, setSortField] = useState(defaultSortField)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection)

  const defaultVisible = Object.fromEntries(columns.map(c => [c.key, true])) as Record<string, boolean>
  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } =
    useTablePrefs(pageKey, 'compact', defaultVisible)

  const densityClasses =
    tableDensity === 'normal' ? 'py-3 px-4'
    : tableDensity === 'comfortable' ? 'py-4 px-6'
    : 'py-2 px-2'

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sortField)
    if (!col?.sortValue) return data
    const sv = col.sortValue
    return [...data].sort((a, b) => {
      const av = sv(a), bv = sv(b)
      const cmp = typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv)
        : Number(av) - Number(bv)
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [data, columns, sortField, sortDirection])

  // 操作欄永遠顯示、不進欄位開關；其餘欄位吃記憶偏好
  const isVisible = (c: ListColumn<T>) => c.isActions || visibleColumns[c.key] !== false
  const shownColumns = columns.filter(isVisible)

  const activeFilters = filters.filter(f => f.value !== 'all')

  // 勾選（商品管理同款）：表頭全選只針對目前排序後可見的資料
  const withSelection = selectable && !!onSelectChange
  const allSelected = withSelection && sorted.length > 0 &&
    sorted.every(row => selectedIds?.has(row[keyField] as string | number))
  const toggleAll = (checked: boolean) => {
    if (!onSelectChange) return
    onSelectChange(checked ? new Set(sorted.map(row => row[keyField] as string | number)) : new Set())
  }
  // 展開列
  const withExpand = !!renderExpanded && !!onExpandChange
  const toggleExpand = (id: string | number) => {
    if (!onExpandChange) return
    const next = new Set(expandedIds ?? [])
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onExpandChange(next)
  }

  const toggleOne = (id: string | number) => {
    if (!onSelectChange) return
    const next = new Set(selectedIds ?? [])
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectChange(next)
  }
  const colCount = shownColumns.length + (withSelection ? 1 : 0) + (withExpand ? 1 : 0)

  return (
    <PageCard>
      <SearchToolbar
        searchPlaceholder={searchPlaceholder}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        showAddButton={!!addButtonText}
        addButtonText={addButtonText}
        onAddClick={onAddClick}
        showExportCSV={!!onExportCSV}
        onExportCSV={onExportCSV}
        showDensity={true}
        density={tableDensity}
        onDensityChange={setTableDensity}
        showColumnToggle={true}
        columns={columns.filter(c => !c.isActions).map(c => ({
          key: c.key, label: c.label, visible: visibleColumns[c.key] !== false,
        }))}
        onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
        showFilter={filters.length > 0}
        filterOptions={filters.map(f => ({
          key: f.key, label: f.label, type: 'select' as const,
          value: f.value, onChange: f.onChange, options: f.options,
        }))}
        children={toolbarChildren}
        selectedCount={withSelection ? (selectedIds?.size ?? 0) : undefined}
        batchActions={withSelection ? batchActions : undefined}
        onClearSelection={withSelection ? () => onSelectChange?.(new Set()) : undefined}
      />

      <FilterTags
        tags={activeFilters.map(f => ({
          key: f.key,
          label: f.label,
          value: f.options.find(o => o.value === f.value)?.label ?? f.value,
          color: 'primary' as const,
          onRemove: () => f.onChange('all'),
        }))}
        onClearAll={() => { activeFilters.forEach(f => f.onChange('all')); onSearchChange?.('') }}
      />

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr className="border-b border-neutral-200">
              {withSelection && (
                <th className={`${densityClasses} text-left w-10`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => toggleAll(e.target.checked)}
                    className="w-4 h-4 text-primary focus:ring-primary rounded"
                  />
                </th>
              )}
              {withExpand && <th className={`${densityClasses} w-8`} />}
              {shownColumns.map(c =>
                c.isActions ? (
                  <th key={c.key} className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 sticky right-0 bg-white z-20 border-l border-neutral-200 whitespace-nowrap`}>
                    {c.label}
                  </th>
                ) : c.sortValue ? (
                  <SortableTableHeader key={c.key} sortKey={c.key} currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    {c.label}
                  </SortableTableHeader>
                ) : (
                  <th key={c.key} className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>
                    {c.label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {!isLoading && summaryRow && sorted.length > 0 && (
              <tr className="border-b border-neutral-100 bg-neutral-50 font-semibold">
                {summaryRow(shownColumns)}
              </tr>
            )}
            {isLoading ? (
              <TableSkeleton rows={5} cols={colCount} />
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="text-center">
                  <div className="flex flex-col items-center justify-center py-24 text-neutral-400 text-sm gap-2">
                    <span>{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              sorted.map(row => {
                const rowId = row[keyField] as string | number
                const isExpanded = withExpand && (expandedIds?.has(rowId) ?? false)
                return (
                  <Fragment key={String(rowId)}>
                    <tr
                      className={`border-b border-neutral-100 transition-colors ${
                        isExpanded ? 'bg-neutral-50' : 'hover:bg-neutral-50/60'
                      } ${withExpand ? 'cursor-pointer' : ''}`}
                      onClick={withExpand ? () => toggleExpand(rowId) : undefined}
                    >
                      {withSelection && (
                        <td className={densityClasses} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds?.has(rowId) ?? false}
                            onChange={() => toggleOne(rowId)}
                            className="w-4 h-4 text-primary focus:ring-primary rounded"
                          />
                        </td>
                      )}
                      {withExpand && (
                        <td className={`${densityClasses} text-neutral-400`}>
                          <svg
                            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180 text-primary' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </td>
                      )}
                      {shownColumns.map(c => (
                        <td
                          key={c.key}
                          className={
                            c.isActions
                              ? `${densityClasses} sticky right-0 z-10 border-l border-neutral-200 whitespace-nowrap ${isExpanded ? 'bg-neutral-50' : 'bg-white'}`
                              : `${densityClasses} text-sm text-neutral-700 whitespace-nowrap ${c.className ?? ''}`
                          }
                          onClick={c.isActions ? e => e.stopPropagation() : undefined}
                        >
                          {c.render(row)}
                        </td>
                      ))}
                    </tr>
                    {isExpanded && (
                      <tr className="bg-neutral-50">
                        <td colSpan={colCount} className="px-6 pb-5 pt-4">
                          {renderExpanded!(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </PageCard>
  )
}

/**
 * 操作欄的文字連結規範：中性動作灰、編輯藍、刪除紅，順序固定。
 * 各頁引用這個而不是自己上色，顏色層級就不會再飄。
 */
export function RowAction({ tone = 'neutral', onClick, children }: {
  tone?: 'neutral' | 'primary' | 'danger'
  onClick: () => void
  children: ReactNode
}) {
  const cls =
    tone === 'primary' ? 'text-primary hover:text-primary'
    : tone === 'danger' ? 'text-red-500 hover:text-red-700'
    : 'text-neutral-600 hover:text-neutral-900'
  return (
    <button onClick={onClick} className={`${cls} text-sm font-medium`}>
      {children}
    </button>
  )
}
