'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'

// ── Dynamic chart imports (Canvas, no SSR) ────────────────────────────────────

const TinyArea = dynamic(
  () => import('@ant-design/charts').then(m => ({ default: m.Tiny.Area })),
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

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ['#1677ff', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899']

// ── Tiny sparkline wrapper ────────────────────────────────────────────────────

function Spark({ data, yField, stroke, fill }: { data: any[]; yField: string; stroke: string; fill: string }) {
  if (data.length < 2) return <div style={{ width: 80, height: 36 }} />
  return (
    <div style={{ width: 80, height: 36 }}>
      <TinyArea
        data={data}
        xField="x"
        yField={yField}
        height={36}
        autoFit={false}
        width={80}
        style={{ fill, stroke, lineWidth: 1.5, shape: 'smooth' } as any}
        axis={false}
        tooltip={false}
        padding={[2, 2, 2, 2]}
      />
    </div>
  )
}

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

// ── Growth tag ────────────────────────────────────────────────────────────────

function GrowthTag({ value, label }: { value: number; label?: string }) {
  const up = value >= 0
  return (
    <span className="inline-flex items-center gap-0.5 text-xs">
      <span className={up ? 'text-emerald-600' : 'text-red-500'}>
        {up ? '↑' : '↓'} {Math.abs(value)}%
      </span>
      {label && <span className="text-neutral-400">{label}</span>}
    </span>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  current: {
    totalSales: number; totalDrawCount: number; totalRecharges: number; totalVisits: number
    todaySales: number; todayDrawCount: number; todayVisits: number
    yesterdaySales: number; yesterdayDrawCount: number; yesterdayVisits: number
    convRate: number
    bars: { label: string; sales: number; draws: number }[]
    spark: { x: number; sales: number; draws: number }[]
    keywords: { rank: number; keyword: string; count: number; growth: number }[]
    categories: { type: string; label: string; count: number; amount: number }[]
    suppliers: { id: string; name: string; rank: number; draws: number; sales: number; salesPct: number; drawsPct: number; convRate: number }[]
  }
  growth: {
    sales: number; draws: number; recharges: number; visits: number
    salesToday: number; drawsToday: number; visitsToday: number; convRate: number
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsOverviewPage() {
  const today = useMemo(() => new Date(), [])
  const [startDate, setStartDate] = useState(() =>
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  )
  const [endDate, setEndDate] = useState(() => toDS(today))
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartMode, setChartMode] = useState<'sales' | 'draws'>('sales')

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

  const c = data?.current
  const g = data?.growth

  const PRESETS = useMemo(() => [
    { label: '今日', start: toDS(today), end: toDS(today) },
    { label: '本週', start: toDS(mondayOf(today)), end: toDS(today) },
    { label: '本月', start: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, end: toDS(today) },
    { label: '本年', start: `${today.getFullYear()}-01-01`, end: toDS(today) },
  ], [today])

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

        {/* ── KPI Cards ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-neutral-200 grid grid-cols-4 divide-x divide-neutral-100">

          {/* 總銷售額 */}
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-neutral-500 mb-1">總銷售額</p>
                <p className="text-2xl font-bold text-neutral-900 font-mono">
                  {loading ? '—' : (c?.totalSales ?? 0).toLocaleString()}
                  <span className="text-sm font-normal text-neutral-400 ml-1">幣</span>
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs mb-3">
              {g && <GrowthTag value={g.sales} label="上期" />}
              {g && <GrowthTag value={g.salesToday} label="日同比" />}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-neutral-400">日銷售額</p>
                <p className="text-sm font-medium text-neutral-700 font-mono">{loading ? '—' : (c?.todaySales ?? 0).toLocaleString()}</p>
              </div>
              {!loading && <Spark data={spark} yField="sales" stroke="#1677ff" fill="rgba(22,119,255,0.12)" />}
            </div>
          </div>

          {/* 訪問量 */}
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-neutral-500 mb-1">訪問量</p>
                <p className="text-2xl font-bold text-neutral-900 font-mono">
                  {loading ? '—' : (c?.totalVisits ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs mb-3">
              {g && <GrowthTag value={g.visits} label="上期" />}
              {g && <GrowthTag value={g.visitsToday} label="日同比" />}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-neutral-400">今日訪問</p>
                <p className="text-sm font-medium text-neutral-700 font-mono">{loading ? '—' : (c?.todayVisits ?? 0).toLocaleString()}</p>
              </div>
              <div className="w-20 h-9 flex items-center justify-end">
                <span className={`text-2xl font-bold ${(g?.visitsToday ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {(g?.visitsToday ?? 0) >= 0 ? '↑' : '↓'}
                </span>
              </div>
            </div>
          </div>

          {/* 消費筆數 */}
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-neutral-500 mb-1">消費筆數（抽獎）</p>
                <p className="text-2xl font-bold text-neutral-900 font-mono">
                  {loading ? '—' : (c?.totalDrawCount ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs mb-3">
              {g && <GrowthTag value={g.draws} label="上期" />}
              {g && <GrowthTag value={g.drawsToday} label="日同比" />}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-neutral-400">轉化率</p>
                <p className="text-sm font-medium text-neutral-700 font-mono">{loading ? '—' : `${c?.convRate ?? 0}%`}</p>
              </div>
              {!loading && <Spark data={spark} yField="draws" stroke="#8b5cf6" fill="rgba(139,92,246,0.12)" />}
            </div>
          </div>

          {/* 總儲值金額 */}
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-neutral-500 mb-1">總儲值金額</p>
                <p className="text-2xl font-bold text-neutral-900 font-mono">
                  {loading ? '—' : `NT$${(c?.totalRecharges ?? 0).toLocaleString()}`}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs mb-3">
              {g && <GrowthTag value={g.recharges} label="上期" />}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-neutral-400">客單價</p>
                <p className="text-sm font-medium text-neutral-700 font-mono">
                  {loading ? '—' : (c?.totalDrawCount ? Math.round(c.totalSales / c.totalDrawCount) : 0).toLocaleString()}
                  <span className="text-xs text-neutral-400 ml-1">幣/次</span>
                </p>
              </div>
              {!loading && (
                <Spark
                  data={spark.map(d => ({ ...d, rev: Math.round(d.sales * 0.4) }))}
                  yField="rev"
                  stroke="#f59e0b"
                  fill="rgba(245,158,11,0.12)"
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Keywords + Donut ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-5">

          {/* 線上熱門搜尋 */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4">線上熱門搜尋</h3>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-neutral-100 rounded animate-pulse" />)}
              </div>
            ) : !c?.keywords.length ? (
              <div className="flex items-center justify-center h-32 text-sm text-neutral-400">暫無搜尋記錄</div>
            ) : (
              <div>
                <div className="grid grid-cols-[24px_1fr_60px_60px] gap-2 text-xs text-neutral-400 pb-2 border-b border-neutral-100 mb-2">
                  <span>#</span><span>關鍵字</span>
                  <span className="text-right">次數</span><span className="text-right">同比</span>
                </div>
                {c.keywords.map(kw => (
                  <div key={kw.rank} className="grid grid-cols-[24px_1fr_60px_60px] gap-2 items-center py-2 border-b border-neutral-50 last:border-0">
                    <span className={`text-xs font-mono font-bold ${kw.rank <= 3 ? 'text-primary' : 'text-neutral-300'}`}>{kw.rank}</span>
                    <span className="text-sm text-neutral-700 truncate">{kw.keyword}</span>
                    <span className="text-sm font-medium text-neutral-800 font-mono text-right">{kw.count.toLocaleString()}</span>
                    <div className="text-right"><GrowthTag value={kw.growth} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 銷售類別佔比 */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4">銷售類別佔比</h3>
            {loading ? (
              <div className="flex items-center justify-center h-44">
                <div className="w-32 h-32 rounded-full border-[14px] border-neutral-100 animate-pulse" />
              </div>
            ) : !c?.categories.length ? (
              <div className="flex items-center justify-center h-44 text-sm text-neutral-400">暫無資料</div>
            ) : (
              <div className="flex items-center gap-4">
                <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                  <PieChart
                    data={c.categories.map(cat => ({ label: cat.label, amount: cat.amount }))}
                    angleField="amount"
                    colorField="label"
                    innerRadius={0.68}
                    radius={0.9}
                    height={160}
                    autoFit={false}
                    width={160}
                    color={COLORS}
                    label={false}
                    legend={false}
                    style={{ stroke: '#fff', lineWidth: 2 } as any}
                  />
                </div>
                <div className="space-y-2.5 flex-1 min-w-0">
                  {c.categories.map((cat, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-neutral-500 truncate flex-1">{cat.label}</span>
                      <span className="font-medium text-neutral-800 font-mono">{cat.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!loading && !!c?.categories.length && (
              <div className="mt-4 pt-4 border-t border-neutral-100 grid grid-cols-2 gap-2">
                {c.categories.map((cat, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">{cat.label}</span>
                    <span className="font-mono text-neutral-700">{cat.count} 次</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Supplier bar + ranking ────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-800">廠商銷售概覽</h3>
            <div className="flex items-center gap-1">
              {(['sales', 'draws'] as const).map(m => (
                <button key={m} onClick={() => setChartMode(m)}
                  className={`h-7 px-3 text-xs rounded-md border transition-colors ${
                    chartMode === m
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'
                  }`}>
                  {m === 'sales' ? '銷售額' : '消費筆數'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_260px] gap-6">
            <div>
              {loading ? (
                <div className="h-[200px] flex items-end gap-1 px-4">
                  {[40, 70, 55, 80, 45, 60, 35, 75, 50, 65, 45, 30].map((h, i) => (
                    <div key={i} className="flex-1 bg-neutral-100 rounded-t animate-pulse" style={{ height: `${h}%` }} />
                  ))}
                </div>
              ) : !c?.bars.length ? (
                <div className="flex items-center justify-center h-[200px] text-sm text-neutral-400">暫無資料</div>
              ) : (
                <ColumnChart
                  data={c.bars}
                  xField="label"
                  yField={chartMode === 'sales' ? 'sales' : 'draws'}
                  height={200}
                  autoFit
                  style={{ fill: chartMode === 'sales' ? '#1677ff' : '#10b981', radius: [3, 3, 0, 0], opacity: 0.85 } as any}
                  axis={{
                    x: { label: { style: { fontSize: 9, fill: '#9ca3af' } }, tick: false, line: false },
                    y: {
                      grid: true,
                      gridLine: { style: { stroke: '#f3f4f6', lineDash: [0] } },
                      label: {
                        style: { fontSize: 9, fill: '#9ca3af' },
                        formatter: (v: any) => chartMode === 'sales' && Number(v) >= 10000 ? `${Math.round(Number(v) / 1000)}k` : String(v),
                      },
                      tick: false,
                      line: false,
                    },
                  } as any}
                  label={false}
                />
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-3">廠商銷售排行</p>
              <div className="space-y-2">
                {loading ? (
                  [1,2,3,4,5].map(i => <div key={i} className="h-8 bg-neutral-100 rounded animate-pulse" />)
                ) : !c?.suppliers.length ? (
                  <p className="text-xs text-neutral-400">暫無資料</p>
                ) : (
                  c.suppliers.slice(0, 7).map(sup => (
                    <div key={sup.id}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-4 text-center font-bold ${sup.rank <= 3 ? 'text-primary' : 'text-neutral-300'}`}>{sup.rank}</span>
                          <span className="text-neutral-700 truncate max-w-[120px]">{sup.name}</span>
                        </div>
                        <span className="font-mono text-neutral-600">
                          {chartMode === 'sales'
                            ? (sup.sales >= 10000 ? `${(sup.sales / 1000).toFixed(1)}k` : sup.sales.toLocaleString())
                            : sup.draws.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${chartMode === 'sales' ? sup.salesPct : sup.drawsPct}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Supplier conversion rings ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-neutral-800">廠商轉化率</h3>
            <p className="text-xs text-neutral-400 mt-0.5">各廠商銷售佔比</p>
          </div>
          {loading ? (
            <div className="flex gap-6 flex-wrap">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="w-[76px] h-[76px] rounded-full bg-neutral-100 animate-pulse" />
                  <div className="w-16 h-3 bg-neutral-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : !c?.suppliers.length ? (
            <div className="flex items-center justify-center h-24 text-sm text-neutral-400">暫無廠商資料</div>
          ) : (
            <div className="flex gap-6 flex-wrap">
              {c.suppliers.map(sup => (
                <RingProgress key={sup.id} pct={sup.convRate} name={sup.name} draws={sup.draws} />
              ))}
            </div>
          )}
        </div>

      </div>
    </AdminLayout>
  )
}
