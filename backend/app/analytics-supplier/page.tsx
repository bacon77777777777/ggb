'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import SelectField from '@/components/ui/SelectField'
import { useAdmin } from '@/contexts/AdminContext'

/*
 * 廠商分析
 *
 * 版面照著「分析頁」(`/analytics-overview`) 走，差別是所有數字都只算一家廠商，
 * 而且工具列最左邊多一顆廠商下拉（老闆指定）。
 *
 * 沒有做成「分析頁加一個廠商篩選」：那支頁面上有總儲值、訪問量、轉換率、
 * 全站熱門搜尋、廠商排行 —— 全是平台量體，廠商帳號一個都不能看。
 * 與其在同一頁到處加角色判斷（漏一個就外洩），不如另開一頁，
 * 資料源也另開（`/api/admin/analytics-supplier`），結構上就沒有平台數字。
 */

const PieChart = dynamic(
  () => import('@ant-design/charts').then(m => ({ default: m.Pie })),
  { ssr: false },
)
const ColumnChart = dynamic(
  () => import('@ant-design/charts').then(m => ({ default: m.Column })),
  { ssr: false },
)

interface Supplier { id: number | string; name: string }
interface TopProduct { rank: number; id: string; name: string; type: string; label: string; draws: number; sales: number; growth: number }
interface Payload {
  supplierName: string
  empty?: boolean
  current: {
    totalSales: number; totalDraws: number
    activeProducts: number; totalProducts?: number; avgPerDraw: number
    bars: { label: string; sales: number; draws: number }[]
    categories: { type: string; label: string; count: number; amount: number }[]
    topProducts: TopProduct[]
  }
  growth: { sales: number; draws: number }
}

const toDS = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mondayOf = (d: Date) => { const x = new Date(d); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x }
const sundayOf = (d: Date) => { const x = mondayOf(d); x.setDate(x.getDate() + 6); return x }

