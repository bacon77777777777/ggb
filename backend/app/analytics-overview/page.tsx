'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'

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
  { ssr: false, loading: () => <div className="h-[200px] bg-neutral-50 rounded animate-pulse" /> }
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

// ── Info icon (藍色驚嘆號 tooltip) ────────────────────────────────────────────

function InfoIcon({ text }: { text: string }) {
  const [show, setShow] = React.useState(false)
  return (
    <div className="relative flex-shrink-0" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold cursor-help select-none leading-none">!</div>
      {show && (
        <div className="absolute right-0 top-5 w-56 bg-neutral-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl z-50 leading-relaxed whitespace-normal pointer-events-none">
          {text}
        </div>
      )}
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
    keywords: { rank: number; keyword: string; count: number; growth: number }[]
    categories: { type: string; label: string; count: number; amount: number }[]
    suppliers: { id: string; name: string; rank: number; draws: number; sales: number; salesPct: number; drawsPct: number; convRate: number }[]
  }
  growth: {
    sales: number; draws: number; recharges: number; visits: number
    salesToday: number; drawsToday: number; visitsToday: number; rechargesToday: number; convRate: number
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

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (startDate) p.set('start', startDate)
      if (endDate) p.set('end', endDate)
      const res = await fetch(`/api/admin/analytics-overview?${p}`)
      if (res.ok) setData(await res.json())
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
      { label: '本週', start: toDS(mondayOf(today)), end: toDS(sundayOf(today)) },
      { label: '本月', start: `${y}-${String(m + 1).padStart(2, '0')}-01`, end: toDS(monthEnd) },
      { label: '本年', start: `${y}-01-01`, end: `${y}-12-31` },
    ]
  }, [today])

  const activePreset = PRESETS.find(p => p.start === startDate && p.end === endDate)?.label

  const spark = c?.spark ?? []

  return (
    <AdminLayout pageTitle="分析頁">
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
              總儲值金額
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
              總銷售額
            </div>
            <div style={{ padding: '20px 24px 8px' }}>
              <div className="relative w-full">
                <div className="h-[38px] text-[30px] leading-[38px] overflow-hidden whitespace-nowrap"
                  style={{ color: 'rgba(0,0,0,0.88)' }}>
                  {loading ? <span className="inline-block w-32 h-7 bg-neutral-100 rounded animate-pulse" /> :
                    `${(c?.totalSales ?? 0).toLocaleString()} 幣`}
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
              消費筆數
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
              訪問量
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
              <InfoIcon text="同時展示儲值金額與代幣消耗量。儲值高於消耗代表用戶在囤幣；消耗高於儲值代表用戶在花存量。" />
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
              銷售類別佔比
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
            <div className="flex" style={{ marginBottom: -1 }}>
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
                  height={300}
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
              <h4 style={{ margin: '24px 0 0', fontSize: 14, fontWeight: 500, color: 'rgba(0,0,0,0.85)' }}>
                廠商銷售額排名
              </h4>
              {loading ? (
                <div style={{ marginTop: 25 }} className="space-y-4">
                  {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-5 bg-neutral-100 rounded animate-pulse" />)}
                </div>
              ) : !c?.suppliers.length ? (
                <div className="flex items-center justify-center text-sm text-neutral-400" style={{ marginTop: 40 }}>暫無資料</div>
              ) : (
                <ul style={{ margin: '25px 0 0', padding: 0, listStyle: 'none' }}>
                  {c.suppliers.slice(0, 7).map((sup, i) => (
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
                        {sup.sales.toLocaleString()}
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
            廠商轉化率
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
                height={200}
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

      </div>
    </AdminLayout>
  )
}
