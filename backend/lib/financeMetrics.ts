const TW_MS = 8 * 3600_000
const NON_REVENUE_PAYMENT_METHODS = new Set(['test', 'promotion', 'compensation'])

export type FinancePeriod = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_7_days' | 'last_30_days'

export function getTaiwanNow(date = new Date()) {
  return new Date(date.getTime() + TW_MS)
}

export function getTaiwanDayStartUtc(date = new Date()) {
  const tw = getTaiwanNow(date)
  return new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate()) - TW_MS)
}

export function getTaiwanYesterdayWindow(date = new Date()) {
  const todayStart = getTaiwanDayStartUtc(date)
  return {
    start: new Date(todayStart.getTime() - 86400_000),
    end: todayStart,
  }
}

export function getFinancePeriodWindow(period: FinancePeriod, date = new Date()) {
  const tw = getTaiwanNow(date)
  const todayStart = getTaiwanDayStartUtc(date)

  switch (period) {
    case 'today':
      return { start: todayStart, end: date }
    case 'yesterday':
      return getTaiwanYesterdayWindow(date)
    case 'this_week': {
      const dow = tw.getUTCDay()
      const daysSinceMonday = dow === 0 ? 6 : dow - 1
      return { start: new Date(todayStart.getTime() - daysSinceMonday * 86400_000), end: date }
    }
    case 'this_month':
      return { start: new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), 1) - TW_MS), end: date }
    case 'last_7_days':
      return { start: new Date(date.getTime() - 7 * 86400_000), end: date }
    case 'last_30_days':
      return { start: new Date(date.getTime() - 30 * 86400_000), end: date }
    default:
      return { start: todayStart, end: date }
  }
}

export function formatTaiwanDate(date: Date, options?: Intl.DateTimeFormatOptions) {
  return new Date(date.getTime() + TW_MS).toLocaleDateString('zh-TW', {
    timeZone: 'UTC',
    ...options,
  })
}

export function formatTaiwanTime(date = new Date()) {
  const tw = getTaiwanNow(date)
  return `${tw.getUTCHours().toString().padStart(2, '0')}:${tw.getUTCMinutes().toString().padStart(2, '0')}`
}

export function isRealRevenueRecharge(record: { payment_method?: string | null }) {
  const method = (record.payment_method ?? '').trim()
  return !NON_REVENUE_PAYMENT_METHODS.has(method)
}

// Fetch bot IDs — smaller set than real users, scales correctly with .not()
async function getBotIds(supabase: any): Promise<string[]> {
  const { data } = await supabase.from('users').select('id').eq('is_bot', true)
  return (data ?? []).map((u: any) => u.id as string)
}

// Kept for callers that still need it (daily-report, etc.)
export async function getRealUserIds(supabase: any): Promise<string[]> {
  const { data } = await supabase
    .from('users')
    .select('id')
    .or('is_bot.is.null,is_bot.eq.false')
  return (data ?? []).map((u: any) => u.id)
}

export async function getRevenueSummaryForPeriod(supabase: any, period: FinancePeriod) {
  const { start, end } = getFinancePeriodWindow(period)
  return getRevenueSummaryForWindow(supabase, period, start, end)
}

export async function getRevenueSummaryForWindow(
  supabase: any,
  period: string,
  start: Date,
  end: Date,
) {
  // Use bot exclusion (.not) instead of real-user inclusion (.in) — scales past 1000 users
  const botIds = await getBotIds(supabase)
  const excBot = (q: any) =>
    botIds.length > 0 ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q

  const [rechargeRes, drawRes] = await Promise.all([
    excBot(
      supabase
        .from('recharge_records')
        .select('amount, payment_method')
        .eq('status', 'success')
    )
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString()),
    excBot(
      supabase
        .from('draw_records')
        .select('user_id, points_used')
    )
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString()),
  ])

  const realRecharges = (rechargeRes.data ?? []).filter(isRealRevenueRecharge)
  const draws = drawRes.data ?? []

  return {
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    totalRechargeTwd:  realRecharges.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0),
    rechargeOrderCount: realRecharges.length,
    drawSpendG:        draws.reduce((s: number, r: any) => s + Number(r.points_used ?? 0), 0),
    drawCount:         draws.length,
    uniquePlayers:     new Set(draws.map((d: any) => d.user_id)).size,
  }
}