/** 成長率標記：正紅負綠，跟分析頁一致（紅漲綠跌是台股習慣） */
function Delta({ value }: { value: number }) {
  if (!value) return <span className="text-xs text-neutral-400">0%</span>
  const up = value > 0
  return (
    <span className={`text-xs font-medium ${up ? 'text-red-500' : 'text-green-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}%
    </span>
  )
}

function KpiCard({ title, value, unit, delta, sub }: {
  title: string; value: number | string; unit?: string; delta?: number; sub?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <p className="text-sm font-semibold text-neutral-700 mb-3">{title}</p>
      <p className="text-3xl font-bold text-neutral-900 tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="text-base font-normal text-neutral-500 ml-1">{unit}</span>}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {delta !== undefined && <><span className="text-xs text-neutral-400">較上期</span><Delta value={delta} /></>}
        {sub && <span className="text-xs text-neutral-400">{sub}</span>}
      </div>
    </div>
  )
}

export default function SupplierAnalyticsPage() {
  const { user } = useAdmin()
  const isSupplier = user?.role === 'supplier'

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const today = useMemo(() => new Date(), [])
  const [startDate, setStartDate] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`)
  const [endDate, setEndDate] = useState(toDS(today))
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const PRESETS = useMemo(() => {
    const y = today.getFullYear(), m = today.getMonth()
    const monthEnd = new Date(y, m + 1, 0)
    return [
      { label: '今日', start: toDS(today), end: toDS(today) },
      { label: '本週', start: toDS(mondayOf(today)), end: toDS(sundayOf(today)) },
      { label: '本月', start: `${y}-${String(m + 1).padStart(2, '0')}-01`, end: toDS(monthEnd) },
      { label: '本年', start: `${y}-01-01`, end: `${y}-12-31` },
    ]
  }, [today])
  const activePreset = PRESETS.find(p => p.start === startDate && p.end === endDate)?.label

  // 廠商帳號打這支只會拿到自己那家，下拉自然只有一個選項
  useEffect(() => {
    fetch('/api/admin/suppliers')
      .then(r => r.json())
      .then(json => {
        const list: Supplier[] = Array.isArray(json) ? json : (json.data ?? [])
        setSuppliers(list)
        if (list.length > 0) setSupplierId(String(list[0].id))
      })
      .catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    if (!supplierId) return
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ supplierId, start: startDate, end: endDate })
      const res = await fetch(`/api/admin/analytics-supplier?${p}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '載入失敗')
      setData(json)
    } catch (e: any) {
      setError(e?.message || '載入失敗'); setData(null)
    } finally {
      setLoading(false)
    }
  }, [supplierId, startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  const c = data?.current
  const hasData = !!c && c.totalDraws > 0

  return (
    <AdminLayout pageTitle="廠商分析">
      <div className="space-y-5">

        {/* 工具列：廠商下拉擺最左邊（老闆指定），其餘沿用分析頁 */}
        <div className="flex items-center gap-2">
          <div className="w-56">
            <SelectField
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              disabled={isSupplier || suppliers.length <= 1}
            >
              {suppliers.length === 0 && <option value="">載入中…</option>}
              {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </SelectField>
          </div>

          <div className="flex-1" />

          {PRESETS.map(p => (
            <button key={p.label}
              onClick={() => { setStartDate(p.start); setEndDate(p.end) }}
              className={`h-9 px-3 text-sm rounded-lg border transition-colors ${
                activePreset === p.label
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
              }`}
            >
              {p.label}
            </button>
          ))}
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            placeholder="自訂日期"
          />
          <button
            onClick={fetchData}
            className="h-9 w-9 flex items-center justify-center border border-neutral-200 rounded-lg bg-white hover:bg-neutral-50 transition-colors"
            title="刷新"
          >
            <svg className={`w-4 h-4 text-neutral-500 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="bg-white rounded-xl border border-neutral-200 py-10 text-center text-sm text-red-500">{error}</div>
        )}

        {!error && (
          <>
            {/* KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard title="銷售額" value={c?.totalSales ?? 0} unit="幣" delta={data?.growth.sales} />
              <KpiCard title="消費筆數" value={c?.totalDraws ?? 0} delta={data?.growth.draws} />
              <KpiCard title="平均客單" value={c?.avgPerDraw ?? 0} unit="幣" sub="每抽平均消費" />
              <KpiCard title="上架中商品" value={c?.activeProducts ?? 0} sub={`共 ${c?.totalProducts ?? 0} 件`} />
            </div>

            {/* 走勢 + 類別佔比 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white rounded-xl border border-neutral-200 p-4">
                <p className="text-sm font-semibold text-neutral-700 mb-3">銷售走勢</p>
                {hasData ? (
                  <ColumnChart
                    height={260}
                    data={c!.bars}
                    xField="label"
                    yField="sales"
                    autoFit
                    axis={{ y: { labelFormatter: (v: number) => v.toLocaleString() } }}
                  />
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-sm text-neutral-400">本期無消費紀錄</div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 p-4">
                <p className="text-sm font-semibold text-neutral-700 mb-3">銷售類別佔比</p>
                {hasData && c!.categories.length > 0 ? (
                  <PieChart
                    height={260}
                    data={c!.categories.map(x => ({ type: x.label, value: x.amount }))}
                    angleField="value"
                    colorField="type"
                    innerRadius={0.6}
                    autoFit
                    label={{ text: (item: any) => `${item.type}: ${item.value.toLocaleString()}`, position: 'outside' }}
                    legend={false}
                  />
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-sm text-neutral-400">本期無消費紀錄</div>
                )}
              </div>
            </div>

            {/* 熱門商品 */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100">
                <p className="text-sm font-semibold text-neutral-700">熱門商品 TOP 15</p>
              </div>
              {hasData ? (
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      {['#', '商品', '類別', '抽獎次數', '銷售額', '較上期'].map((h, i) => (
                        <th key={h} className={`py-2 px-3 text-xs font-semibold text-neutral-500 whitespace-nowrap ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {c!.topProducts.map(p => (
                      <tr key={p.id} className="hover:bg-neutral-50">
                        <td className="py-2 px-3 text-neutral-400 tabular-nums w-10">{p.rank}</td>
                        <td className="py-2 px-3 text-neutral-800">{p.name}</td>
                        <td className="py-2 px-3 text-neutral-500 whitespace-nowrap">{p.label}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-neutral-600">{p.draws.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-neutral-800">{p.sales.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right"><Delta value={p.growth} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 text-center text-sm text-neutral-400">本期無消費紀錄</div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
