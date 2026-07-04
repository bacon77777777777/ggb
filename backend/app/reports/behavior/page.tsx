'use client'

import { AdminLayout, PageCard } from '@/components'
import { useState, useEffect, useCallback, useRef } from 'react'

type Range = 'today' | 'yesterday' | '7d' | '30d'

interface ProductView { product_id: number; product_name: string; count: number }
interface ButtonClick { event_type: string; label: string; count: number }
interface PageDwell { path: string; product_name: string | null; avg_seconds: number; sample_count: number }
interface Insight { level: 'warn' | 'info' | 'ok'; message: string }

interface BehaviorData {
  meta: { range: string; total_events: number }
  product_views: ProductView[]
  button_clicks: ButtonClick[]
  page_dwells: PageDwell[]
  insights: Insight[]
}

type SortDir = 'desc' | 'asc'

function formatSeconds(s: number) {
  if (s < 60) return `${s} 秒`
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
}

function SortBtn({ dir, onToggle }: { dir: SortDir; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
      title={dir === 'desc' ? '由高到低（點擊切換）' : '由低到高（點擊切換）'}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 2L4 6h6L7 2z" fill={dir === 'asc' ? 'currentColor' : '#D1D5DB'} />
        <path d="M7 12L4 8h6l-3 4z" fill={dir === 'desc' ? 'currentColor' : '#D1D5DB'} />
      </svg>
    </button>
  )
}

