'use client'

import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatDateTime } from '@/utils/dateFormat'

type ReportType = 'overview' | 'products' | 'recharge' | 'consumption'

const TYPE_META: Record<ReportType, { title: string }> = {
  overview:    { title: '營運總覽' },
  products:    { title: '商品表現' },
  recharge:    { title: '儲值明細' },
  consumption: { title: '消費明細' },
}

const STATUS_LABEL: Record<string, string> = {
  completed: '完成', pending: '待處理', failed: '失敗', refunded: '已退款',
  success: '成功', in_warehouse: '倉庫中', pending_delivery: '待配送',
  shipped: '已出貨', exchanged: '已兌換', dismantled: '已拆解',
  listing: '上架中', cancelled: '已取消',
}
const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700', success: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-yellow-100 text-yellow-700', pending_delivery: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700', refunded: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-100 text-red-700', shipped: 'bg-blue-100 text-blue-700',
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
    <div className="bg-white rounded-lg border border-neutral-200 p-4">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── 完抽進度條 ────────────────────────────────────────────────────────────
function CompletionBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-neutral-100 rounded-full h-1.5 min-w-[60px]">
        <div
          className={`h-1.5 rounded-full ${pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-neutral-300'}`}
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
  const [dailyBreakdown, setDailyBreakdown] = useState<any[]>([])
  const [productsData, setProductsData] = useState<any[]>([])

  // 商品表現篩選
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

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
        if (filterCategory) params.set('category', filterCategory)
      }
      const res = await fetch(`/api/admin/reports?${params}`)
      if (!res.ok) throw new Error((await res.json()).error || '載入失敗')
      const json = await res.json()
      if (reportType === 'recharge') setRechargeData(json.data ?? [])
      else if (reportType === 'consumption') setConsumptionData(json.data ?? [])
      else if (reportType === 'overview') { setOverview(json.overview ?? null); setDailyBreakdown(json.dailyBreakdown ?? []) }
      else if (reportType === 'products') setProductsData(json.data ?? [])
    } catch (e: any) { alert(e.message || '載入失敗') }
    finally { setLoading(false) }
  }, [reportType, start, end, filterSupplier, filterCategory])

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
      exportCSV(`商品表現_${start}_${end}.csv`,
        ['商品名稱', '廠商', '類型', '分類', '抽獎次數', '消費金額(G)', '剩餘數量', '總數量', '完抽率(%)'],
        productsData.map(p => [p.name, p.supplierName ?? '—', p.type ?? '', p.category ?? '', String(p.drawCount), String(p.revenue), String(p.remaining), String(p.totalCount), String(p.completionRate)])
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

  // 分類列表（從商品資料推導）
  const categories = [...new Set(productsData.map(p => p.category).filter(Boolean))]

  return (
    <AdminLayout
      pageTitle={meta.title}
      breadcrumbs={[{ label: '報表' }, { label: meta.title, href: `/reports/${reportType}` }]}
    >
      <div className="space-y-4">
        {/* 工具列 — 靠右對齊，同儀表板風格 */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {reportType === 'products' && (
            <>
              <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
                className="border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">所有廠商</option>
                {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">所有分類</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
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
                {/* 資金流動 */}
                <div>
                  <h3 className="text-sm font-semibold text-neutral-500 mb-2 px-1">資金流動</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <KpiCard label="總儲值金額" value={`NT$ ${overview.totalRecharge.toLocaleString()}`} sub={`${overview.totalRechargeCount} 筆`} color="text-purple-600" />
                    <KpiCard label="平均儲值 / 人" value={`NT$ ${overview.avgPerPayer.toLocaleString()}`} sub={`${overview.uniquePayers} 位付費用戶`} color="text-purple-500" />
                    <KpiCard label="總消費代幣" value={`${overview.totalTokenConsumed.toLocaleString()} G`} sub={`${overview.totalDraws} 次抽獎`} color="text-emerald-600" />
                    <KpiCard label="平均每次抽賞" value={`${overview.avgTokenPerDraw.toLocaleString()} G`} sub="消費代幣 / 次" color="text-emerald-500" />
                    <KpiCard label="折價券折損" value={`NT$ ${overview.couponDiscountFixed.toLocaleString()}`} sub={overview.couponDiscountPercentageCount > 0 ? `另有 ${overview.couponDiscountPercentageCount} 張折扣%券` : '固定金額券'} color="text-orange-500" />
                  </div>
                </div>

                {/* 會員 */}
                <div>
                  <h3 className="text-sm font-semibold text-neutral-500 mb-2 px-1">會員</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <KpiCard label="累積會員總數" value={`${overview.totalMembers.toLocaleString()} 人`} color="text-blue-600" />
                    <KpiCard label="期間新增會員" value={`${overview.newUserCount.toLocaleString()} 人`} color="text-blue-500" />
                    <KpiCard label="期間付費用戶" value={`${overview.uniquePayers.toLocaleString()} 人`} sub={overview.newUserCount > 0 ? `轉換率 ${Math.round(overview.uniquePayers / overview.newUserCount * 100)}%` : undefined} color="text-indigo-600" />
                  </div>
                </div>

                {/* 每日明細 */}
                {dailyBreakdown.length > 0 && (
                  <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-neutral-100">
                      <h3 className="font-semibold text-neutral-900">每日明細</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-100">
                          <tr>
                            {['日期', '儲值金額(TWD)', '抽獎次數', '新用戶數'].map(h => (
                              <th key={h} className="text-left px-4 py-2 text-xs font-medium text-neutral-500">{h}</th>
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

        {/* ── 商品表現 ── */}
        {reportType === 'products' && (
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">商品表現</h3>
              <span className="text-sm text-neutral-500">共 {productsData.length} 項商品</span>
            </div>
            {loading ? (
              <div className="py-20 text-center text-neutral-400 text-sm">載入中…</div>
            ) : productsData.length === 0 ? (
              <div className="py-20 text-center text-neutral-400 text-sm">此條件無商品資料</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-100">
                    <tr>
                      {['#', '商品名稱', '廠商', '分類', '抽獎次數', '消費金額(G)', '剩餘 / 總數', '完抽率'].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium text-neutral-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {productsData.map((p, i) => (
                      <tr key={p.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 text-neutral-400 text-xs w-8">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-neutral-900 max-w-[200px]">
                          <span className="truncate block">{p.name}</span>
                        </td>
                        <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                          {p.supplierName ? (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{p.supplierName}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">{p.category || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold">{p.drawCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{p.revenue.toLocaleString()} G</td>
                        <td className="px-4 py-3 text-right text-neutral-600 whitespace-nowrap">
                          {p.remaining.toLocaleString()} / {p.totalCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 min-w-[100px]">
                          <CompletionBar pct={p.completionRate} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 border-t border-neutral-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-neutral-700">合計</td>
                      <td className="px-4 py-2 text-right font-bold">{productsData.reduce((s, p) => s + p.drawCount, 0).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-bold text-emerald-700">{productsData.reduce((s, p) => s + p.revenue, 0).toLocaleString()} G</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 儲值明細 ── */}
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
                  <thead className="bg-neutral-50 border-b border-neutral-100">
                    <tr>
                      {['日期', '訂單編號', '用戶', 'Email', '金額(TWD)', '贈點', '付款方式', '狀態'].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium text-neutral-500 whitespace-nowrap">{h}</th>
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

        {/* ── 消費明細 ── */}
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
                  <thead className="bg-neutral-50 border-b border-neutral-100">
                    <tr>
                      {['日期', '用戶', 'Email', '商品', '消耗代幣(G)', '獎品等級', '獎品名稱', '狀態'].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium text-neutral-500 whitespace-nowrap">{h}</th>
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
      </div>
    </AdminLayout>
  )
}
