'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import SelectField from '@/components/ui/SelectField'
import { StatCard, GrowthTag } from '@/components/analytics/StatCard'
import { RankingList } from '@/components/analytics/RankingList'
import { useAdmin } from '@/contexts/AdminContext'

/*
 * 廠商分析
 *
 * UI 沿用「分析頁」那一套（老闆指定）：AntD Pro 風格的 KPI 卡、迷你圖、
 * 儀表板的 TOP 15 排行卡、外標籤甜甜圈。卡片與排行卡已抽成
 * `components/analytics/`，不再各頁抄一份。
 *
 * 資料源另開 `/api/admin/analytics-supplier`，整支只算單一廠商 ——
 * 分析頁上的總儲值、訪問量、轉換率、全站熱門搜尋、廠商排行都是平台量體，
 * 廠商一個都不能看，與其在同一頁到處加角色判斷（漏一個就外洩），
 * 不如資料源就不含那些東西。
 */

const TinyColumn = dynamic(
  () => import('@ant-design/charts').then(m => ({ default: m.Tiny.Column })),
  { ssr: false },
)
const TinyArea = dynamic(
  () => import('@ant-design/charts').then(m => ({ default: m.Tiny.Area })),
  { ssr: false },
)
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
  current: {
    totalSales: number; totalDraws: number
    activeProducts: number; totalProducts: number; avgPerDraw: number
    todaySales: number; todayDraws: number
    bars: { label: string; sales: number; draws: number }[]
    spark: { x: number; date: string; sales: number; draws: number }[]
    categories: { type: string; label: string; count: number; amount: number }[]
    topProducts: TopProduct[]
  }
  growth: { sales: number; draws: number; salesToday: number; drawsToday: number }
}

const toDS = (d: Date) => d.toLocaleDateString('sv')
const mondayOf = (d: Date) => { const x = new Date(d); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x }
const sundayOf = (d: Date) => { const x = mondayOf(d); x.setDate(x.getDate() + 6); return x }

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
  const g = data?.growth
  const spark = c?.spark ?? []
  const hasData = (c?.totalDraws ?? 0) > 0

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
            {/* ── KPI（分析頁同款卡片）───────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-6">
              <StatCard
                title="銷售額" loading={loading} skeletonWidth="w-32"
                value={`${(c?.totalSales ?? 0).toLocaleString()} G幣`}
                mid={g && <>
                  <GrowthTag value={g.sales} label="期間同比" />
                  <GrowthTag value={g.salesToday} label="日同比" />
                </>}
                footerLabel="日銷售額" footerValue={(c?.todaySales ?? 0).toLocaleString()}
              />

              <StatCard
                title="消費筆數" loading={loading} skeletonWidth="w-16"
                value={(c?.totalDraws ?? 0).toLocaleString()}
                mid={!loading && spark.some(s => s.draws > 0) ? (
                  <TinyColumn data={spark} xField="x" yField="draws"
                    height={46} autoFit
                    style={{ fill: '#1677ff', opacity: 0.85 } as any}
                    axis={false} padding={0}
                    tooltip={{ title: (d: any) => d.date, items: [{ channel: 'y', name: '消費筆數' }] } as any} />
                ) : <div className="w-full h-full" />}
                footerLabel="日消費筆數" footerValue={(c?.todayDraws ?? 0).toLocaleString()}
              />

              <StatCard
                title="銷售走勢" loading={loading} skeletonWidth="w-24"
                value={`${(c?.avgPerDraw ?? 0).toLocaleString()} G幣`}
                mid={!loading && spark.some(s => s.sales > 0) ? (
                  <TinyArea data={spark} xField="x" yField="sales"
                    height={46} autoFit
                    style={{ fill: 'rgba(114,46,209,0.25)', stroke: '#722ed1', lineWidth: 2, shape: 'smooth' } as any}
                    axis={false} padding={[2, 0, 0, 0]}
                    tooltip={{ title: (d: any) => d.date, items: [{ channel: 'y', name: '銷售額' }] } as any} />
                ) : <div className="w-full h-full" />}
                footerLabel="平均客單" footerValue={`${(c?.avgPerDraw ?? 0).toLocaleString()} G幣`}
              />

              <StatCard
                title="上架中商品" loading={loading} skeletonWidth="w-12"
                value={(c?.activeProducts ?? 0).toLocaleString()}
                mid={g && <GrowthTag value={g.draws} label="消費筆數期間同比" />}
                footerLabel="商品總數" footerValue={(c?.totalProducts ?? 0).toLocaleString()}
              />
            </div>

            {/* ── 銷售走勢 + 類別佔比 ────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-6">
              <div className="rounded-lg border border-[#f0f0f0] overflow-hidden bg-white flex flex-col">
                <div className="flex items-center min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
                  style={{ color: 'rgba(0,0,0,0.88)' }}>
                  銷售走勢
                </div>
                <div className="p-6">
                  {hasData ? (
                    <ColumnChart height={280} data={c!.bars} xField="label" yField="sales" autoFit
                      style={{ fill: '#1677ff', opacity: 0.85 } as any}
                      axis={{ y: { labelFormatter: (v: number) => v.toLocaleString() } }} />
                  ) : (
                    <div className="h-[280px] flex items-center justify-center text-sm text-neutral-400">本期無消費紀錄</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[#f0f0f0] overflow-hidden bg-white flex flex-col">
                <div className="flex items-center min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
                  style={{ color: 'rgba(0,0,0,0.88)' }}>
                  銷售類別佔比
                </div>
                <div className="p-6">
                  {hasData && c!.categories.length > 0 ? (
                    <PieChart height={280}
                      data={c!.categories.map(x => ({ type: x.label, value: x.amount }))}
                      angleField="value" colorField="type" innerRadius={0.6} autoFit
                      label={{ text: (item: any) => `${item.type}: ${item.value.toLocaleString()}`, position: 'outside' }}
                      legend={false} />
                  ) : (
                    <div className="h-[280px] flex items-center justify-center text-sm text-neutral-400">本期無消費紀錄</div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 排行（儀表板同款卡片）──────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-6">
              <RankingList
                title="熱門商品 TOP 15"
                limit={15}
                data={(c?.topProducts ?? []).map(p => ({ name: p.name, value: p.sales, change: p.growth }))}
              />
              <RankingList
                title="銷售類別 TOP 15"
                limit={15}
                data={(c?.categories ?? []).map(x => ({ name: x.label, value: x.amount }))}
              />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
