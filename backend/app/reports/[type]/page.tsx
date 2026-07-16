'use client'

import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatDateTime } from '@/utils/dateFormat'

type ReportType = 'overview' | 'products' | 'recharge' | 'consumption' | 'behavior'

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  gacha: '轉蛋',
  ichiban: '一番賞',
  blindbox: '盒玩',
  card: '卡片',
  custom: '自訂',
}

const TYPE_META: Record<ReportType, { title: string }> = {
  overview:    { title: '轉換分析' },
  products:    { title: '消費明細' },
  recharge:    { title: '儲值明細' },
  consumption: { title: '消費明細' },
  behavior:    { title: '用戶行為' },
}

const STATUS_LABEL: Record<string, string> = {
  completed: '完成', pending: '待處理', failed: '失敗', refunded: '已退款',
  success: '成功', in_warehouse: '倉庫中', pending_delivery: '待配送',
  shipped: '已出貨', exchanged: '已兌換', dismantled: '已拆解',
  listing: '上架中', cancelled: '已取消',
}
const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-green-100 text-green-700', success: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700', pending_delivery: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700', refunded: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-100 text-red-700', shipped: 'bg-blue-100 text-primary',
  in_warehouse: 'bg-purple-100 text-purple-700', exchanged: 'bg-neutral-100 text-neutral-600',
  dismantled: 'bg-neutral-100 text-neutral-600', listing: 'bg-indigo-100 text-indigo-700',
}

