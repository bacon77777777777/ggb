'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import { StatCard, GrowthTag, InfoIcon } from '@/components/analytics/StatCard'

/*
 * 營運儀表板（駕駛艙）
 *
 * 舊版是「交易數據統計」：總儲值、消耗代幣、抽獎數、註冊量再加三個排行榜，
 * 看得出發生什麼事，看不出**該做什麼**。改成由上而下五層，
 * 閱讀順序是「錢 → 玩家 → 玩法 → 賞池／商品 → 現在該處理什麼」：
 *
 *   ① 核心 KPI（兩排八張）
 *   ② 營運趨勢 ＋ 平台健康度
 *   ③ 玩家分析 ＋ 玩法分析
 *   ④ 熱門賞池 ＋ 商品健康度
 *   ⑤ 營運警報 / 行動建議
 *
 * UI 沿用分析頁那一套（老闆指定三頁要長一樣）：`StatCard`／`GrowthTag`／
 * `InfoIcon`、56px 標題列 + 分線的白卡、AntD Charts。這頁不新增任何視覺系統。
 *
 * 資料全部來自 `/api/admin/dashboard-overview` 一支 —— 五層算的是同一批
 * 抽獎與儲值紀錄，拆成多支會把同一份資料撈很多遍，期間邊界也容易各走各的。
 *
 * ⚠️ 樣本不足時（見 API 的 MIN_SAMPLE_DRAWS）分級與趨勢類警報會顯示「資料不足」，
 * 這是刻意的：拿個位數玩家算出來的漲跌是雜訊。畫面上沒有任何 mock data。
 */

const ColumnChart = dynamic(() => import('@ant-design/charts').then(m => ({ default: m.Column })), { ssr: false })
const TinyArea = dynamic(() => import('@ant-design/charts').then(m => ({ default: m.Tiny.Area })), { ssr: false })
const TinyColumn = dynamic(() => import('@ant-design/charts').then(m => ({ default: m.Tiny.Column })), { ssr: false })

type HealthStatus = 'grow' | 'ok' | 'warn' | 'bad' | 'unknown' | 'nobase'
type AlertLevel = 'red' | 'yellow' | 'blue' | 'green'

interface Payload {
  updatedAt: string
  sampleEnough: boolean
  minSample: number
  hasActualFee: boolean
  feeRatePct: number
  kpi: {
    revenue: number; recharge: number; spend: number; draws: number
    activeUsers: number; payingUsers: number; payRate: number; arppu: number
    todayRevenue: number; todayRecharge: number; todaySpend: number; todayDraws: number; todayActive: number
  }
  growth: Record<string, number>
  spark: { x: number; date: string; revenue: number; recharge: number; spend: number; draws: number }[]
  trend: { label: string; revenue: number; recharge: number; spend: number; refund: number }[]
  health: { key: string; label: string; value: string; delta: number; status: HealthStatus; showDelta?: boolean }[]
  systemHealth?: { key: string; label: string; value: string; status: 'ok' | 'warn' | 'bad' }[]
  players: { dau: number; newUsers: number; returning: number; paying: number; payRate: number; arppu: number }
  funnel: { key: string; label: string; users: number; rate: number | null }[]
  playTypes: { type: string; label: string; draws: number; spend: number; players: number; sharePct: number; marginPct: number }[]
  pools: {
    id: string; name: string; label: string; draws: number; spend: number; players: number
    remainPct: number | null; marginPct: number; growth: number | null
    status: 'hot' | 'normal' | 'nearly' | 'cold' | 'unknown'
  }[]
  productHealth: {
    total: number; normal: number; nearlySoldOut: number; soldOut: number; stale: number
    items: { id: string; name: string; reason: string }[]
  }
  alerts: { level: AlertLevel; title: string; detail: string; action: string; href?: string }[]
  alertsTotal: number
}

const toDS = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mondayOf = (d: Date) => { const x = new Date(d); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x }
const sundayOf = (d: Date) => { const x = mondayOf(d); x.setDate(x.getDate() + 6); return x }

