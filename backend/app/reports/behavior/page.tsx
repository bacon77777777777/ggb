'use client'

import { AdminLayout, PageCard, StatsCard } from '@/components'
import { useState, useEffect, useCallback } from 'react'

interface EventCount { event_type: string; count: number }
interface DauDay { date: string; dau: number }
interface ActiveHour { hour: number; count: number }
interface PageDwell { path: string; avg_seconds: number; sample_count: number }
interface TopProduct { product_id: number; name: string; views: number }
interface FunnelStep { step: string; count: number }
interface Insight { level: 'warn' | 'info' | 'ok'; message: string }

interface BehaviorData {
  meta: { days: number; total_events: number }
  event_counts: EventCount[]
  dau_by_day: DauDay[]
  active_hours: ActiveHour[]
  page_dwells: PageDwell[]
  top_products: TopProduct[]
  funnel: FunnelStep[]
  insights: Insight[]
}

const EVENT_LABEL: Record<string, string> = {
  page_view: '頁面瀏覽',
  page_exit: '離開頁面',
  scroll_depth: '捲動深度',
  product_view: '商品詳情',
  product_click: '商品點擊',
  draw: '轉蛋',
  draw_single: '單抽',
  draw_multi: '多抽',
  draw_preview: '推一下',
  draw_trial: '試試看',
  prize_reveal: '獎項揭曉',
  insufficient_balance: '餘額不足',
  topup_page_view: '進入儲值頁',
  topup_plan_select: '選擇儲值方案',
  topup_success: '儲值成功',
  warehouse_view: '倉庫瀏覽',
  tab_switch: 'Tab 切換',
  delivery_modal_open: '開啟配送',
  delivery_logistics_select: '選擇物流',
  delivery_success: '配送完成',
  delivery_abandon: '放棄配送',
  dismantle: '分解',
  list_to_market: '上架市集',
  search_query: '搜尋',
  banner_click: 'Banner 點擊',
  leaderboard_view: '排行榜瀏覽',
  winning_records_view: '開獎紀錄',
  error_draw_fail: '轉蛋失敗',
  error_delivery_fail: '配送失敗',
}

function formatSeconds(s: number) {
  if (s < 60) return `${s}秒`
  return `${Math.floor(s / 60)}分${s % 60}秒`
}

function Bar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right text-neutral-500">{value.toLocaleString()}</span>
    </div>
  )
}