function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿'
  const content = bom + [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── KPI 卡片 ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'text-neutral-900' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── 完抽進度條 ────────────────────────────────────────────────────────────
function CompletionBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-neutral-100 rounded-full h-1.5 min-w-[60px]">
        <div
          className={`h-1.5 rounded-full ${pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-neutral-300'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-neutral-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

export default function ReportPage() {
  const { type } = useParams<{ type: string }>()
  const reportType = (type as ReportType) || 'overview'
  const meta = TYPE_META[reportType] ?? TYPE_META.overview
  const router = useRouter()

  useEffect(() => {
    if (type === 'recharge') router.replace('/recharges')
  }, [type, router])

  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [loading, setLoading] = useState(false)

  // 各報表資料
  const [rechargeData, setRechargeData] = useState<any[]>([])
  const [consumptionData, setConsumptionData] = useState<any[]>([])
  const [overview, setOverview] = useState<any>(null)
  const [funnel, setFunnel] = useState<any>(null)
  const [dailyBreakdown, setDailyBreakdown] = useState<any[]>([])
  const [productsData, setProductsData] = useState<any[]>([])

  // 用戶行為
  const [behaviorData, setBehaviorData] = useState<{
    topSearches: { query: string; count: number }[]
    topSeries: { series: string; count: number }[]
    conversionRate: number
    clickTotal: number
    converted: number
    dailyActiveUsers: { date: string; count: number }[]
  } | null>(null)

  // 消費明細篩選
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCurrency, setFilterCurrency] = useState<'all' | 'tokens' | 'points'>('all')

  useEffect(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    setStart(`${y}-${m}-01`)
    setEnd(`${y}-${m}-${String(now.getDate()).padStart(2, '0')}`)
  }, [])

  useEffect(() => {
    if (reportType === 'products') {
      fetch('/api/admin/suppliers').then(r => r.json()).then(d => { if (Array.isArray(d)) setSuppliers(d) }).catch(() => {})
    }
  }, [reportType])

  const fetchData = useCallback(async () => {
    if (!start || !end) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab: reportType, start, end })
      if (reportType === 'products') {
        if (filterSupplier) params.set('supplierId', filterSupplier)
        if (filterType) params.set('type', filterType)
      }
      const res = await fetch(`/api/admin/reports?${params}`)
      if (!res.ok) throw new Error((await res.json()).error || '載入失敗')
      const json = await res.json()
      if (reportType === 'recharge') setRechargeData(json.data ?? [])
      else if (reportType === 'consumption') setConsumptionData(json.data ?? [])
      else if (reportType === 'overview') { setOverview(json.overview ?? null); setFunnel(json.funnel ?? null); setDailyBreakdown(json.dailyBreakdown ?? []) }
      else if (reportType === 'products') setProductsData(json.data ?? [])
      else if (reportType === 'behavior') setBehaviorData(json)
    } catch (e: any) { alert(e.message || '載入失敗') }
    finally { setLoading(false) }
  }, [reportType, start, end, filterSupplier, filterType])

  useEffect(() => { fetchData() }, [fetchData])

  // ── CSV 匯出 ──────────────────────────────────────────────────────────
  const handleExport = () => {
    if (reportType === 'recharge') {
      exportCSV(`儲值明細_${start}_${end}.csv`,
        ['日期', '訂單編號', '用戶姓名', 'Email', '金額(TWD)', '贈點', '付款方式', '狀態'],
        rechargeData.map(r => [formatDateTime(r.created_at), r.order_number ?? '', r.user?.name ?? '', r.user?.email ?? '', String(r.amount ?? 0), String(r.bonus ?? 0), r.payment_method ?? '', STATUS_LABEL[r.status] ?? r.status])
      )
    } else if (reportType === 'consumption') {
      exportCSV(`消費明細_${start}_${end}.csv`,
        ['日期', '用戶姓名', 'Email', '商品', '消耗代幣(G)', '獎品等級', '獎品名稱', '狀態'],
        consumptionData.map(d => [formatDateTime(d.created_at), d.user?.name ?? '', d.user?.email ?? '', d.product?.name ?? '', String(d.product?.price ?? 0), d.prize_level ?? '', d.prize_name ?? '', STATUS_LABEL[d.status] ?? d.status])
      )
    } else if (reportType === 'products') {
      exportCSV(`消費明細_${start}_${end}.csv`,
        ['商品名稱', '廠商', '種類', '抽獎次數', '消費金額G幣(G)', '消費積分(G)', '剩餘數量', '總數量', '完抽率(%)'],
        filteredProducts.map(p => [p.name, p.supplierName ?? '—', PRODUCT_TYPE_LABEL[p.type] || p.type || '—', String(p.drawCount), String(p.revenue - (p.pointsUsed ?? 0)), String(p.pointsUsed ?? 0), String(p.remaining), String(p.totalCount), String(p.completionRate)])
      )
    } else if (reportType === 'overview' && overview) {
      const rows: string[][] = [
        ['總儲值金額(TWD)', String(overview.totalRecharge)],
        ['儲值筆數', String(overview.totalRechargeCount)],
        ['平均儲值/人(TWD)', String(overview.avgPerPayer)],
        ['總消費代幣(G)', String(overview.totalTokenConsumed)],
        ['總抽獎次數', String(overview.totalDraws)],
        ['平均每次抽賞(G)', String(overview.avgTokenPerDraw)],
        ['期間新增會員', String(overview.newUserCount)],
        ['累積會員總數', String(overview.totalMembers)],
        ['付費用戶數', String(overview.uniquePayers)],
        ['折價券折損(TWD)', String(overview.couponDiscountFixed)],
        [], ['===每日明細===', ''],
        ['日期', '儲值金額(TWD)', '抽獎次數', '新用戶數'],
        ...dailyBreakdown.map(d => [d.date, String(d.recharge), String(d.draws), String(d.newUsers)]),
      ]
      exportCSV(`營運總覽_${start}_${end}.csv`, ['項目', '數值'], rows)
    }
  }

  const canExport =
    (reportType === 'recharge' && rechargeData.length > 0) ||
    (reportType === 'consumption' && consumptionData.length > 0) ||
    (reportType === 'products' && productsData.length > 0) ||
    (reportType === 'overview' && !!overview)

  // 種類列表（從商品資料推導）
  const productTypes = [...new Set(productsData.map(p => p.type).filter(Boolean))]

  // 幣種篩選後的商品列表
  const filteredProducts = productsData.filter(p => {
    if (filterCurrency === 'tokens') return (p.revenue - (p.pointsUsed ?? 0)) > 0 || p.drawCount === 0
    if (filterCurrency === 'points') return (p.pointsUsed ?? 0) > 0
    return true
  })

  return (
    <AdminLayout
      pageTitle={meta.title}
    >
      <div className="space-y-4">
        {/* 工具列 — 靠右對齊，同儀表板風格 */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {reportType === 'products' && (
            <>
              <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
                className="border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary/30">
                <option value="">所有廠商</option>
                {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary/30">
                <option value="">所有種類</option>
                {productTypes.map(t => <option key={t} value={t}>{PRODUCT_TYPE_LABEL[t] || t}</option>)}
              </select>
              <select value={filterCurrency} onChange={e => setFilterCurrency(e.target.value as 'all' | 'tokens' | 'points')}
                className="border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary/30">
                <option value="all">全幣種</option>
                <option value="tokens">代幣</option>
                <option value="points">積分</option>
              </select>
            </>
          )}
          <DateRangePicker startDate={start} endDate={end} onStartDateChange={setStart} onEndDateChange={setEnd} placeholder="選擇日期範圍" />
          {canExport && (
            <button onClick={handleExport}
              className="px-4 py-2 bg-white border-2 border-neutral-200 rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2 whitespace-nowrap">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              匯出 CSV
            </button>
          )}
        </div>

        {/* ── 營運總覽 ── */}
        {reportType === 'overview' && (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-lg border border-neutral-200 py-20 text-center text-neutral-400 text-sm">載入中…</div>
            ) : !overview ? (
              <div className="bg-white rounded-lg border border-neutral-200 py-20 text-center text-neutral-400 text-sm">無資料</div>
            ) : (
              <>
                {/* 摘要數據（儀表板未重複的） */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="平均每次抽賞" value={`${overview.avgTokenPerDraw.toLocaleString()} G`} sub="消費代幣 / 次" color="text-green-600" />
                  <KpiCard label="折價券折損" value={`NT$ ${overview.couponDiscountFixed.toLocaleString()}`} sub={overview.couponDiscountPercentageCount > 0 ? `另有 ${overview.couponDiscountPercentageCount} 張折扣%券` : '固定金額券'} color="text-orange-500" />
                  <KpiCard label="累積會員總數" value={`${overview.totalMembers.toLocaleString()} 人`} color="text-primary" />
                  <KpiCard label="首次付費用戶佔比" value={funnel ? `${funnel.newUserConversionRate}%` : '—'} sub="新用戶→首儲轉化" color="text-indigo-600" />
                </div>

                {/* 轉換漏斗 & 回購分析 */}
                {funnel && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                    {/* 轉換漏斗 */}
                    <div className="bg-white rounded-lg border border-neutral-200 p-4">
                      <h3 className="text-sm font-semibold text-neutral-500 mb-4">轉換漏斗</h3>
                      <div className="space-y-2">
                        {[
                          {
                            label: '期間新增會員',
                            value: funnel.newUsers,
                            unit: '人',
                            rate: null,
                            color: 'bg-primary',
                            width: 100,
                          },
                          {
                            label: '新用戶完成首次儲值',
                            value: funnel.newUserFirstPurchase,
                            unit: '人',
                            rate: funnel.newUserConversionRate,
                            color: 'bg-indigo-500',
                            width: funnel.newUsers > 0 ? Math.round(funnel.newUserFirstPurchase / funnel.newUsers * 100) : 0,
                          },
                          {
                            label: '期間付費用戶（含老用戶）',
                            value: funnel.uniquePayers,
                            unit: '人',
                            rate: null,
                            color: 'bg-violet-500',
                            width: funnel.newUsers > 0 ? Math.min(100, Math.round(funnel.uniquePayers / funnel.newUsers * 100)) : 0,
                          },
                          {
                            label: '本期回購（期間內 2 次以上）',
                            value: funnel.repeatPayersInPeriod,
                            unit: '人',
                            rate: funnel.repurchaseRateInPeriod,
                            color: 'bg-green-500',
                            width: funnel.uniquePayers > 0 ? Math.round(funnel.repeatPayersInPeriod / funnel.uniquePayers * 100) : 0,
                          },
                        ].map((step, i) => (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-neutral-500">{step.label}</span>
                              <div className="flex items-center gap-2">
                                {step.rate !== null && (
                                  <span className="text-xs font-semibold text-green-600">{step.rate}%</span>
                                )}
                                <span className="text-sm font-bold text-neutral-800 tabular-nums">
                                  {step.value.toLocaleString()} {step.unit}
                                </span>
                              </div>
                            </div>
                            <div className="w-full bg-neutral-100 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${step.color} transition-all`}
                                style={{ width: `${Math.max(step.width, step.value > 0 ? 4 : 0)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 回購 & 首購時間分析 */}
                    <div className="bg-white rounded-lg border border-neutral-200 p-4 space-y-4">
                      <h3 className="text-sm font-semibold text-neutral-500">付費行為分析</h3>

                      {/* KPI 行 */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: '首次付費用戶', value: funnel.firstTimePayers, sub: '生命週期首次', color: 'text-indigo-600' },
                          { label: '本期回購率', value: `${funnel.repurchaseRateInPeriod}%`, sub: `${funnel.repeatPayersInPeriod} 人 2 次以上`, color: 'text-green-600' },
                          { label: '平均儲值次數 / 人', value: `${funnel.avgRechargesPerPayer} 次`, sub: '本期付費用戶', color: 'text-violet-600' },
                          { label: '首購平均等待天數', value: funnel.avgDaysToFirstPurchase !== null ? `${funnel.avgDaysToFirstPurchase} 天` : '—', sub: '新用戶 → 首儲', color: 'text-orange-500' },
                        ].map(k => (
                          <div key={k.label} className="bg-neutral-50 rounded-lg p-3">
                            <p className="text-xs text-neutral-400 mb-1">{k.label}</p>
                            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                            <p className="text-xs text-neutral-400 mt-0.5">{k.sub}</p>
                          </div>
                        ))}
                      </div>

                      {/* 首購時間分佈 */}
                      {funnel.newUserFirstPurchase > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-neutral-400 mb-2">新用戶首購時間分佈</p>
                          <div className="space-y-1.5">
                            {[
                              { label: '當天', value: funnel.purchaseTimingDist.sameDay, color: 'bg-green-500' },
                              { label: '1–2 天', value: funnel.purchaseTimingDist.within3Days, color: 'bg-blue-400' },
                              { label: '3–6 天', value: funnel.purchaseTimingDist.within7Days, color: 'bg-indigo-400' },
                              { label: '7–29 天', value: funnel.purchaseTimingDist.within30Days, color: 'bg-violet-400' },
                              { label: '30 天以上', value: funnel.purchaseTimingDist.over30Days, color: 'bg-neutral-400' },
                              { label: '未轉換', value: funnel.purchaseTimingDist.neverConverted, color: 'bg-red-200' },
                            ].map(b => {
                              const total = funnel.newUsers || 1
                              const pct = Math.round(b.value / total * 100)
                              return (
                                <div key={b.label} className="flex items-center gap-2">
                                  <span className="text-xs text-neutral-400 w-16 shrink-0">{b.label}</span>
                                  <div className="flex-1 bg-neutral-100 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${b.color}`} style={{ width: `${Math.max(pct, b.value > 0 ? 2 : 0)}%` }} />
                                  </div>
                                  <span className="text-xs tabular-nums text-neutral-500 w-12 text-right">{b.value} 人 ({pct}%)</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* 每日明細 */}
                {dailyBreakdown.length > 0 && (
                  <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-neutral-100">
                      <h3 className="font-semibold text-neutral-900">每日明細</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                          <tr>
                            {['日期', '儲值金額(TWD)', '抽獎次數', '新用戶數'].map(h => (
                              <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-neutral-500">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {dailyBreakdown.map(d => (
                            <tr key={d.date} className="hover:bg-neutral-50">
                              <td className="px-4 py-2 font-mono text-xs">{d.date}</td>
                              <td className="px-4 py-2 text-right font-semibold">{d.recharge.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right">{d.draws.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right">{d.newUsers.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-neutral-50 border-t border-neutral-200">
                          <tr>
                            <td className="px-4 py-2 text-sm font-semibold text-neutral-700">合計</td>
                            <td className="px-4 py-2 text-right font-bold">{dailyBreakdown.reduce((s, d) => s + d.recharge, 0).toLocaleString()}</td>
                            <td className="px-4 py-2 text-right font-bold">{dailyBreakdown.reduce((s, d) => s + d.draws, 0).toLocaleString()}</td>
                            <td className="px-4 py-2 text-right font-bold">{dailyBreakdown.reduce((s, d) => s + d.newUsers, 0).toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 消費明細 KPI ── */}
        {reportType === 'products' && !loading && (
          <div className={`grid gap-3 ${filterCurrency === 'all' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
            <KpiCard label="商品數" value={filteredProducts.length.toLocaleString()} />
            {filterCurrency !== 'points' && (
              <KpiCard label="總消費代幣" value={`${filteredProducts.reduce((s, p) => s + (p.revenue - (p.pointsUsed ?? 0)), 0).toLocaleString()} G`} color="text-green-600" />
            )}
            {filterCurrency !== 'tokens' && (() => {
              const totalPts = filteredProducts.reduce((s, p) => s + (p.pointsUsed ?? 0), 0)
              return <KpiCard label="總消費積分" value={`${totalPts.toLocaleString()} G`} color={totalPts > 0 ? 'text-indigo-600' : 'text-orange-400'} />
            })()}
            <KpiCard label="總抽獎次數" value={filteredProducts.reduce((s, p) => s + p.drawCount, 0).toLocaleString()} color="text-primary" />
          </div>
        )}
        {reportType === 'products' && (
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">消費明細</h3>
              <span className="text-sm text-neutral-500">共 {filteredProducts.length} 項商品</span>
            </div>
            {loading ? (
              <div className="py-20 text-center text-neutral-400 text-sm">載入中…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">#</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">商品名稱</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">廠商</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">種類</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">抽獎次數</th>
                      {filterCurrency !== 'points' && <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">消費金額(G)</th>}
                      {filterCurrency !== 'tokens' && <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">積分</th>}
                      <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">剩餘 / 總數</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">完抽率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filteredProducts.length === 0 ? (
                      <tr><td colSpan={9} className="py-16 text-center text-sm text-neutral-400">此條件無商品資料</td></tr>
                    ) : filteredProducts.map((p, i) => {
                      const tokenRev = p.revenue - (p.pointsUsed ?? 0)
                      const pts = p.pointsUsed ?? 0
                      return (
                        <tr key={p.id} className="hover:bg-neutral-50">
                          <td className="px-4 py-3 text-neutral-400 text-xs w-8">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-neutral-900 max-w-[200px]">
                            <span className="truncate block">{p.name}</span>
                          </td>
                          <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                            {p.supplierName ? (
                              <span className="px-2 py-0.5 bg-primary text-primary rounded text-xs">{p.supplierName}</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">{PRODUCT_TYPE_LABEL[p.type] || p.type || '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold">{p.drawCount.toLocaleString()}</td>
                          {filterCurrency !== 'points' && (
                            <td className="px-4 py-3 text-right font-semibold text-green-700">{tokenRev.toLocaleString()} G</td>
                          )}
                          {filterCurrency !== 'tokens' && (
                            <td className="px-4 py-3 text-right font-semibold text-indigo-600">
                              {pts > 0 ? `${pts.toLocaleString()} G` : <span className="text-neutral-300">—</span>}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right text-neutral-600 whitespace-nowrap">
                            {p.remaining.toLocaleString()} / {p.totalCount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 min-w-[100px]">
                            <CompletionBar pct={p.completionRate} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {filteredProducts.length > 0 && (
                    <tfoot className="bg-neutral-50 border-t border-neutral-200">
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-neutral-700">合計</td>
                        <td className="px-4 py-2 text-right font-bold">{filteredProducts.reduce((s, p) => s + p.drawCount, 0).toLocaleString()}</td>
                        {filterCurrency !== 'points' && (
                          <td className="px-4 py-2 text-right font-bold text-green-700">
                            {filteredProducts.reduce((s, p) => s + (p.revenue - (p.pointsUsed ?? 0)), 0).toLocaleString()} G
                          </td>
                        )}
                        {filterCurrency !== 'tokens' && (
                          <td className="px-4 py-2 text-right font-bold text-indigo-600">
                            {filteredProducts.reduce((s, p) => s + (p.pointsUsed ?? 0), 0).toLocaleString()} G
                          </td>
                        )}
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 儲值明細 ── */}
        {reportType === 'recharge' && !loading && rechargeData.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="儲值筆數" value={rechargeData.length.toLocaleString()} />
            <KpiCard label="完成金額" value={`NT$ ${rechargeData.filter(r => r.status === 'completed').reduce((s, r) => s + (r.amount ?? 0), 0).toLocaleString()}`} color="text-green-600" sub="已完成筆數" />
            <KpiCard label="贈點合計" value={`${rechargeData.reduce((s, r) => s + (r.bonus ?? 0), 0).toLocaleString()} G`} color="text-primary" />
          </div>
        )}
        {reportType === 'recharge' && (
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">儲值明細</h3>
              <span className="text-sm text-neutral-500">共 {rechargeData.length} 筆</span>
            </div>
            {loading ? (
              <div className="py-20 text-center text-neutral-400 text-sm">載入中…</div>
            ) : rechargeData.length === 0 ? (
              <div className="py-20 text-center text-neutral-400 text-sm">此區間無儲值紀錄</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      {['日期', '訂單編號', '用戶', 'Email', '金額(TWD)', '贈點', '付款方式', '狀態'].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {rechargeData.map(r => (
                      <tr key={r.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-2 text-neutral-600 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.order_number}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{r.user?.name ?? '—'}</td>
                        <td className="px-4 py-2 text-neutral-500 text-xs">{r.user?.email ?? '—'}</td>
                        <td className="px-4 py-2 font-semibold text-right">{(r.amount ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{r.bonus ?? 0}</td>
                        <td className="px-4 py-2 text-neutral-500">{r.payment_method ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] ?? 'bg-neutral-100 text-neutral-600'}`}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 border-t border-neutral-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-neutral-700">合計（完成）</td>
                      <td className="px-4 py-2 text-right font-bold">{rechargeData.filter(r => r.status === 'completed').reduce((s, r) => s + (r.amount ?? 0), 0).toLocaleString()}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 消費明細（抽獎紀錄）── */}
        {reportType === 'consumption' && !loading && consumptionData.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="消費筆數" value={consumptionData.length.toLocaleString()} />
            <KpiCard label="總消費代幣" value={`${consumptionData.reduce((s, d) => s + (d.product?.price ?? 0), 0).toLocaleString()} G`} color="text-green-600" />
            <KpiCard label="平均每筆" value={`${Math.round(consumptionData.reduce((s, d) => s + (d.product?.price ?? 0), 0) / consumptionData.length).toLocaleString()} G`} color="text-primary" />
          </div>
        )}
        {reportType === 'consumption' && (
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">消費明細</h3>
              <span className="text-sm text-neutral-500">共 {consumptionData.length} 筆</span>
            </div>
            {loading ? (
              <div className="py-20 text-center text-neutral-400 text-sm">載入中…</div>
            ) : consumptionData.length === 0 ? (
              <div className="py-20 text-center text-neutral-400 text-sm">此區間無消費紀錄</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      {['日期', '用戶', 'Email', '商品', '消耗代幣(G)', '獎品等級', '獎品名稱', '狀態'].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {consumptionData.map(d => (
                      <tr key={d.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-2 text-neutral-600 whitespace-nowrap">{formatDateTime(d.created_at)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{d.user?.name ?? '—'}</td>
                        <td className="px-4 py-2 text-neutral-500 text-xs">{d.user?.email ?? '—'}</td>
                        <td className="px-4 py-2">{d.product?.name ?? '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold">{(d.product?.price ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2">
                          {d.prize_level ? <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">{d.prize_level}</span> : '—'}
                        </td>
                        <td className="px-4 py-2 text-neutral-700">{d.prize_name ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[d.status] ?? 'bg-neutral-100 text-neutral-600'}`}>
                            {STATUS_LABEL[d.status] ?? d.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 border-t border-neutral-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-neutral-700">合計消費代幣</td>
                      <td className="px-4 py-2 text-right font-bold">{consumptionData.reduce((s, d) => s + (d.product?.price ?? 0), 0).toLocaleString()} G</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
        {/* ── 用戶行為 ── */}
        {reportType === 'behavior' && (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-lg border border-neutral-200 py-20 text-center text-neutral-400 text-sm">載入中…</div>
            ) : !behaviorData ? (
              <div className="bg-white rounded-lg border border-neutral-200 py-20 text-center text-neutral-400 text-sm">無資料</div>
            ) : (
              <>
                {/* KPI */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <KpiCard label="點擊商品數（去重）" value={String(behaviorData.clickTotal)} color="text-primary" />
                  <KpiCard label="點擊後成功抽獎" value={String(behaviorData.converted)} color="text-green-600" />
                  <KpiCard label="點擊 → 抽轉化率" value={`${behaviorData.conversionRate}%`} color="text-amber-600" />
                </div>

                {/* 每日活躍用戶 */}
                <div className="bg-white rounded-lg border border-neutral-200 p-4">
                  <h3 className="text-sm font-semibold text-neutral-500 mb-3">每日活躍用戶（DAU）</h3>
                  {behaviorData.dailyActiveUsers.length === 0 ? (
                    <p className="text-sm text-neutral-400 py-4 text-center">此區間無資料</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                          <tr className="border-b border-neutral-100">
                            <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-500">日期</th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-neutral-500">活躍用戶數</th>
                            <th className="py-2 px-3 w-40"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const max = Math.max(...behaviorData.dailyActiveUsers.map(d => d.count), 1)
                            return behaviorData.dailyActiveUsers.map(d => (
                              <tr key={d.date} className="border-b border-neutral-50 hover:bg-neutral-50">
                                <td className="py-2 px-3 font-mono text-xs text-neutral-600">{d.date}</td>
                                <td className="py-2 px-3 text-right font-semibold text-primary">{d.count}</td>
                                <td className="py-2 px-3">
                                  <div className="bg-neutral-100 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${Math.round(d.count / max * 100)}%` }} />
                                  </div>
                                </td>
                              </tr>
                            ))
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* 熱門搜尋字 */}
                  <div className="bg-white rounded-lg border border-neutral-200 p-4">
                    <h3 className="text-sm font-semibold text-neutral-500 mb-3">熱門搜尋字 TOP 15</h3>
                    {behaviorData.topSearches.length === 0 ? (
                      <p className="text-sm text-neutral-400 py-4 text-center">此區間無搜尋紀錄</p>
                    ) : (
                      <div className="space-y-2">
                        {(() => {
                          const max = behaviorData.topSearches[0]?.count || 1
                          return behaviorData.topSearches.map((item, i) => (
                            <div key={item.query} className="flex items-center gap-3">
                              <span className="text-xs text-neutral-400 w-5 text-right">{i + 1}</span>
                              <span className="flex-1 text-sm text-neutral-800 truncate">{item.query}</span>
                              <div className="w-24 bg-neutral-100 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-violet-400" style={{ width: `${Math.round(item.count / max * 100)}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-neutral-600 w-8 text-right">{item.count}</span>
                            </div>
                          ))
                        })()}
                      </div>
                    )}
                  </div>

                  {/* 最多點擊系列 */}
                  <div className="bg-white rounded-lg border border-neutral-200 p-4">
                    <h3 className="text-sm font-semibold text-neutral-500 mb-3">最多點擊系列 TOP 15</h3>
                    {behaviorData.topSeries.length === 0 ? (
                      <p className="text-sm text-neutral-400 py-4 text-center">此區間無點擊紀錄</p>
                    ) : (
                      <div className="space-y-2">
                        {(() => {
                          const max = behaviorData.topSeries[0]?.count || 1
                          return behaviorData.topSeries.map((item, i) => (
                            <div key={item.series} className="flex items-center gap-3">
                              <span className="text-xs text-neutral-400 w-5 text-right">{i + 1}</span>
                              <span className="flex-1 text-sm text-neutral-800 truncate">{item.series}</span>
                              <div className="w-24 bg-neutral-100 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${Math.round(item.count / max * 100)}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-neutral-600 w-8 text-right">{item.count}</span>
                            </div>
                          ))
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