/** 白卡外框：56px 標題列 + 分線 + 右側驚嘆號，跟分析頁的「銷售走勢」同一套 */
function Panel({ title, tip, children, extra, className = '' }: {
  title: string; tip: string; children: React.ReactNode; extra?: React.ReactNode; className?: string
}) {
  return (
    <div className={`rounded-lg border border-[#f0f0f0] bg-white flex flex-col ${className}`}>
      <div className="flex items-center gap-2 min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
        style={{ color: 'rgba(0,0,0,0.88)' }}>
        <span className="flex-1 min-w-0 truncate">{title}</span>
        {extra}
        <InfoIcon text={tip} width={300} />
      </div>
      <div className="p-6 flex-1">{children}</div>
    </div>
  )
}

const HEALTH_STYLE: Record<HealthStatus, { label: string; cls: string }> = {
  grow: { label: '成長', cls: 'bg-blue-50 text-blue-600' },
  ok: { label: '正常', cls: 'bg-green-50 text-green-600' },
  warn: { label: '注意', cls: 'bg-amber-50 text-amber-600' },
  bad: { label: '異常', cls: 'bg-red-50 text-red-500' },
  unknown: { label: '資料不足', cls: 'bg-neutral-100 text-neutral-400' },
  nobase: { label: '無前期可比', cls: 'bg-neutral-100 text-neutral-400' },
}

const POOL_STATUS: Record<string, { label: string; cls: string }> = {
  hot: { label: '熱門', cls: 'bg-red-50 text-red-500' },
  normal: { label: '正常', cls: 'bg-green-50 text-green-600' },
  nearly: { label: '即將售罄', cls: 'bg-amber-50 text-amber-600' },
  cold: { label: '低人氣', cls: 'bg-neutral-100 text-neutral-500' },
  unknown: { label: '資料不足', cls: 'bg-neutral-100 text-neutral-400' },
}

const ALERT_STYLE: Record<AlertLevel, { bar: string; dot: string }> = {
  red: { bar: 'bg-red-500', dot: 'text-red-500' },
  yellow: { bar: 'bg-amber-500', dot: 'text-amber-600' },
  blue: { bar: 'bg-blue-500', dot: 'text-blue-600' },
  green: { bar: 'bg-green-500', dot: 'text-green-600' },
}

/** 營運趨勢可切換的四條線 */
const TREND_METRICS = [
  { key: 'revenue', label: '營收', color: '#1677ff' },
  { key: 'recharge', label: '儲值', color: '#722ed1' },
  { key: 'spend', label: '消費', color: '#10b981' },
  { key: 'refund', label: '退款', color: '#f5222d' },
] as const