export default function BehaviorPage() {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<BehaviorData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/behavior?days=${days}`)
      const json = await res.json()
      setData(json)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const totalEvents = data?.meta.total_events ?? 0
  const todayDau = data?.dau_by_day.at(-1)?.dau ?? 0
  const topEvent = data?.event_counts[0]
  const funnelTop = data?.funnel[0]?.count ?? 0

  return (
    <AdminLayout pageTitle="點擊分析" breadcrumbs={[{ label: '點擊分析', href: '/reports/behavior' }]}>
      {/* Header controls */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-neutral-500">追蹤用戶在前台的所有點擊、瀏覽與轉換行為</p>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                days === d
                  ? 'bg-primary text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {d} 天
            </button>
          ))}
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 hover:bg-neutral-200 transition-colors">
            ↺ 重整
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-neutral-400">載入中...</div>
      ) : !data ? (
        <div className="py-20 text-center text-neutral-400">載入失敗</div>
      ) : (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatsCard title="總事件數" value={totalEvents.toLocaleString()} subtitle={`近 ${days} 天`} />
            <StatsCard title="昨日活躍用戶" value={todayDau.toString()} subtitle="DAU" />
            <StatsCard title="最高頻事件" value={topEvent ? (EVENT_LABEL[topEvent.event_type] ?? topEvent.event_type) : '-'} subtitle={topEvent ? `${topEvent.count.toLocaleString()} 次` : ''} />
            <StatsCard title="商品瀏覽" value={(data.funnel[0]?.count ?? 0).toLocaleString()} subtitle={`轉蛋 ${data.funnel[1]?.count ?? 0} 次`} />
          </div>

          {/* Insights */}
          {data.insights.length > 0 && (
            <PageCard>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">💡 自動分析建議</h2>
              <div className="space-y-2">
                {data.insights.map((ins, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                      ins.level === 'warn' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300' :
                      ins.level === 'ok' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300' :
                      'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300'
                    }`}
                  >
                    <span className="mt-px flex-shrink-0">
                      {ins.level === 'warn' ? '⚠' : ins.level === 'ok' ? '✓' : 'ℹ'}
                    </span>
                    <span>{ins.message}</span>
                  </div>
                ))}
              </div>
            </PageCard>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Conversion funnel */}
            <PageCard>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">🔄 轉換漏斗</h2>
              <div className="space-y-3">
                {data.funnel.map((step, i) => {
                  const pct = funnelTop > 0 ? ((step.count / funnelTop) * 100).toFixed(1) : '0'
                  const dropPct = i > 0 && data.funnel[i - 1].count > 0
                    ? (((data.funnel[i - 1].count - step.count) / data.funnel[i - 1].count) * 100).toFixed(0)
                    : null
                  return (
                    <div key={step.step}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">{step.step}</span>
                        <div className="flex items-center gap-2">
                          {dropPct !== null && Number(dropPct) > 0 && (
                            <span className="text-red-400">↓{dropPct}%</span>
                          )}
                          <span className="text-neutral-500">{step.count.toLocaleString()} ({pct}%)</span>
                        </div>
                      </div>
                      <div className="bg-neutral-100 dark:bg-neutral-800 rounded-full h-6 overflow-hidden">
                        <div
                          className="h-6 rounded-full bg-gradient-to-r from-primary to-primary/70 flex items-center pl-2 transition-all"
                          style={{ width: `${Math.max(Number(pct), 2)}%` }}
                        >
                          {Number(pct) > 15 && <span className="text-white text-[10px] font-bold">{pct}%</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </PageCard>

            {/* DAU chart */}
            <PageCard>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">📈 每日活躍用戶（DAU）</h2>
              {data.dau_by_day.length === 0 ? (
                <p className="text-sm text-neutral-400 py-6 text-center">尚無資料</p>
              ) : (
                <div className="space-y-1.5">
                  {(() => {
                    const maxDau = Math.max(...data.dau_by_day.map(d => d.dau), 1)
                    return data.dau_by_day.slice(-14).map(d => (
                      <div key={d.date} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-neutral-400 flex-shrink-0">{d.date.slice(5)}</span>
                        <Bar value={d.dau} max={maxDau} color="bg-emerald-500" />
                        <span className="text-neutral-600 dark:text-neutral-400 w-8 flex-shrink-0">{d.dau}</span>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </PageCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Event counts */}
            <PageCard>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">🖱 各事件點擊次數</h2>
              {data.event_counts.length === 0 ? (
                <p className="text-sm text-neutral-400 py-6 text-center">尚無資料</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const maxCount = data.event_counts[0]?.count ?? 1
                    return data.event_counts.slice(0, 20).map(e => (
                      <div key={e.event_type} className="flex items-center gap-2 text-xs">
                        <span className="w-28 text-neutral-600 dark:text-neutral-400 flex-shrink-0 truncate">
                          {EVENT_LABEL[e.event_type] ?? e.event_type}
                        </span>
                        <Bar value={e.count} max={maxCount} />
                      </div>
                    ))
                  })()}
                </div>
              )}
            </PageCard>

            {/* Active hours */}
            <PageCard>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">🕐 活躍時段分布</h2>
              <div className="grid grid-cols-12 gap-0.5 items-end h-24">
                {(() => {
                  const maxH = Math.max(...data.active_hours.map(h => h.count), 1)
                  return data.active_hours.map(h => {
                    const pct = Math.round((h.count / maxH) * 100)
                    return (
                      <div key={h.hour} className="flex flex-col items-center gap-0.5" title={`${h.hour}:00 — ${h.count} 次`}>
                        <div
                          className="w-full rounded-sm bg-primary/80 transition-all"
                          style={{ height: `${Math.max(pct, 2)}%` }}
                        />
                        {h.hour % 6 === 0 && (
                          <span className="text-[9px] text-neutral-400">{h.hour}</span>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
              <p className="text-[10px] text-neutral-400 mt-2 text-center">每格代表 1 小時（0–23）</p>
            </PageCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Page dwell times */}
            <PageCard>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">⏱ 各頁面平均停留時間</h2>
              {data.page_dwells.length === 0 ? (
                <p className="text-sm text-neutral-400 py-6 text-center">尚無資料（需累積 page_exit 事件）</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-neutral-400 border-b border-neutral-100 dark:border-neutral-800">
                      <th className="text-left pb-1.5 font-medium">頁面路徑</th>
                      <th className="text-right pb-1.5 font-medium">平均停留</th>
                      <th className="text-right pb-1.5 font-medium">樣本</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
                    {data.page_dwells.map(p => (
                      <tr key={p.path}>
                        <td className="py-1.5 text-neutral-700 dark:text-neutral-300 font-mono truncate max-w-[180px]">{p.path}</td>
                        <td className="py-1.5 text-right font-medium text-primary">{formatSeconds(p.avg_seconds)}</td>
                        <td className="py-1.5 text-right text-neutral-400">{p.sample_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PageCard>

            {/* Top products */}
            <PageCard>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">🏆 熱門商品（依瀏覽次數）</h2>
              {data.top_products.length === 0 ? (
                <p className="text-sm text-neutral-400 py-6 text-center">尚無資料</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const maxViews = data.top_products[0]?.views ?? 1
                    return data.top_products.map((p, i) => (
                      <div key={p.product_id} className="flex items-center gap-2 text-xs">
                        <span className="w-4 text-neutral-400 flex-shrink-0 text-right">{i + 1}</span>
                        <span className="w-28 text-neutral-700 dark:text-neutral-300 flex-shrink-0 truncate">{p.name}</span>
                        <Bar value={p.views} max={maxViews} color="bg-amber-400" />
                      </div>
                    ))
                  })()}
                </div>
              )}
            </PageCard>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
