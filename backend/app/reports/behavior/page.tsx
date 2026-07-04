'use client'

import { AdminLayout } from '@/components'
import DateRangePicker from '@/components/DateRangePicker'
import { useState, useEffect, useCallback, useRef } from 'react'

interface ProductView { product_id: number; product_name: string; count: number }
interface ButtonClick { event_type: string; label: string; count: number }
interface PageDwell { path: string; product_name: string | null; avg_seconds: number; sample_count: number }
interface Insight { level: 'warn' | 'info' | 'ok'; message: string }

interface BehaviorData {
  meta: { since: string; until: string; total_events: number }
  product_views: ProductView[]
  button_clicks: ButtonClick[]
  page_dwells: PageDwell[]
  insights: Insight[]
}

type SortDir = 'desc' | 'asc'

const PATH_LABEL: Record<string, string> = {
  '/': '首頁',
  '/profile': '我的倉庫',
  '/topup': '儲值頁',
  '/marketplace': '交易所',
  '/leaderboard': '排行榜',
  '/login': '登入頁',
}

function pathLabel(path: string): string {
  return PATH_LABEL[path] ?? path
}

function formatSeconds(s: number) {
  if (s < 60) return `${s} 秒`
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className="inline-block ml-0.5">
      <path d="M6 1.5L3.5 5h5L6 1.5z" fill={active && dir === 'asc' ? '#6366F1' : '#D1D5DB'} />
      <path d="M6 10.5L3.5 7h5L6 10.5z" fill={active && dir === 'desc' ? '#6366F1' : '#D1D5DB'} />
    </svg>
  )
}