export default function DashboardPage() {
  const today = useMemo(() => new Date(), [])
  const [startDate, setStartDate] = useState(toDS(today))
  const [endDate, setEndDate] = useState(toDS(today))
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<typeof TREND_METRICS[number]['key']>('revenue')

  // 營運趨勢圖的高度：量測容器實際高度傳給圖表（autoFit 在 flex 容器會量到 0
  // 而畫不出來——老闆 2026-08-21「有數據但沒圖」）。ResizeObserver 跟著右邊
  // 健康度卡變高一起長，達成滿高。
  const trendWrapRef = useRef<HTMLDivElement>(null)
  const [trendH, setTrendH] = useState(280)
  useEffect(() => {
    const el = trendWrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight
      if (h > 0) setTrendH(Math.max(240, h))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const PRESETS = useMemo(() => {
    const y = today.getFullYear(), m = today.getMonth()
    return [
      { label: '今日', start: toDS(today), end: toDS(today) },
      { label: '昨日', start: toDS(new Date(today.getTime() - 86400_000)), end: toDS(new Date(today.getTime() - 86400_000)) },
      { label: '本週', start: toDS(mondayOf(today)), end: toDS(sundayOf(today)) },
      { label: '本月', start: `${y}-${String(m + 1).padStart(2, '0')}-01`, end: toDS(new Date(y, m + 1, 0)) },
      { label: '本年', start: `${y}-01-01`, end: `${y}-12-31` },
    ]
  }, [today])
  const activePreset = PRESETS.find(p => p.start === startDate && p.end === endDate)?.label

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/admin/dashboard-overview?start=${startDate}&end=${endDate}`, { credentials: 'include' })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || '載入失敗')
      setData(json)
    } catch (e: any) {
      setError(e.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  const k = data?.kpi
  const g = data?.growth
  const spark = data?.spark ?? []
  const hasSpark = (f: 'revenue' | 'recharge' | 'spend' | 'draws') => spark.some(s => s[f] > 0)
  const updatedAt = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '—'
  const currentMetric = TREND_METRICS.find(m => m.key === metric)!

  return (
    <AdminLayout pageTitle="營運儀表板">
      <div className="space-y-5">

        {/* ── 工具列：最後更新靠左，期間／日期／刷新靠右（同分析頁的一整行）── */}
        <div className="flex items-center gap-2">
          <div className="mr-auto flex items-center gap-1.5 text-sm text-neutral-500 whitespace-nowrap">
            最後更新
            <span className="text-neutral-800">{updatedAt}</span>
          </div>
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
          <div className="min-w-0 shrink">
            <DateRangePicker
              startDate={startDate} endDate={endDate}
              onStartDateChange={setStartDate} onEndDateChange={setEndDate}
              placeholder="自訂日期"
            />
          </div>
          <button onClick={fetchData} title="刷新"
            className="h-9 w-9 flex items-center justify-center border border-neutral-200 rounded-lg bg-white hover:bg-neutral-50 transition-colors">
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
            {/* ── ① 核心 KPI ─────────────────────────────────────────────── */}
            {/* 錢那排放迷你圖（看趨勢），人那排放同比標籤（看比較）——
                StatCard 中段只有 46px，兩者塞不下，各取所需 */}
            <div className="grid grid-cols-4 gap-6">
              <StatCard
                title="總營收" loading={loading} skeletonWidth="w-32"
                titleExtra={<InfoIcon width={300} text={'玩家儲值進來的錢，扣掉金流公司抽走的手續費之後，平台實際收到的金額。\n抽獎不算在這裡 —— 錢是在儲值那一刻進來的，抽獎只是把已經收到的 G 換成商品。'} />}
                value={`${(k?.revenue ?? 0).toLocaleString()} G幣`}
                mid={!loading && hasSpark('revenue') ? (
                  <TinyArea data={spark} xField="x" yField="revenue" height={46} autoFit
                    style={{ fill: 'rgba(22,119,255,0.25)', stroke: '#1677ff', lineWidth: 2, shape: 'smooth' } as any}
                    axis={false} padding={[2, 0, 0, 0]}
                    tooltip={{ title: (d: any) => d.date, items: [{ channel: 'y', name: '總營收' }] } as any} />
                ) : <div className="w-full h-full" />}
                footerLabel="今日" footerValue={(k?.todayRevenue ?? 0).toLocaleString()}
              />
              <StatCard
                title="儲值金額" loading={loading} skeletonWidth="w-32"
                titleExtra={<InfoIcon width={300} text={'這段期間玩家儲值進來的總金額，手續費還沒扣。\n只算付款成功的，已排除機器人帳號。'} />}
                value={`${(k?.recharge ?? 0).toLocaleString()} 元`}
                mid={!loading && hasSpark('recharge') ? (
                  <TinyArea data={spark} xField="x" yField="recharge" height={46} autoFit
                    style={{ fill: 'rgba(114,46,209,0.25)', stroke: '#722ed1', lineWidth: 2, shape: 'smooth' } as any}
                    axis={false} padding={[2, 0, 0, 0]}
                    tooltip={{ title: (d: any) => d.date, items: [{ channel: 'y', name: '儲值金額' }] } as any} />
                ) : <div className="w-full h-full" />}
                footerLabel="今日" footerValue={(k?.todayRecharge ?? 0).toLocaleString()}
              />
              <StatCard
                title="消費金額" loading={loading} skeletonWidth="w-32"
                titleExtra={<InfoIcon width={300} text={'玩家實際花在抽獎上的 G 幣（1G = 1 元）。\n跟儲值不一樣：儲值是把錢放進來，這裡是真的花掉。'} />}
                value={`${(k?.spend ?? 0).toLocaleString()} G幣`}
                mid={!loading && hasSpark('spend') ? (
                  <TinyArea data={spark} xField="x" yField="spend" height={46} autoFit
                    style={{ fill: 'rgba(16,185,129,0.25)', stroke: '#10b981', lineWidth: 2, shape: 'smooth' } as any}
                    axis={false} padding={[2, 0, 0, 0]}
                    tooltip={{ title: (d: any) => d.date, items: [{ channel: 'y', name: '消費金額' }] } as any} />
                ) : <div className="w-full h-full" />}
                footerLabel="今日" footerValue={(k?.todaySpend ?? 0).toLocaleString()}
              />
              <StatCard
                title="抽獎次數" loading={loading} skeletonWidth="w-20"
                titleExtra={<InfoIcon width={300} text={'這段期間玩家抽了幾次，抽一次算一次。\n這是抽獎平台最要緊的量體指標 —— 比「消費筆數」更能看出玩家有沒有在玩。'} />}
                value={(k?.draws ?? 0).toLocaleString()}
                mid={!loading && hasSpark('draws') ? (
                  <TinyColumn data={spark} xField="x" yField="draws" height={46} autoFit
                    style={{ fill: '#1677ff', opacity: 0.85 } as any} axis={false} padding={0}
                    tooltip={{ title: (d: any) => d.date, items: [{ channel: 'y', name: '抽獎次數' }] } as any} />
                ) : <div className="w-full h-full" />}
                footerLabel="今日" footerValue={(k?.todayDraws ?? 0).toLocaleString()}
              />
            </div>

            <div className="grid grid-cols-4 gap-6">
              <StatCard
                title="活躍用戶" loading={loading} skeletonWidth="w-20"
                titleExtra={<InfoIcon width={300} text={'這段期間有做過任何事的會員人數（逛過、抽過或儲值過），同一個人只算一次。\n沒登入的訪客算在下面「玩家分析」的訪問人數，不算在這裡。'} />}
                value={`${(k?.activeUsers ?? 0).toLocaleString()} 人`}
                mid={g && <GrowthTag value={g.activeUsers} label="期間同比" />}
                footerLabel="今日活躍" footerValue={`${(k?.todayActive ?? 0).toLocaleString()} 人`}
              />
              <StatCard
                title="付費用戶" loading={loading} skeletonWidth="w-20"
                titleExtra={<InfoIcon width={300} text={'這段期間真的花 G 抽過獎的會員人數，同一個人只算一次。\n只是逛逛沒抽的不算。'} />}
                value={`${(k?.payingUsers ?? 0).toLocaleString()} 人`}
                mid={g && <GrowthTag value={g.payingUsers} label="期間同比" />}
                footerLabel="活躍用戶" footerValue={`${(k?.activeUsers ?? 0).toLocaleString()} 人`}
              />
              <StatCard
                title="付費率" loading={loading} skeletonWidth="w-16"
                titleExtra={<InfoIcon width={300} text={'付費用戶 ÷ 活躍用戶。\n來的人裡面有多少比例真的掏錢玩，越高代表商品與價格越對得上玩家胃口。'} />}
                value={`${(k?.payRate ?? 0)}%`}
                mid={g && <GrowthTag value={g.payRate} label="期間同比" />}
                footerLabel="付費 / 活躍" footerValue={`${(k?.payingUsers ?? 0).toLocaleString()} / ${(k?.activeUsers ?? 0).toLocaleString()}`}
              />
              <StatCard
                title="ARPPU" loading={loading} skeletonWidth="w-24"
                titleExtra={<InfoIcon width={300} text={'每位付費用戶平均花多少＝消費金額 ÷ 付費用戶。\n人數沒變但這個數字掉下來，代表大戶變少了。'} />}
                value={`${(k?.arppu ?? 0).toLocaleString()} G幣`}
                mid={g && <GrowthTag value={g.arppu} label="期間同比" />}
                footerLabel="消費金額" footerValue={`${(k?.spend ?? 0).toLocaleString()} G幣`}
              />
            </div>

            {/* ── ② 營運趨勢 ＋ 平台健康度 ────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-6">
              <Panel
                title="營運趨勢"
                tip={'這段期間的走勢。上面四個字可以切換要看哪一項：\n營收＝儲值扣掉手續費；儲值＝玩家放進來的錢；消費＝玩家花掉的 G；退款＝已經退出去的錢。\n沒有交易的時段一樣會列出來、顯示 0，才看得出哪幾天是掛零的。'}
                extra={
                  <div className="flex gap-1">
                    {TREND_METRICS.map(m => (
                      <button key={m.key} onClick={() => setMetric(m.key)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          metric === m.key
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'
                        }`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                }
              >
                {/* h-full：讓圖撐滿卡片高度 —— 右邊健康度卡加了系統健康四燈變高，
                    grid 會把這張卡拉到一樣高，圖要跟著滿高才不會下方留一塊白
                    （老闆 2026-08-21）。min-h 保底，autoFit 吃滿容器 */}
                <div ref={trendWrapRef} className="h-full min-h-[280px]">
                  {loading ? (
                    <div className="h-full bg-neutral-50 rounded animate-pulse" />
                  ) : !data?.trend.length ? (
                    <div className="h-full flex items-center justify-center text-sm text-neutral-400">本期無資料</div>
                  ) : (
                    <ColumnChart height={trendH} data={data.trend} xField="label" yField={metric}
                      style={{ fill: currentMetric.color, opacity: 0.85 } as any}
                      axis={{ y: { labelFormatter: (v: number) => v.toLocaleString() } }}
                      tooltip={{ title: (d: any) => d.label, items: [{ channel: 'y', name: currentMetric.label }] } as any} />
                  )}
                </div>
              </Panel>

              <Panel
                title="平台健康度"
                tip={'六個面向各自亮燈，不合成一個總分 —— 總分的加權是人訂的，掉了幾分也解釋不清楚。\n綠＝正常、藍＝成長、黃＝注意、紅＝異常。\n退款率與毛利率看絕對值，其餘看跟前一段同樣長度期間的漲跌。\n毛利率是廠商分潤比與金流費率決定的固定比例，不會自己漲跌，所以不顯示同比。\n抽獎筆數太少會顯示「資料不足」；上一段期間完全沒有資料則顯示「無前期可比」。'}
              >
                {loading ? (
                  <div className="space-y-3">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-9 bg-neutral-50 rounded animate-pulse" />)}</div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {(data?.health ?? []).map(h => (
                      <div key={h.key} className="flex items-center py-3 first:pt-0 last:pb-0">
                        <span className="text-sm text-neutral-600 w-24 shrink-0">{h.label}</span>
                        <span className="text-sm font-semibold text-neutral-900 flex-1">{h.value}</span>
                        {h.status !== 'unknown' && h.status !== 'nobase' && h.showDelta !== false && (
                          <span className={`text-xs mr-3 ${h.delta >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {h.delta >= 0 ? '▲' : '▼'} {Math.abs(h.delta)}%
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-md shrink-0 ${HEALTH_STYLE[h.status].cls}`}>
                          {HEALTH_STYLE[h.status].label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 系統健康四燈（RLS / 限流 / 金流環境 / 維護）—— 老闆 2026-08-21。
                    跟業務健康共用同一套燈色，但獨立一區、上面一條分隔線 */}
                {(data?.systemHealth?.length ?? 0) > 0 && (
                  <div className="mt-4 pt-4 border-t border-neutral-100">
                    <div className="text-[11px] font-semibold text-neutral-400 mb-2">系統設定健康</div>
                    <div className="divide-y divide-neutral-100">
                      {data!.systemHealth!.map(h => (
                        <div key={h.key} className="flex items-center py-2.5 first:pt-0 last:pb-0">
                          <span className="text-sm text-neutral-600 w-24 shrink-0">{h.label}</span>
                          <span className="text-xs text-neutral-500 flex-1 pr-2">{h.value}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-md shrink-0 ${HEALTH_STYLE[h.status].cls}`}>
                            {HEALTH_STYLE[h.status].label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </div>

            {/* ── ③ 玩家分析 ＋ 玩法分析 ──────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-6">
              <Panel
                title="玩家分析"
                tip={'上半是這段期間的玩家組成，下半是從逛到付錢的四個關卡。\n回流＝以前就註冊、上一段期間沒來、這段期間又回來玩的人。\n每一關右邊的百分比是「從上一關走到這一關」的比例；追蹤資料不齊時顯示「—」，不會硬給數字。'}
              >
                <div className="grid grid-cols-3 gap-y-4 pb-5 mb-5 border-b border-neutral-100">
                  {[
                    { label: '今日活躍', value: data?.players.dau },
                    { label: '新增會員', value: data?.players.newUsers },
                    { label: '回流會員', value: data?.players.returning },
                    { label: '付費會員', value: data?.players.paying },
                    { label: '付費率', value: data?.players.payRate, suffix: '%' },
                    { label: 'ARPPU', value: data?.players.arppu, suffix: ' G' },
                  ].map(x => (
                    <div key={x.label}>
                      <p className="text-xs text-neutral-500 mb-1">{x.label}</p>
                      <p className="text-lg font-semibold text-neutral-900">
                        {loading ? '—' : `${(x.value ?? 0).toLocaleString()}${x.suffix ?? ''}`}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2.5">
                  {(data?.funnel ?? []).map((f, i) => {
                    const max = Math.max(1, ...(data?.funnel ?? []).map(x => x.users))
                    const w = Math.max(4, Math.round(f.users / max * 100))
                    return (
                      <div key={f.key} className="flex items-center gap-3">
                        <span className="text-xs text-neutral-500 w-16 shrink-0">{f.label}</span>
                        <div className="flex-1 h-6 bg-neutral-50 rounded overflow-hidden">
                          <div className="h-full bg-primary/80 rounded" style={{ width: `${w}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-neutral-900 w-14 text-right shrink-0">
                          {f.users.toLocaleString()}
                        </span>
                        <span className="text-xs text-neutral-500 w-14 text-right shrink-0">
                          {i === 0 ? '' : f.rate == null ? '—' : `${f.rate}%`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Panel>

              <Panel
                title="類別分析"
                tip={'玩家的錢花在哪一種玩法上。長條的長度是消費金額佔比。\n每種玩法的毛利率都由「廠商分潤比」決定、彼此一樣，所以不逐列列出 —— 看「平台健康度」那一欄就好。'}
              >
                {loading ? (
                  <div className="space-y-4">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-neutral-50 rounded animate-pulse" />)}</div>
                ) : (
                  <div className="space-y-4">
                    {(data?.playTypes ?? []).map(p => (
                      <div key={p.type}>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-sm text-neutral-700 w-16 shrink-0">{p.label}</span>
                          <div className="flex-1 h-5 bg-neutral-50 rounded overflow-hidden">
                            <div className="h-full bg-primary/80 rounded" style={{ width: `${Math.max(2, p.sharePct)}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-neutral-900 w-14 text-right shrink-0">{p.sharePct}%</span>
                        </div>
                        <p className="text-xs text-neutral-400 pl-[76px]">
                          {p.draws.toLocaleString()} 抽・{p.spend.toLocaleString()} G・{p.players.toLocaleString()} 人
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* ── ④ 熱門賞池 ＋ 商品健康度 ────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-6">
              <Panel
                title="熱門賞池"
                tip={'這段期間消費金額最高的十件商品。\n剩餘＝還沒被抽走的份數比例；同比＝跟前一段同樣長度的期間相比，上一期沒有資料就顯示「—」。\n狀態：庫存看得出來就先講庫存；熱門／低人氣要抽數夠多才敢說，不然顯示「資料不足」。'}
              >
                {loading ? (
                  <div className="space-y-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-neutral-50 rounded animate-pulse" />)}</div>
                ) : !data?.pools.length ? (
                  <div className="h-[220px] flex items-center justify-center text-sm text-neutral-400">本期無消費紀錄</div>
                ) : (
                  <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-neutral-500 border-b border-neutral-100">
                          <th className="text-left font-normal py-2">賞池</th>
                          <th className="text-right font-normal py-2 px-2 whitespace-nowrap">抽數</th>
                          <th className="text-right font-normal py-2 px-2 whitespace-nowrap">消費</th>
                          <th className="text-right font-normal py-2 px-2 whitespace-nowrap">剩餘</th>
                          <th className="text-right font-normal py-2 px-2 whitespace-nowrap">同比</th>
                          <th className="text-right font-normal py-2 whitespace-nowrap">狀態</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.pools.map(p => (
                          <tr key={p.id} className="border-b border-neutral-50 last:border-0">
                            <td className="py-2 pr-2">
                              <Link href={`/products/${p.id}`} className="text-neutral-900 hover:text-primary line-clamp-1">{p.name}</Link>
                              <span className="text-xs text-neutral-400">{p.label}・{p.players.toLocaleString()} 人</span>
                            </td>
                            <td className="text-right tabular-nums px-2">{p.draws.toLocaleString()}</td>
                            <td className="text-right tabular-nums px-2">{p.spend.toLocaleString()}</td>
                            <td className="text-right tabular-nums px-2">{p.remainPct == null ? '—' : `${p.remainPct}%`}</td>
                            <td className={`text-right tabular-nums px-2 ${p.growth == null ? 'text-neutral-400' : p.growth >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                              {p.growth == null ? '—' : `${p.growth >= 0 ? '+' : ''}${p.growth}%`}
                            </td>
                            <td className="text-right whitespace-nowrap">
                              <span className={`text-xs px-2 py-0.5 rounded-md ${POOL_STATUS[p.status].cls}`}>
                                {POOL_STATUS[p.status].label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel
                title="商品健康度"
                tip={'全站商品的庫存狀況，不是庫存明細，只看整體健不健康。\n即將售罄＝剩餘一成以下；滯銷＝上架滿 30 天、近 30 天一次都沒被抽過。\n下面列出需要處理的，點名稱可以直接進商品頁。'}
              >
                <div className="grid grid-cols-4 gap-y-4 pb-5 mb-5 border-b border-neutral-100">
                  {[
                    { label: '商品總數', value: data?.productHealth.total, cls: 'text-neutral-900' },
                    { label: '正常販售', value: data?.productHealth.normal, cls: 'text-green-600' },
                    { label: '即將售罄', value: data?.productHealth.nearlySoldOut, cls: 'text-amber-600' },
                    { label: '已售罄', value: data?.productHealth.soldOut, cls: 'text-neutral-500' },
                  ].map(x => (
                    <div key={x.label}>
                      <p className="text-xs text-neutral-500 mb-1">{x.label}</p>
                      <p className={`text-lg font-semibold ${x.cls}`}>{loading ? '—' : (x.value ?? 0).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                {!data?.productHealth.items.length ? (
                  <p className="text-sm text-neutral-400 py-4 text-center">目前沒有需要處理的商品</p>
                ) : (
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                    {data.productHealth.items.map(it => (
                      <div key={`${it.id}-${it.reason}`} className="flex items-center gap-2 text-sm">
                        <Link href={`/products/${it.id}`} className="flex-1 min-w-0 truncate text-neutral-700 hover:text-primary">{it.name}</Link>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 shrink-0">{it.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* ── ⑤ 營運警報 / 行動建議 ───────────────────────────────────── */}
            <Panel
              title="營運警報"
              tip={'把數字翻成「現在該做什麼」。紅＝立刻處理、黃＝要注意、藍＝一般資訊、綠＝值得把握的機會。\n庫存類警報照事實直接發；漲跌類要抽獎筆數夠多才會出現，樣本太小時只會看到一則藍色說明。'}
            >
              {loading ? (
                <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-14 bg-neutral-50 rounded animate-pulse" />)}</div>
              ) : !data?.alerts.length ? (
                <p className="text-sm text-neutral-400 py-6 text-center">目前沒有需要處理的事項</p>
              ) : (
                <div className="space-y-3">
                  {data.alerts.map((a, i) => (
                    <div key={i} className="flex gap-3">
                      <span className={`w-1 rounded-full shrink-0 ${ALERT_STYLE[a.level].bar}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">{a.title}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">{a.detail}</p>
                        <p className={`text-xs mt-1 ${ALERT_STYLE[a.level].dot}`}>建議：{a.action}</p>
                      </div>
                      {a.href && (
                        <Link href={a.href}
                          className="self-center text-xs text-primary hover:underline whitespace-nowrap shrink-0">
                          前往處理 →
                        </Link>
                      )}
                    </div>
                  ))}
                  {data.alertsTotal > data.alerts.length && (
                    <p className="text-xs text-neutral-400 pt-1">
                      另有 {data.alertsTotal - data.alerts.length} 則優先度較低的提醒未列出
                    </p>
                  )}
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
