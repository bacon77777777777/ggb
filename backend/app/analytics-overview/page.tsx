'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
// 驚嘆號說明改用共用元件：本地那顆是 absolute 定位，會被卡片的 overflow-hidden 裁掉
import { InfoIcon } from '@/components/analytics/StatCard'
import { RankingList } from '@/components/analytics/RankingList'

// ── Dynamic chart imports (Canvas, no SSR) ────────────────────────────────────

const TinyArea = dynamic(
  () => import('@ant-design/charts').then(m => ({ default: m.Tiny.Area })),
  { ssr: false }
)

const TinyColumn = dynamic(
  () => import('@ant-design/charts').then(m => ({ default: m.Tiny.Column })),
  { ssr: false }
)

const PieChart = dynamic(
  () => import('@ant-design/charts').then(m => ({ default: m.Pie })),
  { ssr: false, loading: () => <div className="w-40 h-40 rounded-full border-[14px] border-neutral-100 animate-pulse mx-auto" /> }
)

const ColumnChart = dynamic(
  () => import('@ant-design/charts').then(m => ({ default: m.Column })),
  { ssr: false, loading: () => <div className="h-[260px] bg-neutral-50 rounded animate-pulse" /> }
)

const LineChart = dynamic(
  () => import('@ant-design/charts').then(m => ({ default: m.Line })),
  { ssr: false, loading: () => <div className="h-[260px] bg-neutral-50 rounded animate-pulse" /> }
)

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ['#1677ff', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899']

// ── Ring progress (SVG) ───────────────────────────────────────────────────────

function RingProgress({ pct, name, draws }: { pct: number; name: string; draws: number }) {
  const R = 30, circ = 2 * Math.PI * R
  const dash = Math.min(pct / 100, 1) * circ
  const color = pct >= 60 ? '#1677ff' : pct >= 30 ? '#10b981' : '#f59e0b'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-[76px] h-[76px]">
        <svg width={76} height={76} viewBox="0 0 76 76">
          <circle cx={38} cy={38} r={R} fill="none" stroke="#f3f4f6" strokeWidth="8" />
          <circle cx={38} cy={38} r={R} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={0}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '38px 38px', transition: 'stroke-dasharray 0.5s' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-neutral-800">{pct}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-medium text-neutral-700 truncate max-w-[80px]">{name}</div>
        <div className="text-xs text-neutral-400 font-mono">{draws.toLocaleString()} 次</div>
      </div>
    </div>
  )
}

// ── Growth tag (AntD Pro style: 紅漲綠跌，中文慣例) ──────────────────────────