function exportCSV(data: BehaviorData, start: string, end: string) {
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
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `behavior_${start}_${end}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function BehaviorPage() {
  const today = formatDate(new Date())
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [period, setPeriod] = useState('日')
  const [isCustomDate, setIsCustomDate] = useState(false)

  const [data, setData] = useState<BehaviorData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // sort states
  const [pvSort, setPvSort] = useState<SortDir>('desc')
  const [bcSort, setBcSort] = useState<SortDir>('desc')
  const [pdSortKey, setPdSortKey] = useState<'avg_seconds' | 'sample_count'>('sample_count')
  const [pdSort, setPdSort] = useState<SortDir>('desc')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const calcRange = useCallback((p: string) => {
    const now = new Date()
    const e = formatDate(now)
    let s = formatDate(now)
    if (p === '週') { const d = new Date(now); d.setDate(d.getDate() - 6); s = formatDate(d) }
    else if (p === '月') { const d = new Date(now); d.setDate(d.getDate() - 29); s = formatDate(d) }
    else if (p === '年') { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); s = formatDate(d) }
    return { s, e }
  }, [])

  const load = useCallback(async (spinner = false) => {
    if (!start || !end) return
    if (spinner) setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/behavior?start=${start}&end=${end}`)
      const json = await res.json()
      if (!json.error) { setData(json); setLastUpdated(new Date()) }
    } catch { /* ignore */ } finally { setIsLoading(false) }
  }, [start, end])

  // period button → update dates
  const handlePeriod = (p: string) => {
    setPeriod(p)
    setIsCustomDate(false)
    const { s, e } = calcRange(p)
    setStart(s)
    setEnd(e)
  }

  // manual date picker → mark custom
  const handleStartChange = (v: string) => { setStart(v); setIsCustomDate(true) }
  const handleEndChange = (v: string) => { setEnd(v); setIsCustomDate(true) }

  useEffect(() => {
    load(true)
    intervalRef.current = setInterval(() => load(false), 10000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  const toggleSort = (current: SortDir, set: (d: SortDir) => void) =>
    set(current === 'desc' ? 'asc' : 'desc')

  const CARD_H = 'h-[440px]'
  const LIST_H = 'h-[360px]'

  return (
    <AdminLayout pageTitle="點擊分析" breadcrumbs={[{ label: '點擊分析', href: '/reports/behavior' }]}>
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-3 mb-6 flex-wrap">
        <div className="w-64">
          <DateRangePicker
            startDate={start}
            endDate={end}
            onStartDateChange={handleStartChange}
            onEndDateChange={handleEndChange}
            placeholder="選擇日期範圍"
          />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-neutral-200 p-1">
          {['日', '週', '月', '年'].map(p => (
            <button
              key={p}
              onClick={() => handlePeriod(p)}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                !isCustomDate && period === p
                  ? 'bg-primary text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {data && (
          <button
            onClick={() => exportCSV(data, start, end)}
            className="px-4 py-2 bg-white border-2 border-neutral-200 rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2 whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            匯出 CSV
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-6 mb-4 px-1">
        <span className="text-sm font-semibold text-neutral-700">
          總事件 <span className="text-lg font-bold text-primary">{data?.meta.total_events.toLocaleString() ?? '—'}</span>
        </span>
        <span className="text-sm font-semibold text-neutral-700">
          商品瀏覽 <span className="text-lg font-bold text-primary">{data ? data.product_views.reduce((s, r) => s + r.count, 0).toLocaleString() : '—'}</span>
        </span>
        <span className="text-sm font-semibold text-neutral-700">
          按鈕點擊 <span className="text-lg font-bold text-primary">{data ? data.button_clicks.reduce((s, r) => s + r.count, 0).toLocaleString() : '—'}</span>
        </span>
        {lastUpdated && (
          <span className="ml-auto text-xs text-neutral-400">
            更新於 {lastUpdated.toLocaleTimeString('zh-TW')} · 每 10 秒自動刷新
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-neutral-400 text-sm">載入中...</div>
      ) : !data ? (
        <div className="py-20 text-center text-neutral-400 text-sm">載入失敗</div>
      ) : (
        <div className="space-y-6">
          {/* Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Product views */}
            <div className={`bg-white rounded-lg shadow-sm border border-neutral-200 p-4 ${CARD_H} flex flex-col`}>
              <h3 className="text-sm font-semibold text-neutral-900 mb-3 flex-shrink-0">
                商品頁面進入次數
                <span className="ml-1.5 text-xs font-normal text-neutral-400">({data.product_views.length} 筆商品)</span>
              </h3>
              <div className="flex items-center pb-1.5 border-b border-neutral-100 flex-shrink-0">
                <div className="flex-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">商品名稱</div>
                <div
                  className="w-24 text-right text-[11px] font-medium text-neutral-400 uppercase tracking-wide cursor-pointer hover:text-primary select-none"
                  onClick={() => toggleSort(pvSort, setPvSort)}
                >
                  進入次數 <SortIcon active dir={pvSort} />
                </div>
              </div>
              <div className={`${LIST_H} overflow-y-auto mt-1`}>
                {data.product_views.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-8 text-center">尚無商品瀏覽資料</p>
                ) : (
                  [...data.product_views]
                    .sort((a, b) => pvSort === 'desc' ? b.count - a.count : a.count - b.count)
                    .map((r, i) => (
                      <div key={i} className="flex items-center py-2 border-b border-neutral-50 last:border-0">
                        <div className="flex-1 min-w-0 pr-3">
                          <span className="text-xs text-neutral-400 mr-1.5">#{r.product_id}</span>
                          <span className="text-sm font-medium text-neutral-800 truncate">{r.product_name}</span>
                        </div>
                        <div className="w-24 text-right text-sm font-bold text-neutral-900">{r.count.toLocaleString()}</div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Button clicks */}
            <div className={`bg-white rounded-lg shadow-sm border border-neutral-200 p-4 ${CARD_H} flex flex-col`}>
              <h3 className="text-sm font-semibold text-neutral-900 mb-3 flex-shrink-0">按鈕點擊次數</h3>
              <div className="flex items-center pb-1.5 border-b border-neutral-100 flex-shrink-0">
                <div className="flex-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">按鈕名稱</div>
                <div
                  className="w-24 text-right text-[11px] font-medium text-neutral-400 uppercase tracking-wide cursor-pointer hover:text-primary select-none"
                  onClick={() => toggleSort(bcSort, setBcSort)}
                >
                  點擊次數 <SortIcon active dir={bcSort} />
                </div>
              </div>
              <div className={`${LIST_H} overflow-y-auto mt-1`}>
                {[...data.button_clicks]
                  .sort((a, b) => bcSort === 'desc' ? b.count - a.count : a.count - b.count)
                  .map((r, i) => (
                    <div key={i} className="flex items-center py-2 border-b border-neutral-50 last:border-0">
                      <div className="flex-1 min-w-0 pr-3 text-sm font-medium text-neutral-800">{r.label}</div>
                      <div className={`w-24 text-right text-sm font-bold ${r.count === 0 ? 'text-neutral-300' : 'text-neutral-900'}`}>
                        {r.count.toLocaleString()}
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Page dwell */}
            <div className={`bg-white rounded-lg shadow-sm border border-neutral-200 p-4 ${CARD_H} flex flex-col`}>
              <h3 className="text-sm font-semibold text-neutral-900 mb-3 flex-shrink-0">頁面停留時間</h3>
              <div className="flex items-center pb-1.5 border-b border-neutral-100 flex-shrink-0">
                <div className="flex-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">頁面路徑</div>
                <div
                  className="w-28 text-right text-[11px] font-medium text-neutral-400 uppercase tracking-wide cursor-pointer hover:text-primary select-none"
                  onClick={() => { if (pdSortKey === 'avg_seconds') toggleSort(pdSort, setPdSort); else { setPdSortKey('avg_seconds'); setPdSort('desc') } }}
                >
                  平均停留 <SortIcon active={pdSortKey === 'avg_seconds'} dir={pdSort} />
                </div>
                <div
                  className="w-16 text-right text-[11px] font-medium text-neutral-400 uppercase tracking-wide cursor-pointer hover:text-primary select-none"
                  onClick={() => { if (pdSortKey === 'sample_count') toggleSort(pdSort, setPdSort); else { setPdSortKey('sample_count'); setPdSort('desc') } }}
                >
                  樣本 <SortIcon active={pdSortKey === 'sample_count'} dir={pdSort} />
                </div>
              </div>
              <div className={`${LIST_H} overflow-y-auto mt-1`}>
                {data.page_dwells.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-8 text-center">尚無停留時間資料</p>
                ) : (
                  [...data.page_dwells]
                    .sort((a, b) => pdSort === 'desc' ? b[pdSortKey] - a[pdSortKey] : a[pdSortKey] - b[pdSortKey])
                    .map((r, i) => (
                      <div key={i} className="flex items-center py-2 border-b border-neutral-50 last:border-0">
                        <div className="flex-1 min-w-0 pr-3">
                          <p className="text-sm font-medium text-neutral-800 truncate">
                            {pathLabel(r.path)}
                            {r.product_name ? `（${r.product_name}）` : ''}
                          </p>
                          {!PATH_LABEL[r.path] && (
                            <p className="text-xs text-neutral-400 truncate mt-0.5 font-mono">{r.path}</p>
                          )}
                        </div>
                        <div className="w-28 text-right text-sm font-bold text-primary">{formatSeconds(r.avg_seconds)}</div>
                        <div className="w-16 text-right text-sm font-semibold text-neutral-600">{r.sample_count}</div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Insights */}
            <div className={`bg-white rounded-lg shadow-sm border border-neutral-200 p-4 ${CARD_H} flex flex-col`}>
              <h3 className="text-sm font-semibold text-neutral-900 mb-3 flex-shrink-0">自動分析建議</h3>
              <div className="flex-1 overflow-y-auto space-y-2">
                {data.insights.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-8 text-center">資料量尚不足以產生建議</p>
                ) : data.insights.map((ins, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      ins.level === 'warn'
                        ? 'bg-amber-50 text-amber-900 border border-amber-200'
                        : ins.level === 'ok'
                        ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                        : 'bg-blue-50 text-blue-900 border border-blue-200'
                    }`}
                  >
                    <span className="mt-0.5 flex-shrink-0">{ins.level === 'warn' ? '⚠' : ins.level === 'ok' ? '✓' : 'ℹ'}</span>
                    <span className="leading-relaxed">{ins.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
