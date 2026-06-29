'use client'

import { useState } from 'react'

interface FilterOption {
  key: string
  label: string
  type: 'select' | 'date-range' | 'checkbox'
  options?: { value: string; label: string }[]
  value?: string | number | boolean
  onChange?: (value: string | number | boolean) => void
  // date-range 專用
  startDate?: string
  endDate?: string
  onStartDateChange?: (date: string) => void
  onEndDateChange?: (date: string) => void
  placeholder?: string
  // 自定義渲染
  render?: () => React.ReactNode
}

interface ColumnOption {
  key: string
  label: string
  visible: boolean
}

interface SearchToolbarProps {
  // 搜尋
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  
  // 密度調整
  showDensity?: boolean
  density?: 'compact' | 'normal' | 'comfortable'
  onDensityChange?: (density: 'compact' | 'normal' | 'comfortable') => void
  
  // 篩選
  showFilter?: boolean
  filterOptions?: FilterOption[]
  
  // 欄位顯示
  showColumnToggle?: boolean
  columns?: ColumnOption[]
  onColumnToggle?: (key: string, visible: boolean) => void
  
  // 新增按鈕
  showAddButton?: boolean
  addButtonText?: string
  onAddClick?: () => void
  
  // 匯出CSV
  showExportCSV?: boolean
  onExportCSV?: () => void
  
  // 批量操作
  selectedCount?: number
  batchActions?: Array<{
    label: string
    onClick: () => void
    variant?: 'primary' | 'danger' | 'secondary'
    count?: number
  }>
  onClearSelection?: () => void
  
  // 自定義內容
  children?: React.ReactNode
}

export default function SearchToolbar({
  searchPlaceholder = '搜尋...',
  searchValue = '',
  onSearchChange,
  showDensity = true,
  density = 'compact',
  onDensityChange,
  showFilter = true,
  filterOptions = [],
  showColumnToggle = true,
  columns = [],
  onColumnToggle,
  showAddButton = false,
  addButtonText = '+ 新增',
  onAddClick,
  showExportCSV = false,
  onExportCSV,
  children
}: SearchToolbarProps) {
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [showColumnPanel, setShowColumnPanel] = useState(false)

  const getDensityTitle = () => {
    switch (density) {
      case 'compact': return '緊湊'
      case 'normal': return '標準'
      case 'comfortable': return '寬鬆'
    }
  }

  const cycleDensity = () => {
    const densities: Array<'compact' | 'normal' | 'comfortable'> = ['compact', 'normal', 'comfortable']
    const currentIndex = densities.indexOf(density)
    onDensityChange?.(densities[(currentIndex + 1) % 3])
  }

  const hasActiveFilters = filterOptions.some(f => {
    if (f.type === 'select') return f.value && f.value !== 'all'
    if (f.type === 'date-range') return f.startDate || f.endDate
    if (f.type === 'checkbox') return f.value === true
    return false
  })

  const hasHiddenColumns = columns.some(c => !c.visible)

  return (
    <div className="mb-4 flex items-center gap-4 flex-wrap">
      {/* 新增按鈕 */}
      {showAddButton && (
        <button
          onClick={onAddClick}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors whitespace-nowrap text-sm font-medium"
        >
          {addButtonText}
        </button>
      )}

      {/* 匯出CSV按鈕 */}
      {showExportCSV && (
        <button
          onClick={onExportCSV}
          className="px-4 py-2 bg-white dark:bg-neutral-900 border-2 border-neutral-200 dark:border-neutral-800 rounded-lg hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2 whitespace-nowrap text-neutral-700 dark:text-neutral-300"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          匯出CSV
        </button>
      )}

      {/* 搜尋框 */}
      <div className="flex-1 relative group min-w-[200px]">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <div className="relative">
          <div className="flex items-center">
            <div className="absolute left-3 text-neutral-400 group-hover:text-primary transition-colors duration-200 z-10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="w-full px-4 py-2.5 pl-10 pr-10 bg-white dark:bg-neutral-900 border-2 border-neutral-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200 text-sm placeholder:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm hover:shadow-md text-neutral-900 dark:text-white"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-all duration-200 hover:scale-110 active:scale-95 z-10"
                aria-label="清除"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 工具按鈕 */}
      <div className="flex items-center gap-1">
        {/* 密度調整 */}
        {showDensity && (
          <button
            onClick={cycleDensity}
            className="w-10 h-10 flex items-center justify-center rounded-lg border-2 transition-all duration-200 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-200"
            title={`密度調整 (${getDensityTitle()})`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* 篩選 */}
        {showFilter && filterOptions.length > 0 && (
          <div className="relative">
            <button
              onClick={() => {
                setShowFilterPanel(!showFilterPanel)
                setShowColumnPanel(false)
              }}
              className={`w-10 h-10 flex items-center justify-center rounded-lg border-2 transition-all duration-200 ${
                showFilterPanel || hasActiveFilters
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              title="篩選"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-neutral-900"></span>
              )}
            </button>

            {/* 篩選面板 */}
            {showFilterPanel && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 z-50 p-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-neutral-900 dark:text-white">篩選條件</h3>
                  <button 
                    onClick={() => setShowFilterPanel(false)}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {filterOptions.map(option => (
                    <div key={option.key}>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                        {option.label}
                      </label>
                      {option.type === 'select' && (
                        <select
                          value={String(option.value)}
                          onChange={(e) => option.onChange?.(e.target.value)}
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-neutral-900 dark:text-white"
                        >
                          {option.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                      {/* 其他類型暫略，需要時擴充 */}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 欄位顯示 */}
        {showColumnToggle && columns.length > 0 && (
          <div className="relative">
            <button
              onClick={() => {
                setShowColumnPanel(!showColumnPanel)
                setShowFilterPanel(false)
              }}
              className={`w-10 h-10 flex items-center justify-center rounded-lg border-2 transition-all duration-200 ${
                showColumnPanel || hasHiddenColumns
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              title="欄位顯示"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              {hasHiddenColumns && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-neutral-900"></span>
              )}
            </button>

            {/* 欄位面板 */}
            {showColumnPanel && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 z-50 p-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-neutral-900 dark:text-white">顯示欄位</h3>
                  <button 
                    onClick={() => setShowColumnPanel(false)}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {columns.map(col => (
                    <label key={col.key} className="flex items-center p-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={col.visible}
                        onChange={(e) => onColumnToggle?.(col.key, e.target.checked)}
                        className="w-4 h-4 text-primary rounded border-neutral-300 dark:border-neutral-600 focus:ring-primary"
                      />
                      <span className="ml-3 text-sm text-neutral-700 dark:text-neutral-300">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {children}
    </div>
  )
}