function GrowthTag({ value, label, style }: { value: number; label?: string; style?: React.CSSProperties }) {
  const up = value >= 0
  return (
    <div className="inline-block text-sm leading-[22px]" style={style}>
      <span style={{ color: 'rgba(0,0,0,0.65)' }}>
        {label}
        <span style={{ marginLeft: 8, color: 'rgba(0,0,0,0.88)' }}>{Math.abs(value)}%</span>
      </span>
      <span style={{ marginLeft: 4, color: up ? '#f5222d' : '#52c41a' }}>
        {up ? '▲' : '▼'}
      </span>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  current: {
    totalSales: number; totalDrawCount: number; totalRecharges: number; totalVisits: number
    todaySales: number; todayDrawCount: number; todayVisits: number; todayRecharges: number
    yesterdaySales: number; yesterdayDrawCount: number; yesterdayVisits: number; yesterdayRecharges: number
    convRate: number
    bars: { label: string; sales: number; draws: number; visits: number; recharges: number }[]
    spark: { x: number; date: string; sales: number; draws: number; visits: number }[]
    keywords: { rank: number; keyword: string; count: number; growth: number | null }[]
    topProducts: { name: string; value: number }[]
    peakHours: { hour: number; label: string; draws: number; visits: number }[]
    categories: { type: string; label: string; count: number; amount: number }[]
    suppliers: { id: string; name: string; rank: number; draws: number; sales: number; visits: number; salesPct: number; drawsPct: number; visitsPct: number; convRate: number }[]
  }
  growth: {
    sales: number; draws: number; recharges: number; visits: number
    salesToday: number; drawsToday: number; visitsToday: number; rechargesToday: number; convRate: number
  }
}

/** 併進來的「轉換分析」「點擊分析」兩頁的數字，來自 /api/admin/reports */
interface MergedData {
  overview?: {
    avgTokenPerDraw: number; couponDiscountFixed: number; couponDiscountPercentageCount: number
    totalMembers: number; uniquePayers: number; uniqueDrawers: number; newUserCount: number
  }
  funnel?: { firstTimePayers: number; uniquePayers: number; repurchaseRateInPeriod: number; newUserConversionRate: number }
  behavior?: {
    topSearches: { query: string; count: number }[]
    topSeries: { series: string; count: number }[]
    conversionRate: number; clickTotal: number; converted: number
    trialTotal?: number; trialUsers?: number
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDS(d: Date) { return d.toLocaleDateString('sv') }

function mondayOf(d: Date) {
  const r = new Date(d)
  const day = d.getDay()
  r.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return r
}

function sundayOf(d: Date) {
  const r = new Date(d)
  const day = d.getDay()
  r.setDate(d.getDate() + (day === 0 ? 0 : 7 - day))
  return r
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsOverviewPage() {
  const today = useMemo(() => new Date(), [])
  const [startDate, setStartDate] = useState(() =>
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  )
  const [endDate, setEndDate] = useState(() =>
    toDS(new Date(today.getFullYear(), today.getMonth() + 1, 0))
  )
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lineChartH, setLineChartH] = useState(300)
  const lineChartContainerRef = React.useRef<HTMLDivElement>(null)
  const [chartMode, setChartMode] = useState<'sales' | 'visits'>('sales')
  const [peakMode, setPeakMode] = useState<'draws' | 'visits'>('draws')
  /*
   * 「轉換分析」與「點擊分析」原本是選單上的兩個獨立頁面，各自只有幾個數字。
   * 老闆要把營運總覽收成三頁，這兩頁併進來 —— 直接沿用 /api/admin/reports
   * 既有的 overview / behavior 兩個 tab，不重寫一份算法（重寫就會出現兩套數字）。
   * `/reports/[type]` 路由本身留著，它還在服務對帳報表的消費明細。
   */
  const [merged, setMerged] = useState<MergedData>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (startDate) p.set('start', startDate)
      if (endDate) p.set('end', endDate)
      const [res, ov, bh] = await Promise.all([
        fetch(`/api/admin/analytics-overview?${p}`),
        fetch(`/api/admin/reports?tab=overview&${p}`),
        fetch(`/api/admin/reports?tab=behavior&${p}`),
      ])
      if (res.ok) setData(await res.json())
      const m: MergedData = {}
      if (ov.ok) { const j = await ov.json(); m.overview = j.overview; m.funnel = j.funnel }
      if (bh.ok) m.behavior = await bh.json()
      setMerged(m)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const el = lineChartContainerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height
      if (h > 80) setLineChartH(Math.floor(h))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const c = data?.current
  const g = data?.growth

  const PRESETS = useMemo(() => {
    const y = today.getFullYear(), m = today.getMonth()
    const monthEnd = new Date(y, m + 1, 0) // last day of current month
    return [
      { label: '今日', start: toDS(today), end: toDS(today) },
      { label: '昨日', start: toDS(new Date(today.getTime() - 86400_000)), end: toDS(new Date(today.getTime() - 86400_000)) },
      { label: '本週', start: toDS(mondayOf(today)), end: toDS(sundayOf(today)) },
      { label: '本月', start: `${y}-${String(m + 1).padStart(2, '0')}-01`, end: toDS(monthEnd) },
      { label: '本年', start: `${y}-01-01`, end: `${y}-12-31` },
    ]
  }, [today])

  const activePreset = PRESETS.find(p => p.start === startDate && p.end === endDate)?.label

  const spark = c?.spark ?? []

  return (
    <AdminLayout pageTitle="數據分析">
      <div className="space-y-5">

        {/* ── Toolbar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2">
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

        {/* ── KPI Cards — pixel-matched to AntD Pro ────────────────────── */}
        <div className="grid grid-cols-4 gap-6">

          {/* Card 1: 總儲值金額 */}
          <div className="rounded-lg border border-[#f0f0f0] overflow-hidden bg-white">
            <div className="flex items-center min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
              style={{ color: 'rgba(0,0,0,0.88)' }}>
              <span className="flex-1 min-w-0 truncate">總儲值金額</span>
              <InfoIcon text={'這段期間玩家儲值進來的總金額（台幣）。\n只算付款成功的，已扣掉機器人帳號。\n周同比＝跟前一段同樣長度的期間相比；日同比＝今天跟昨天相比。'} />
            </div>
            <div style={{ padding: '20px 24px 8px' }}>
              <div className="relative w-full">
                <div className="h-[38px] text-[30px] leading-[38px] overflow-hidden whitespace-nowrap"
                  style={{ color: 'rgba(0,0,0,0.88)' }}>
                  {loading ? <span className="inline-block w-24 h-7 bg-neutral-100 rounded animate-pulse" /> :
                    `${(c?.totalRecharges ?? 0).toLocaleString()} 元`}
                </div>
              </div>
              <div className="relative w-full mb-3" style={{ height: 46 }}>
                <div className="absolute bottom-0 left-0 w-full flex gap-4">
                  {g && <GrowthTag value={g.recharges} label="周同比" />}
                  {g && <GrowthTag value={g.rechargesToday} label="日同比" />}
                </div>
              </div>
              <div className="pt-[9px]" style={{ marginTop: 8, borderTop: '1px solid rgba(5,5,5,0.06)' }}>
                <span className="text-sm" style={{ color: 'rgba(0,0,0,0.65)' }}>日儲值</span>
                <span className="text-sm ml-2" style={{ color: 'rgba(0,0,0,0.88)' }}>
                  {loading ? '—' : (c?.todayRecharges ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: 總銷售額 */}
          <div className="rounded-lg border border-[#f0f0f0] overflow-hidden bg-white">
            <div className="flex items-center min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
              style={{ color: 'rgba(0,0,0,0.88)' }}>
              <span className="flex-1 min-w-0 truncate">總銷售額</span>
              <InfoIcon text={'這段期間玩家抽獎花掉的代幣總額（1G = 1 元）。\n跟儲值不一樣：儲值是把錢放進來，這裡是實際花掉的。\n已扣掉機器人帳號。'} />
            </div>
            <div style={{ padding: '20px 24px 8px' }}>
              <div className="relative w-full">
                <div className="h-[38px] text-[30px] leading-[38px] overflow-hidden whitespace-nowrap"
                  style={{ color: 'rgba(0,0,0,0.88)' }}>
                  {loading ? <span className="inline-block w-32 h-7 bg-neutral-100 rounded animate-pulse" /> :
                    `${(c?.totalSales ?? 0).toLocaleString()} G幣`}
                </div>
              </div>
              <div className="relative w-full mb-3" style={{ height: 46 }}>
                <div className="absolute bottom-0 left-0 w-full flex gap-4">
                  {g && <GrowthTag value={g.sales} label="周同比" />}
                  {g && <GrowthTag value={g.salesToday} label="日同比" />}
                </div>
              </div>
              <div className="pt-[9px]" style={{ marginTop: 8, borderTop: '1px solid rgba(5,5,5,0.06)' }}>
                <span className="text-sm" style={{ color: 'rgba(0,0,0,0.65)' }}>日銷售額</span>
                <span className="text-sm ml-2" style={{ color: 'rgba(0,0,0,0.88)' }}>
                  {loading ? '—' : (c?.todaySales ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: 消費筆數 + TinyColumn 藍柱 */}
          <div className="rounded-lg border border-[#f0f0f0] overflow-hidden bg-white">
            <div className="flex items-center min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
              style={{ color: 'rgba(0,0,0,0.88)' }}>
              <span className="flex-1 min-w-0 truncate">消費筆數</span>
              <InfoIcon text={'這段期間的抽獎次數，抽一次算一筆。\n藍色柱子是各時段的筆數分布。\n轉化率＝消費筆數 ÷ 訪問量，代表來看的人有多少比例真的抽了。'} />
            </div>
            <div style={{ padding: '20px 24px 8px' }}>
              <div className="relative w-full">
                <div className="h-[38px] text-[30px] leading-[38px] overflow-hidden whitespace-nowrap"
                  style={{ color: 'rgba(0,0,0,0.88)' }}>
                  {loading ? <span className="inline-block w-16 h-7 bg-neutral-100 rounded animate-pulse" /> :
                    (c?.totalDrawCount ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="relative w-full mb-3" style={{ height: 46 }}>
                <div className="absolute bottom-0 left-0 w-full h-full">
                  {!loading && spark.some(d => d.draws > 0) ? (
                    <TinyColumn data={spark} xField="x" yField="draws"
                      height={46} autoFit
                      style={{ fill: '#1677ff', opacity: 0.85 } as any}
                      axis={false} padding={0}
                      tooltip={{ title: (d: any) => d.date, items: [{ channel: 'y', name: '消費筆數' }] } as any} />
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </div>
              </div>
              <div className="pt-[9px]" style={{ marginTop: 8, borderTop: '1px solid rgba(5,5,5,0.06)' }}>
                <span className="text-sm" style={{ color: 'rgba(0,0,0,0.65)' }}>轉化率</span>
                <span className="text-sm ml-2" style={{ color: 'rgba(0,0,0,0.88)' }}>
                  {loading ? '—' : `${c?.convRate ?? 0}%`}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: 訪問量 + TinyArea 紫色 */}
          <div className="rounded-lg border border-[#f0f0f0] overflow-hidden bg-white">
            <div className="flex items-center min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
              style={{ color: 'rgba(0,0,0,0.88)' }}>
              <span className="flex-1 min-w-0 truncate">訪問量</span>
              <InfoIcon text={'這段期間全站被瀏覽的次數。\n同一個人重複進來會重複計算。\n紫色曲線是各時段的起伏。'} />
            </div>
            <div style={{ padding: '20px 24px 8px' }}>
              <div className="relative w-full">
                <div className="h-[38px] text-[30px] leading-[38px] overflow-hidden whitespace-nowrap"
                  style={{ color: 'rgba(0,0,0,0.88)' }}>
                  {loading ? <span className="inline-block w-20 h-7 bg-neutral-100 rounded animate-pulse" /> :
                    (c?.totalVisits ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="relative w-full mb-3" style={{ height: 46 }}>
                <div className="absolute bottom-0 left-0 w-full h-full">
                  {!loading && spark.some(d => d.visits > 0) ? (
                    <TinyArea data={spark} xField="x" yField="visits"
                      height={46} autoFit
                      style={{ fill: 'rgba(114,46,209,0.25)', stroke: '#722ed1', lineWidth: 2, shape: 'smooth' } as any}
                      axis={false} padding={[2, 0, 0, 0]}
                      tooltip={{ title: (d: any) => d.date, items: [{ channel: 'y', name: '訪問量' }] } as any} />
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </div>
              </div>
              <div className="pt-[9px]" style={{ marginTop: 8, borderTop: '1px solid rgba(5,5,5,0.06)' }}>
                <span className="text-sm" style={{ color: 'rgba(0,0,0,0.65)' }}>日訪問量</span>
                <span className="text-sm ml-2" style={{ color: 'rgba(0,0,0,0.88)' }}>
                  {loading ? '—' : (c?.todayVisits ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* ── 線上熱門搜尋 + 銷售類別佔比（AntD Pro style）────────────────── */}
        <div className="grid grid-cols-2 gap-6">

          {/* 儲值與消耗對比 */}
          <div className="rounded-lg border border-[#f0f0f0] overflow-hidden bg-white flex flex-col">
            <div style={{ minHeight: 56, padding: '0 24px', fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.88)', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span>儲值與消耗對比</span>
              <InfoIcon text={'同一張圖比較「玩家儲值進來的錢」與「實際花掉的代幣」。\n儲值高於消耗＝玩家在存錢還沒花；消耗高於儲值＝玩家在花以前存的。'} />
            </div>
            <div style={{ padding: '24px 0 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* 圖例 */}
              <div style={{ display: 'flex', gap: 24, marginBottom: 12, paddingLeft: 52, flexShrink: 0 }}>
                {[{ color: '#9333ea', label: '儲值金額（元）' }, { color: '#10b981', label: '消耗代幣' }].map(({ color, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color }} />
                    {label}
                  </div>
                ))}
              </div>
              {loading ? (
                <div className="flex-1 bg-neutral-50 rounded animate-pulse" style={{ minHeight: 200, margin: '0 8px' }} />
              ) : !c?.bars.length ? (
                <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">暫無資料</div>
              ) : (
                <div ref={lineChartContainerRef} style={{ flex: 1, minHeight: 200, maxHeight: 360 }}>
                  <LineChart
                    data={[
                      ...c.bars.map(b => ({ label: b.label, value: b.recharges, type: '儲值金額（元）' })),
                      ...c.bars.map(b => ({ label: b.label, value: b.sales, type: '消耗代幣' })),
                    ]}
                    xField="label"
                    yField="value"
                    colorField="type"
                    scale={{ color: { range: ['#9333ea', '#10b981'] } } as any}
                    height={lineChartH}
                    autoFit
                    padding={[8, 8, 8, 52]}
                    insetTop={8}
                    axis={{
                      x: { tick: false, line: false, label: { autoRotate: false, style: { fontSize: 12, fill: 'rgba(0,0,0,0.45)' }, formatter: (v: string) => { const n = c.bars.length; if (n === 24) { const h = parseInt(v); return h % 3 === 0 ? String(h) : '' } return v } } },
                      y: { grid: true, tick: false, line: false, label: { style: { fontSize: 12, fill: 'rgba(0,0,0,0.45)' }, formatter: (v: any) => Number(v) >= 10000 ? `${Math.round(Number(v) / 1000)}k` : String(v) } },
                    } as any}
                    legend={false}
                    point={{ size: 3 } as any}
                    tooltip={{ title: (d: any) => d.label, items: [{ channel: 'y', name: (d: any) => d.type }] } as any}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 銷售類別佔比 */}
          <div className="rounded-lg border border-[#f0f0f0] overflow-hidden bg-white">
            <div style={{ minHeight: 56, padding: '0 24px', fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.88)', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
              <span className="flex-1 min-w-0 truncate">銷售類別佔比</span>
              <InfoIcon text={'這段期間各類型商品的銷售額佔比（一番賞／盒玩／轉蛋／抽卡／自製賞）。\n看得出玩家的錢主要花在哪一類。'} />
            </div>
            <div style={{ padding: 24 }}>
              <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.85)' }}>銷售額</span>
              {loading ? (
                <div className="flex items-center justify-center" style={{ height: 340 }}>
                  <div className="w-40 h-40 rounded-full border-[18px] border-neutral-100 animate-pulse" />
                </div>
              ) : !c?.categories.length ? (
                <div className="flex items-center justify-center text-sm text-neutral-400" style={{ height: 340 }}>暫無資料</div>
              ) : (
                <PieChart
                  data={c.categories.map(cat => ({ label: cat.label, amount: cat.amount }))}
                  angleField="amount"
                  colorField="label"
                  innerRadius={0.6}
                  radius={0.75}
                  height={340}
                  autoFit
                  color={COLORS}
                  startAngle={Math.PI * 0.75}
                  endAngle={Math.PI * 2.75}
                  label={{
                    text: (d: any) => `${d.label}: ${d.amount.toLocaleString()}`,
                    position: 'outside',
                    connector: true,
                    style: { fontSize: 12, fill: 'rgba(0,0,0,0.65)' },
                  } as any}
                  legend={false}
                  style={c.categories.length > 1 ? { stroke: '#fff', lineWidth: 2 } as any : undefined}
                />
              )}
            </div>
          </div>

        </div>

        {/* ── 銷售額 & 訪問量（pixel-matched AntD Pro）────────────────────── */}
        <div className="bg-white rounded-lg border border-[#f0f0f0] overflow-hidden">

          {/* AntD-style large tabs */}
          <div className="border-b border-[#f0f0f0]" style={{ padding: '0 16px' }}>
            <div className="flex items-center" style={{ marginBottom: -1 }}>
              {(['sales', 'visits'] as const).map(m => (
                <button key={m} onClick={() => setChartMode(m)}
                  style={{
                    padding: '12px 0',
                    marginRight: 32,
                    fontSize: 16,
                    fontWeight: chartMode === m ? 600 : 400,
                    color: chartMode === m ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.45)',
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    borderBottom: chartMode === m ? '2px solid #1677ff' : '2px solid transparent',
                    background: 'none',
                    cursor: 'pointer',
                    transition: 'color 0.2s',
                  } as React.CSSProperties}>
                  {m === 'sales' ? '銷售額' : '訪問量'}
                </button>
              ))}
              {/* 說明移到 tab 最右邊（老闆 2026-08-21），一次講清楚切換會連動排行 */}
              <div style={{ marginLeft: 'auto', paddingRight: 4 }}>
                <InfoIcon width={320} text={'上方兩個頁籤切換時，左邊的長條圖與右邊的排行榜會一起換：\n・銷售額＝這段期間各廠商被玩家花掉的金額（1G=1元），排行就是廠商銷售額由高到低。\n・訪問量＝各廠商的商品被點進來瀏覽的次數（同一人重複看重複算），排行就是廠商訪問量由高到低。\n兩者都已排除機器人帳號。銷售額高代表真的賺到，訪問量高但銷售額低通常是「看得多、下手少」，要檢查價格或獎品內容。'} />
              </div>
            </div>
          </div>

          {/* Body: chart (2/3) + ranking (1/3) */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr' }}>

            {/* Chart */}
            <div style={{ padding: '16px 0 16px 0', borderRight: '1px solid #f0f0f0' }}>
              {loading ? (
                <div className="flex items-end gap-1.5 mt-6" style={{ height: 300 }}>
                  {[60, 85, 30, 25, 95, 70, 80, 55, 45, 75, 40, 88].map((h, i) => (
                    <div key={i} className="flex-1 bg-neutral-100 rounded-t animate-pulse" style={{ height: `${h}%` }} />
                  ))}
                </div>
              ) : !c?.bars.length ? (
                <div className="flex items-center justify-center text-sm text-neutral-400" style={{ height: 300 }}>暫無資料</div>
              ) : (
                <ColumnChart
                  data={c.bars}
                  xField="label"
                  yField={chartMode}
                  height={330}
                  autoFit
                  style={{ fill: '#1783ff', radius: [4, 4, 0, 0] } as any}
                  padding={[8, 8, 8, 52]}
                  insetTop={16}
                  axis={{
                    x: { tick: false, line: false, label: { autoRotate: false, style: { fontSize: 12, fill: 'rgba(0,0,0,0.45)' }, formatter: (v: string) => { const n = c.bars.length; if (n === 24) { const h = parseInt(v); return h % 3 === 0 ? String(h) : '' } return v } } },
                    y: {
                      grid: true,
                      label: {
                        style: { fontSize: 12, fill: 'rgba(0,0,0,0.45)' },
                        formatter: (v: any) => Number(v) >= 10000 ? `${Math.round(Number(v) / 1000)}k` : String(v),
                      },
                      tick: false,
                      line: false,
                    },
                  } as any}
                  label={false}
                  tooltip={{
                    title: (d: any) => d.label,
                    items: [{ channel: 'y', name: chartMode === 'sales' ? '銷售額' : '訪問量' }],
                  } as any}
                />
              )}
            </div>

            {/* Ranking */}
            <div style={{ padding: '0 32px 32px 32px' }}>
              <h4 style={{ margin: '24px 0 0', fontSize: 14, fontWeight: 500, color: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center' }}>
                <span style={{ flex: 1, minWidth: 0 }}>{chartMode === 'sales' ? '廠商銷售額排名' : '廠商訪問量排名'}</span>
              </h4>
              {loading ? (
                <div style={{ marginTop: 25 }} className="space-y-4">
                  {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-5 bg-neutral-100 rounded animate-pulse" />)}
                </div>
              ) : !c?.suppliers.length ? (
                <div className="flex items-center justify-center text-sm text-neutral-400" style={{ marginTop: 40 }}>暫無資料</div>
              ) : (
                <ul style={{ margin: '25px 0 0', padding: 0, listStyle: 'none' }}>
                  {[...c.suppliers]
                    .sort((a, b) => (chartMode === 'visits' ? (b.visits ?? 0) - (a.visits ?? 0) : b.sales - a.sales))
                    .slice(0, 7)
                    .map((sup, i) => (
                    <li key={sup.id} style={{ display: 'flex', alignItems: 'center', marginTop: 16 }}>
                      <span style={{
                        display: 'inline-block',
                        width: 20, height: 20,
                        marginTop: 1.5, marginRight: 16,
                        fontWeight: 600, fontSize: 12, lineHeight: '20px',
                        textAlign: 'center', borderRadius: 20,
                        flexShrink: 0,
                        ...(i < 3
                          ? { background: 'rgba(0,0,0,0.85)', color: '#fff' }
                          : { background: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.65)' }),
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ flex: 1, marginRight: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 14, color: 'rgba(0,0,0,0.85)' }}
                        title={sup.name}>
                        {sup.name}
                      </span>
                      <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.85)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                        {(chartMode === 'visits' ? (sup.visits ?? 0) : sup.sales).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>
        </div>

        {/* ── 高峰時段（左 24 小時圖 + 右時段排行，獨立一行）────────────── */}
        <div className="bg-white rounded-lg border border-[#f0f0f0] overflow-hidden">
          <div className="border-b border-[#f0f0f0]" style={{ padding: '0 16px' }}>
            <div className="flex items-center" style={{ marginBottom: -1 }}>
              {(['draws', 'visits'] as const).map(m => (
                <button key={m} onClick={() => setPeakMode(m)}
                  style={{
                    padding: '12px 0', marginRight: 32, fontSize: 15,
                    fontWeight: peakMode === m ? 600 : 400,
                    color: peakMode === m ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.45)',
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    borderBottom: peakMode === m ? '2px solid #1677ff' : '2px solid transparent',
                    background: 'none', cursor: 'pointer', transition: 'color 0.2s',
                  } as React.CSSProperties}>
                  {m === 'draws' ? '時段抽獎數' : '時段訪問量'}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', paddingRight: 4 }}>
                <InfoIcon width={320} text={'把這段期間的活動依「當天的第幾個小時」分桶（台灣時間），看一天裡哪幾個時段最熱。\n上方切換：抽獎筆數＝玩家實際掏錢抽的時段熱度；訪問量＝來逛的時段熱度。\n左邊是 0～23 點的分布、右邊是前十個最熱時段。用來決定推播、限時活動、補貨壓在幾點。已排除機器人。'} />
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr' }}>
            {/* 左：24 小時圖 */}
            <div style={{ padding: '24px 32px', borderRight: '1px solid #f0f0f0' }}>
              {loading ? (
                <div className="h-[300px] bg-neutral-50 rounded animate-pulse" />
              ) : !c?.peakHours?.some(h => (peakMode === 'visits' ? h.visits : h.draws) > 0) ? (
                <div className="h-[300px] flex items-center justify-center text-sm text-neutral-400">本期無{peakMode === 'visits' ? '訪問' : '抽獎'}紀錄</div>
              ) : (
                <ColumnChart
                  data={c.peakHours}
                  xField="label"
                  yField={peakMode}
                  height={300}
                  autoFit
                  style={{ fill: peakMode === 'visits' ? '#722ed1' : '#1677ff', opacity: 0.85 } as any}
                  axis={{
                    x: { label: { style: { fontSize: 11, fill: 'rgba(0,0,0,0.45)' }, formatter: (v: string) => (parseInt(v) % 3 === 0 ? v : '') } },
                    y: { labelFormatter: (v: number) => v.toLocaleString() },
                  } as any}
                  tooltip={{ title: (d: any) => d.label, items: [{ channel: 'y', name: peakMode === 'visits' ? '訪問量' : '抽獎筆數' }] } as any}
                />
              )}
            </div>
            {/* 右：時段排行前十 */}
            <div style={{ padding: '0 32px 32px 32px' }}>
              <h4 style={{ margin: '24px 0 0', fontSize: 14, fontWeight: 500, color: 'rgba(0,0,0,0.85)' }}>熱門時段排行（前十）</h4>
              {loading ? (
                <div style={{ marginTop: 25 }} className="space-y-4">
                  {[1,2,3,4,5,6,7,8,9,10].map(i => <div key={i} className="h-5 bg-neutral-100 rounded animate-pulse" />)}
                </div>
              ) : !c?.peakHours?.some(h => (peakMode === 'visits' ? h.visits : h.draws) > 0) ? (
                <div className="flex items-center justify-center text-sm text-neutral-400" style={{ marginTop: 40 }}>暫無資料</div>
              ) : (
                <ul style={{ margin: '25px 0 0', padding: 0, listStyle: 'none' }}>
                  {[...c.peakHours]
                    .sort((a, b) => (peakMode === 'visits' ? b.visits - a.visits : b.draws - a.draws))
                    .slice(0, 10)
                    .map((h, i) => (
                      <li key={h.hour} style={{ display: 'flex', alignItems: 'center', marginTop: 13 }}>
                        <span style={{
                          display: 'inline-block', width: 20, height: 20, marginRight: 16,
                          fontWeight: 600, fontSize: 12, lineHeight: '20px', textAlign: 'center',
                          borderRadius: 20, flexShrink: 0,
                          ...(i < 3 ? { background: 'rgba(0,0,0,0.85)', color: '#fff' } : { background: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.65)' }),
                        }}>{i + 1}</span>
                        <span style={{ flex: 1, marginRight: 8, fontSize: 14, color: 'rgba(0,0,0,0.85)' }}>
                          {h.label}–{String((h.hour + 1) % 24).padStart(2, '0')}:00
                        </span>
                        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.85)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {(peakMode === 'visits' ? h.visits : h.draws).toLocaleString()}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ── 廠商轉化率（環形圖 + 折線圖）────────────────────────────── */}
        <div className="bg-white rounded-lg border border-[#f0f0f0] overflow-hidden">

          {/* Header */}
          <div style={{ minHeight: 56, padding: '0 24px', fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.88)', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
            <span className="flex-1 min-w-0 truncate">廠商轉化率</span>
            <InfoIcon text={'各廠商的抽獎次數佔全站的比重，換算成相對的轉化表現。\n數字高代表看的人比較容易真的抽下去。'} />
          </div>

          {/* Supplier rings — horizontal scroll */}
          <div style={{ overflowX: 'auto', borderBottom: '1px solid #f0f0f0', padding: '20px 24px' }}>
            <div style={{ display: 'flex', gap: 40, minWidth: 'max-content' }}>
              {loading ? (
                [1,2,3,4,5,6].map(i => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div className="w-[76px] h-[76px] rounded-full border-[8px] border-neutral-100 animate-pulse" />
                    <div className="w-16 h-3 bg-neutral-100 rounded animate-pulse mt-1" />
                    <div className="w-12 h-2 bg-neutral-50 rounded animate-pulse" />
                  </div>
                ))
              ) : !c?.suppliers.length ? (
                <div className="text-sm text-neutral-400 py-4">暫無廠商資料</div>
              ) : (
                c.suppliers.map(sup => (
                  <RingProgress key={sup.id} pct={sup.convRate} name={sup.name} draws={sup.draws} />
                ))
              )}
            </div>
          </div>

          {/* Visit vs Draw line chart */}
          <div style={{ padding: '12px 16px 8px' }}>
            <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
              {[{ color: '#1677ff', label: '訪問量' }, { color: '#722ed1', label: '消費筆數' }].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color }} />
                  {label}
                </div>
              ))}
            </div>
            {loading ? (
              <div className="h-[200px] bg-neutral-50 rounded animate-pulse" />
            ) : !c?.bars.length ? (
              <div className="flex items-center justify-center text-sm text-neutral-400" style={{ height: 200 }}>暫無資料</div>
            ) : (
              <LineChart
                data={[
                  ...c.bars.map(b => ({ label: b.label, value: b.visits, type: '訪問量' })),
                  ...c.bars.map(b => ({ label: b.label, value: b.draws, type: '消費筆數' })),
                ]}
                xField="label"
                yField="value"
                colorField="type"
                scale={{ color: { range: ['#1677ff', '#722ed1'] } } as any}
                height={260}
                autoFit
                padding={[4, 8, 4, 40]}
                insetTop={12}
                axis={{
                  x: { tick: false, line: false, label: { autoRotate: false, style: { fontSize: 12, fill: 'rgba(0,0,0,0.45)' }, formatter: (v: string) => { const n = c.bars.length; if (n === 24) { const h = parseInt(v); return h % 3 === 0 ? String(h) : '' } return v } } },
                  y: { grid: true, tick: false, line: false, label: { style: { fontSize: 12, fill: 'rgba(0,0,0,0.45)' }, formatter: (v: any) => Number(v) >= 10000 ? `${Math.round(Number(v) / 1000)}k` : String(v) } },
                } as any}
                legend={false}
                point={{ size: 3 } as any}
                tooltip={{ title: (d: any) => d.label, items: [{ channel: 'y', name: (d: any) => d.type }] } as any}
              />
            )}
          </div>
        </div>

        {/* ── 排行榜 TOP 15（原本掛在儀表板，儀表板改成營運駕駛艙後統一收到這頁）── */}
        <div className="grid grid-cols-3 gap-6">
          <RankingList
            title="熱門商品 TOP 15" limit={15}
            data={(c?.topProducts ?? []).map(p => ({ name: p.name, value: p.value }))}
            extra={<InfoIcon width={300} text={'這段期間被抽最多次的商品。\n可以拿來決定補貨、首頁推薦與選品方向。'} />}
          />
          <RankingList
            title="最多點擊系列 TOP 15" limit={15}
            data={(merged.behavior?.topSeries ?? []).map(x => ({ name: x.series, value: x.count }))}
            extra={<InfoIcon width={300} text={'玩家最常點進去看的系列（IP／品牌）。\n點得多不代表買得多，兩邊差很大時通常是價格或獎品內容的問題。'} />}
          />
          <RankingList
            title="熱門搜尋字 TOP 15" limit={15}
            data={(merged.behavior?.topSearches ?? []).map(x => ({ name: x.query, value: x.count }))}
            extra={<InfoIcon width={300} text={'玩家在站上搜尋的關鍵字。\n有人一直搜卻找不到東西，就是還沒上架的機會。'} />}
          />
        </div>

        {/* ── 轉換概況 ＋ 點擊行為（原「轉換分析」「點擊分析」兩頁併進來）── */}
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-lg border border-[#f0f0f0] bg-white">
            <div className="flex items-center min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
              style={{ color: 'rgba(0,0,0,0.88)' }}>
              <span className="flex-1 min-w-0 truncate">轉換概況</span>
              <InfoIcon width={300} text={'玩家從註冊到掏錢的整體狀況。\n首次付費佔比＝這段期間付費的人裡面，有多少是生平第一次付費（其餘是回頭客）。\n折價券折損只算固定金額的券，打折型的券要看實際訂單才算得出來，另外列出張數。'} />
            </div>
            <div className="p-6 grid grid-cols-2 gap-y-5">
              {[
                { label: '平均每次抽賞', value: merged.overview ? `${merged.overview.avgTokenPerDraw.toLocaleString()} G` : '—' },
                { label: '折價券折損', value: merged.overview ? `${merged.overview.couponDiscountFixed.toLocaleString()} 元` : '—' },
                { label: '累積會員總數', value: merged.overview ? `${merged.overview.totalMembers.toLocaleString()} 人` : '—' },
                {
                  label: '首次付費用戶佔比',
                  value: merged.funnel && merged.funnel.uniquePayers > 0
                    ? `${Math.round(merged.funnel.firstTimePayers / merged.funnel.uniquePayers * 1000) / 10}%`
                    : '—',
                },
                { label: '本期付費人數', value: merged.overview ? `${merged.overview.uniquePayers.toLocaleString()} 人` : '—' },
                { label: '本期參與抽獎人數', value: merged.overview ? `${merged.overview.uniqueDrawers.toLocaleString()} 人` : '—' },
              ].map(x => (
                <div key={x.label}>
                  <p className="text-xs text-neutral-500 mb-1">{x.label}</p>
                  <p className="text-lg font-semibold text-neutral-900">{loading ? '—' : x.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#f0f0f0] bg-white">
            <div className="flex items-center min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
              style={{ color: 'rgba(0,0,0,0.88)' }}>
              <span className="flex-1 min-w-0 truncate">點擊行為</span>
              <InfoIcon width={300} text={'玩家點進商品之後有沒有真的抽。\n點擊後成功抽獎＝同一個人點過某件商品、後來也抽了那件商品。\n轉換率低代表商品頁看得到、但不吸引人下手。\n試試看＝進商品頁按「試試看」試抽的次數與人數，反映好奇與試運氣的熱度。'} />
            </div>
            <div className="p-6 grid grid-cols-2 gap-y-5">
              {[
                { label: '點擊商品數（去重）', value: merged.behavior ? merged.behavior.clickTotal.toLocaleString() : '—' },
                { label: '點擊後成功抽獎', value: merged.behavior ? merged.behavior.converted.toLocaleString() : '—' },
                { label: '點擊→抽獎轉換率', value: merged.behavior ? `${merged.behavior.conversionRate}%` : '—' },
                { label: '新會員付費轉換率', value: merged.funnel ? `${merged.funnel.newUserConversionRate}%` : '—' },
                { label: '試試看次數', value: merged.behavior?.trialTotal != null ? merged.behavior.trialTotal.toLocaleString() : '—' },
                { label: '試試看人數', value: merged.behavior?.trialUsers != null ? merged.behavior.trialUsers.toLocaleString() : '—' },
              ].map(x => (
                <div key={x.label}>
                  <p className="text-xs text-neutral-500 mb-1">{x.label}</p>
                  <p className="text-lg font-semibold text-neutral-900">{loading ? '—' : x.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </AdminLayout>
  )
}
