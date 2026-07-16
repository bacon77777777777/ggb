'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/AdminLayout'
import DatePicker from '@/components/DatePicker'

// ── Chart helpers ─────────────────────────────────────────────────────────────

function sparkPath(data: number[], w: number, h: number) {
  if (data.length < 2) return { line: '', area: '' }
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const step = w / (data.length - 1)
  const pts = data.map((v, i) => {
    const x = i * step
    const y = h - 4 - ((v - min) / range) * (h - 8)
    return [+(x.toFixed(1)), +(y.toFixed(1))]
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const area = [
    ...pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`),
    `L${pts[pts.length - 1][0]},${h}`,
    `L0,${h}`,
    'Z',
  ].join(' ')
  return { line, area }
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899']

// ── Sub-components ────────────────────────────────────────────────────────────

let _sparkId = 0
function Sparkline({ data, color = '#3b82f6', h = 40, w = 100 }: { data: number[]; color?: string; h?: number; w?: number }) {
  const [uid] = useState(() => `sg-${++_sparkId}`)
  if (!data.length) return <svg width={w} height={h} />
  const { line, area } = sparkPath(data, w, h)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${uid})`} />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />}
    </svg>
  )
}

function DonutChart({ categories }: { categories: { label: string; amount: number }[] }) {
  const total = categories.reduce((s, c) => s + c.amount, 0)
  const R = 50, CX = 60, CY = 60, circ = 2 * Math.PI * R
  let cum = 0
  return (
    <div className="flex items-center gap-5">
      <div style={{ minWidth: 120 }}>
        <svg width={120} height={120} viewBox="0 0 120 120">
          {total === 0 ? (
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f0f0f0" strokeWidth="14" />
          ) : (
            categories.map((c, i) => {
              const frac = c.amount / total
              const dashLen = frac * circ
              const dashOffset = -cum * circ
              cum += frac
              return (
                <circle key={i}
                  cx={CX} cy={CY} r={R}
                  fill="none"
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth="14"
                  strokeDasharray={`${dashLen} ${circ}`}
                  strokeDashoffset={dashOffset}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px` }}
                />
              )
            })
          )}
          <text x={CX} y={CY - 5} textAnchor="middle" fontSize="10" fill="#9ca3af">總計</text>
          <text x={CX} y={CY + 10} textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">{total.toLocaleString()}</text>
        </svg>
      </div>
      <div className="space-y-2 flex-1 min-w-0">
        {categories.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-neutral-500 truncate flex-1">{c.label}</span>
            <span className="font-medium text-neutral-800 font-mono">{c.amount.toLocaleString()}</span>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-xs text-neutral-400">暫無資料</p>
        )}
      </div>
    </div>
  )
}

function BarChart({ bars, mode }: { bars: { label: string; sales: number; draws: number }[]; mode: 'sales' | 'draws' }) {
  if (!bars.length) return <div className="flex items-center justify-center h-48 text-sm text-neutral-400">暫無資料</div>
  const values = bars.map(b => mode === 'sales' ? b.sales : b.draws)
  const max = Math.max(...values, 1)
  const W = 560, H = 160, barW = Math.max(6, Math.min(32, (W / bars.length) - 4))
  const colW = W / bars.length
  const color = mode === 'sales' ? '#3b82f6' : '#10b981'
  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H + 28} viewBox={`0 0 ${W} ${H + 28}`} style={{ minWidth: W }}>
        {[0, 0.25, 0.5, 0.75, 1].map(p => {
          const y = H - p * H
          return (
            <g key={p}>
              <line x1={0} y1={y} x2={W} y2={y} stroke="#f3f4f6" strokeWidth="1" />
              {p > 0 && (
                <text x={-4} y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">
                  {mode === 'sales'
                    ? (max * p >= 10000 ? `${Math.round(max * p / 1000)}k` : Math.round(max * p))
                    : Math.round(max * p)}
                </text>
              )}
            </g>
          )
        })}
        {bars.map((b, i) => {
          const v = mode === 'sales' ? b.sales : b.draws
          const barH = (v / max) * H
          const x = i * colW + (colW - barW) / 2
          const y = H - barH
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} fill={color} rx="2" opacity="0.85" />
              {bars.length <= 20 && (
                <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="9" fill="#9ca3af">
                  {b.label}
                </text>
              )}
              {bars.length > 20 && i % 5 === 0 && (
                <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="9" fill="#9ca3af">
                  {b.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function RingProgress({ pct, name, draws }: { pct: number; name: string; draws: number }) {
  const R = 30, circ = 2 * Math.PI * R
  const dash = Math.min(pct / 100, 1) * circ
  const colors = pct >= 60 ? '#3b82f6' : pct >= 30 ? '#10b981' : '#f59e0b'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-[76px] h-[76px]">
        <svg width={76} height={76} viewBox="0 0 76 76">
          <circle cx={38} cy={38} r={R} fill="none" stroke="#f3f4f6" strokeWidth="8" />
          <circle cx={38} cy={38} r={R} fill="none" stroke={colors} strokeWidth="8"
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

// ── Growth indicator ──────────────────────────────────────────────────────────

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
    totalSales: number
    totalDrawCount: number
    totalRecharges: number
    totalVisits: number
    todaySales: number
    todayDrawCount: number
    todayVisits: number
    yesterdaySales: number
    yesterdayDrawCount: number
    yesterdayVisits: number
    convRate: number
    bars: { label: string; sales: number; draws: number }[]
    keywords: { rank: number; keyword: string; count: number; growth: number }[]
    categories: { type: string; label: string; count: number; amount: number }[]
    suppliers: { id: string; name: string; rank: number; draws: number; sales: number; salesPct: number; drawsPct: number; convRate: number }[]
  }
  growth: {
    sales: number
    draws: number
    recharges: number
    visits: number
    salesToday: number
    drawsToday: number
    visitsToday: number
    convRate: number
  }
}

type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsOverviewPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartMode, setChartMode] = useState<'sales' | 'draws'>('sales')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ period })
      if (period === 'custom' && customStart && customEnd) {
        params.set('start', customStart)
        params.set('end', customEnd)
      }
      const res = await fetch(`/api/admin/analytics-overview?${params}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [period, customStart, customEnd])

  useEffect(() => { fetchData() }, [fetchData])

  const c = data?.current
  const g = data?.growth

  const salesSpark = c?.bars.map(b => b.sales) ?? []
  const drawsSpark = c?.bars.map(b => b.draws) ?? []

  const PERIODS: { id: Period; label: string }[] = [
    { id: 'today', label: '今日' },
    { id: 'week', label: '本週' },
    { id: 'month', label: '本月' },
    { id: 'year', label: '本年' },
  ]

  const PERIOD_LABELS: Record<Period, string> = {
    today: '昨日',
    week: '上週',
    month: '上月',
    year: '去年',
    custom: '上期',
  }
  const prevLabel = PERIOD_LABELS[period]

  return (
    <AdminLayout pageTitle="分析頁">
      <div className="space-y-5">

        {/* ── Period selector ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`h-8 px-3 text-sm rounded-lg border transition-colors ${
                period === p.id
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setPeriod('custom')}
            className={`h-8 px-3 text-sm rounded-lg border transition-colors ${
              period === 'custom'
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
            }`}
          >
            自訂
          </button>
          {period === 'custom' && (
            <>
              <div className="w-32">
                <DatePicker value={customStart} onChange={setCustomStart} placeholder="開始日期" />
              </div>
              <span className="text-neutral-300 text-xs">—</span>
              <div className="w-32">
                <DatePicker value={customEnd} onChange={setCustomEnd} placeholder="結束日期" />
              </div>
            </>
          )}
          <button
            onClick={fetchData}
            className="h-8 w-8 flex items-center justify-center border border-neutral-200 rounded-lg bg-white hover:bg-neutral-50 transition-colors"
            title="刷新"
          >
            <svg className={`w-4 h-4 text-neutral-500 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
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
              {g && <GrowthTag value={g.sales} label={prevLabel} />}
              {g && <GrowthTag value={g.salesToday} label="日同比" />}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-neutral-400">日銷售額</p>
                <p className="text-sm font-medium text-neutral-700 font-mono">{loading ? '—' : (c?.todaySales ?? 0).toLocaleString()}</p>
              </div>
              <Sparkline data={salesSpark} color="#3b82f6" w={80} h={36} />
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
              {g && <GrowthTag value={g.visits} label={prevLabel} />}
              {g && <GrowthTag value={g.visitsToday} label="日同比" />}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-neutral-400">今日訪問</p>
                <p className="text-sm font-medium text-neutral-700 font-mono">{loading ? '—' : (c?.todayVisits ?? 0).toLocaleString()}</p>
              </div>
              <div className="w-20 h-9 flex items-center justify-end">
                <div className={`text-2xl font-bold font-mono ${(g?.visitsToday ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {(g?.visitsToday ?? 0) >= 0 ? '↑' : '↓'}
                </div>
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
              {g && <GrowthTag value={g.draws} label={prevLabel} />}
              {g && <GrowthTag value={g.drawsToday} label="日同比" />}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-neutral-400">轉化率</p>
                <p className="text-sm font-medium text-neutral-700 font-mono">{loading ? '—' : `${c?.convRate ?? 0}%`}</p>
              </div>
              <Sparkline data={drawsSpark} color="#8b5cf6" w={80} h={36} />
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
              {g && <GrowthTag value={g.recharges} label={prevLabel} />}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-neutral-400">客單價</p>
                <p className="text-sm font-medium text-neutral-700 font-mono">
                  {loading ? '—' : (c?.totalDrawCount ? Math.round(c.totalSales / c.totalDrawCount) : 0).toLocaleString()}
                  <span className="text-xs text-neutral-400 ml-1">幣/次</span>
                </p>
              </div>
              <Sparkline data={salesSpark.map(v => v * 0.4)} color="#f59e0b" w={80} h={36} />
            </div>
          </div>
        </div>

        {/* ── Keywords + Donut ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-5">
          {/* 線上熱門搜尋 */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4">線上熱門搜尋</h3>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-8 bg-neutral-100 rounded animate-pulse" />
                ))}
              </div>
            ) : c?.keywords.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-neutral-400">暫無搜尋記錄</div>
            ) : (
              <div className="space-y-0">
                <div className="grid grid-cols-[24px_1fr_60px_60px] gap-2 text-xs text-neutral-400 pb-2 border-b border-neutral-100 mb-2">
                  <span>#</span>
                  <span>關鍵字</span>
                  <span className="text-right">搜尋次數</span>
                  <span className="text-right">同比</span>
                </div>
                {c?.keywords.map(kw => (
                  <div key={kw.rank} className="grid grid-cols-[24px_1fr_60px_60px] gap-2 items-center py-2 border-b border-neutral-50 last:border-0">
                    <span className={`text-xs font-mono font-bold ${kw.rank <= 3 ? 'text-primary' : 'text-neutral-300'}`}>{kw.rank}</span>
                    <span className="text-sm text-neutral-700 truncate">{kw.keyword}</span>
                    <span className="text-sm font-medium text-neutral-800 font-mono text-right">{kw.count.toLocaleString()}</span>
                    <div className="text-right">
                      <GrowthTag value={kw.growth} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 銷售類別佔比 */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4">銷售類別佔比</h3>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-24 h-24 rounded-full border-8 border-neutral-100 animate-pulse" />
              </div>
            ) : (
              <DonutChart categories={c?.categories ?? []} />
            )}
            {!loading && c && c.categories.length > 0 && (
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

        {/* ── Supplier Bar Chart + Ranking ─────────────────────────────────── */}
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
            {/* Bar chart */}
            <div>
              {loading ? (
                <div className="h-48 flex items-end gap-2 px-4">
                  {[40, 70, 55, 80, 45, 60, 35, 75, 50, 65, 45, 30].map((h, i) => (
                    <div key={i} className="flex-1 bg-neutral-100 rounded-t animate-pulse" style={{ height: `${h}%` }} />
                  ))}
                </div>
              ) : (
                <BarChart bars={c?.bars ?? []} mode={chartMode} />
              )}
            </div>
            {/* Ranking list */}
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-3">廠商銷售排行</p>
              <div className="space-y-2">
                {loading ? (
                  [1,2,3,4,5].map(i => <div key={i} className="h-8 bg-neutral-100 rounded animate-pulse" />)
                ) : c?.suppliers.length === 0 ? (
                  <p className="text-xs text-neutral-400">暫無資料</p>
                ) : (
                  c?.suppliers.slice(0, 7).map(sup => (
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
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${chartMode === 'sales' ? sup.salesPct : sup.drawsPct}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Supplier Conversion Rate ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-800">廠商轉化率</h3>
              <p className="text-xs text-neutral-400 mt-0.5">各廠商銷售佔比</p>
            </div>
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
          ) : c?.suppliers.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-neutral-400">暫無廠商資料</div>
          ) : (
            <div className="flex gap-6 flex-wrap">
              {c?.suppliers.map(sup => (
                <RingProgress key={sup.id} pct={sup.convRate} name={sup.name} draws={sup.draws} />
              ))}
            </div>
          )}
        </div>

      </div>
    </AdminLayout>
  )
}