function ListCard<T extends Record<string, unknown>>({
  title,
  rows,
  cols,
  sortKey,
  sortDir,
  onSort,
  emptyMsg = '尚無資料',
}: {
  title: string
  rows: T[]
  cols: { key: keyof T; label: string; sortable?: boolean; render?: (v: T) => React.ReactNode }[]
  sortKey: keyof T
  sortDir: SortDir
  onSort: (key: keyof T) => void
  emptyMsg?: string
}) {
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] as number
    const bv = b[sortKey] as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-4">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">{title}</h3>
      {sorted.length === 0 ? (
        <p className="text-xs text-neutral-400 py-6 text-center">{emptyMsg}</p>
      ) : (
        <div>
          {/* Header */}
          <div className="flex items-center pb-1.5 border-b border-neutral-100 dark:border-neutral-800">
            {cols.map(col => (
              <div
                key={String(col.key)}
                className={`flex items-center gap-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide ${
                  col.key === cols[0].key ? 'flex-1 min-w-0' : 'w-24 justify-end'
                }`}
              >
                {col.label}
                {col.sortable && (
                  <SortBtn dir={sortKey === col.key ? sortDir : 'desc'} onToggle={() => onSort(col.key)} />
                )}
              </div>
            ))}
          </div>
          {/* Rows */}
          <div className="space-y-0">
            {sorted.map((row, i) => (
              <div key={i} className="flex items-center py-1.5 border-b border-neutral-50 dark:border-neutral-800/50 last:border-0">
                {cols.map(col => (
                  <div
                    key={String(col.key)}
                    className={`text-xs ${
                      col.key === cols[0].key
                        ? 'flex-1 min-w-0 font-medium text-neutral-800 dark:text-neutral-200 truncate pr-3'
                        : 'w-24 text-right font-semibold text-neutral-900 dark:text-white'
                    }`}
                  >
                    {col.render ? col.render(row) : String(row[col.key] ?? '-')}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function exportCSV(data: BehaviorData) {
  const lines: string[] = []

  lines.push('=== 商品詳情進入次數 ===')
  lines.push('商品ID,商品名稱,進入次數')
  for (const r of data.product_views) lines.push(`${r.product_id},"${r.product_name}",${r.count}`)

  lines.push('')
  lines.push('=== 按鈕點擊次數 ===')
  lines.push('事件類型,按鈕名稱,點擊次數')
  for (const r of data.button_clicks) lines.push(`${r.event_type},"${r.label}",${r.count}`)

  lines.push('')
  lines.push('=== 頁面停留時間 ===')
  lines.push('路徑,商品名稱,平均停留(秒),樣本數')
  for (const r of data.page_dwells) lines.push(`${r.path},"${r.product_name ?? ''}",${r.avg_seconds},${r.sample_count}`)

  const bom = '﻿'
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `behavior_${data.meta.range}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const RANGE_LABEL: Record<Range, string> = { today: '今日', yesterday: '昨日', '7d': '近 7 天', '30d': '近 30 天' }

export default function BehaviorPage() {
  const [range, setRange] = useState<Range>('today')
  const [data, setData] = useState<BehaviorData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // sort states
  const [pvSort, setPvSort] = useState<SortDir>('desc')
  const [bcSort, setBcSort] = useState<SortDir>('desc')
  const [pdSort, setPdSort] = useState<SortDir>('desc')
  const [pdSortKey, setPdSortKey] = useState<'avg_seconds' | 'sample_count'>('sample_count')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/behavior?range=${range}`)
      const json = await res.json()
      if (!json.error) {
        setData(json)
        setLastUpdated(new Date())
      }
    } catch { /* ignore */ } finally {
      setIsLoading(false)
    }
  }, [range])

  useEffect(() => {
    load(true)
    intervalRef.current = setInterval(() => load(false), 10000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  return (
    <AdminLayout pageTitle="點擊分析" breadcrumbs={[{ label: '點擊分析', href: '/reports/behavior' }]}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {(Object.keys(RANGE_LABEL) as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                range === r
                  ? 'bg-primary text-white'
                  : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-primary/50'
              }`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-neutral-400">
              更新於 {lastUpdated.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              　每 10 秒自動刷新
            </span>
          )}
          {data && (
            <button
              onClick={() => exportCSV(data)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-primary/50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              匯出 CSV
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-neutral-400 text-sm">載入中...</div>
      ) : !data ? (
        <div className="py-20 text-center text-neutral-400 text-sm">載入失敗</div>
      ) : (
        <div className="space-y-6">
          {/* Summary strip */}
          <div className="flex items-center gap-4 text-xs text-neutral-400 px-1">
            <span>總事件 <strong className="text-neutral-700 dark:text-neutral-200">{data.meta.total_events.toLocaleString()}</strong></span>
            <span>商品瀏覽 <strong className="text-neutral-700 dark:text-neutral-200">{data.product_views.reduce((s, r) => s + r.count, 0).toLocaleString()}</strong></span>
            <span>按鈕點擊 <strong className="text-neutral-700 dark:text-neutral-200">{data.button_clicks.reduce((s, r) => s + r.count, 0).toLocaleString()}</strong></span>
          </div>

          {/* Row 1: product views + button clicks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ListCard
              title="商品詳情頁進入次數"
              rows={data.product_views as unknown as Record<string, unknown>[]}
              cols={[
                {
                  key: 'product_name' as never,
                  label: '商品名稱',
                  render: (r) => {
                    const row = r as unknown as ProductView
                    return (
                      <span className="truncate">
                        <span className="text-neutral-400 mr-1.5">#{row.product_id}</span>
                        {row.product_name}
                      </span>
                    )
                  },
                },
                { key: 'count' as never, label: '進入次數', sortable: true },
              ]}
              sortKey={'count' as never}
              sortDir={pvSort}
              onSort={() => setPvSort(d => d === 'desc' ? 'asc' : 'desc')}
              emptyMsg="尚無商品瀏覽資料"
            />

            <ListCard
              title="按鈕點擊次數"
              rows={data.button_clicks as unknown as Record<string, unknown>[]}
              cols={[
                { key: 'label' as never, label: '按鈕名稱' },
                { key: 'count' as never, label: '點擊次數', sortable: true },
              ]}
              sortKey={'count' as never}
              sortDir={bcSort}
              onSort={() => setBcSort(d => d === 'desc' ? 'asc' : 'desc')}
              emptyMsg="尚無點擊資料"
            />
          </div>

          {/* Row 2: page dwell + insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Page dwell */}
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">頁面停留時間</h3>
              </div>
              {data.page_dwells.length === 0 ? (
                <p className="text-xs text-neutral-400 py-6 text-center">尚無停留時間資料</p>
              ) : (
                <div>
                  <div className="flex items-center pb-1.5 border-b border-neutral-100 dark:border-neutral-800">
                    <div className="flex-1 min-w-0 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">頁面路徑</div>
                    <div
                      className="w-24 text-right flex items-center justify-end gap-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide cursor-pointer hover:text-neutral-600"
                      onClick={() => {
                        if (pdSortKey === 'avg_seconds') setPdSort(d => d === 'desc' ? 'asc' : 'desc')
                        else { setPdSortKey('avg_seconds'); setPdSort('desc') }
                      }}
                    >
                      平均停留
                      <SortBtn dir={pdSortKey === 'avg_seconds' ? pdSort : 'desc'} onToggle={() => {
                        if (pdSortKey === 'avg_seconds') setPdSort(d => d === 'desc' ? 'asc' : 'desc')
                        else { setPdSortKey('avg_seconds'); setPdSort('desc') }
                      }} />
                    </div>
                    <div
                      className="w-16 text-right flex items-center justify-end gap-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide cursor-pointer hover:text-neutral-600"
                      onClick={() => {
                        if (pdSortKey === 'sample_count') setPdSort(d => d === 'desc' ? 'asc' : 'desc')
                        else { setPdSortKey('sample_count'); setPdSort('desc') }
                      }}
                    >
                      樣本
                      <SortBtn dir={pdSortKey === 'sample_count' ? pdSort : 'desc'} onToggle={() => {
                        if (pdSortKey === 'sample_count') setPdSort(d => d === 'desc' ? 'asc' : 'desc')
                        else { setPdSortKey('sample_count'); setPdSort('desc') }
                      }} />
                    </div>
                  </div>
                  <div className="space-y-0">
                    {[...data.page_dwells]
                      .sort((a, b) => pdSort === 'desc' ? b[pdSortKey] - a[pdSortKey] : a[pdSortKey] - b[pdSortKey])
                      .map((r, i) => (
                        <div key={i} className="flex items-center py-1.5 border-b border-neutral-50 dark:border-neutral-800/50 last:border-0">
                          <div className="flex-1 min-w-0 pr-3">
                            <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate font-mono">{r.path}</p>
                            {r.product_name && (
                              <p className="text-[11px] text-neutral-400 truncate">{r.product_name}</p>
                            )}
                          </div>
                          <div className="w-24 text-right text-xs font-semibold text-primary">{formatSeconds(r.avg_seconds)}</div>
                          <div className="w-16 text-right text-xs text-neutral-400">{r.sample_count}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Insights */}
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-4">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">自動分析建議</h3>
              {data.insights.length === 0 ? (
                <p className="text-xs text-neutral-400 py-6 text-center">資料量尚不足以產生建議</p>
              ) : (
                <div className="space-y-2">
                  {data.insights.map((ins, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs ${
                        ins.level === 'warn'
                          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-100 dark:border-amber-900'
                          : ins.level === 'ok'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900'
                          : 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-900'
                      }`}
                    >
                      <span className="mt-px flex-shrink-0 font-bold">
                        {ins.level === 'warn' ? '⚠' : ins.level === 'ok' ? '✓' : 'ℹ'}
                      </span>
                      <span className="leading-relaxed">{ins.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
