import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
  formatTaiwanDate,
  getTaiwanMonthStartUtc,
  getTaiwanNow,
  getTaiwanYesterdayWindow,
  isRealRevenueRecharge,
} from '@/lib/financeMetrics'
import { getSettlementDefaults } from '@/lib/settlementRates'
import { createLinePusher } from '@/lib/linePush'
const pushLine = createLinePusher('line_push_daily')

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

/**
 * 吉吉比 早報（每天 08:00，報昨天）
 *
 * 2026-09-02 改版（老闆定案）：口徑全面對齊新儀表板 ——
 *   ・營收＝昨天玩家花掉的 G（毛營收）；「儲值」只算真金過綠界
 *   ・毛利＝真實毛利：消費 − 廠商分潤（逐抽套各廠商實際費率）− 綠界實扣手續費
 *     ＋ 交易所手續費 ＋ 運費收入 − 運費實付（按單按通路費率）
 *   ・排版一行一個數據、行長壓在手機不折行的範圍；前日比只掛營收與儲值
 *   ・回收／退款是「異常才出現」：回收率 >10% 或昨天有退款才進 ⚠️ 注意
 *   ・待處理同樣有才出現，一切乾淨時整段消失，訊息越短越好
 */

/** 回收率超過這個 % 才在早報示警 */
const RECYCLE_WARN_PCT = 10

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

/** 前日比：（+12%）／（-5%）。前一天是 0 沒得比，回空字串不掛尾巴 */
function cmp(cur: number, prev: number) {
  if (prev <= 0) return ''
  const d = Math.round((cur - prev) / prev * 100)
  return `（${d >= 0 ? '+' : ''}${d}%）`
}

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()

    const { start: yestStart, end: yestEnd } = getTaiwanYesterdayWindow()
    const dayBeforeStart = new Date(yestStart.getTime() - 86400_000)
    /* 月累計以昨日所在的月為準、上界切在昨天結束（沿用 2026-09-01 修正，
       換月當天報的就是上個月完整月結，凌晨的交易不會提前入帳） */
    const monthStart = getTaiwanMonthStartUtc(yestStart)

    const { data: botRows } = await supabase.from('users').select('id').eq('is_bot', true)
    const botIds = (botRows ?? []).map((r: any) => r.id as string)
    const excBot = (q: any) => botIds.length > 0 ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q
    const inW = (q: any, a: Date, b: Date) => q.gte('created_at', a.toISOString()).lt('created_at', b.toISOString())

    const drawSel = 'user_id, tokens_spent, product:products(price, supplier_id)'
    const rechSel = 'user_id, amount, payment_method, payment_fee'

    const [
      drawsY, drawsD2, drawsMonth,
      rechY, rechD2,
      eventsY, eventsD2,
      newUserRows,
      mktFeeY, shipAdjY, shipOrdersY,
      dismantledAll, refundsY,
      suppliers, settle,
      { count: pendingShipments },
      { count: lowInventory },
      { count: pendingRefunds },
      { count: pendingSettlements },
      { count: pendingReview },
    ] = await Promise.all([
      inW(excBot(supabase.from('draw_records').select(drawSel)), yestStart, yestEnd),
      inW(excBot(supabase.from('draw_records').select(drawSel)), dayBeforeStart, yestStart),
      inW(excBot(supabase.from('draw_records').select('tokens_spent, product:products(price)')), monthStart, yestEnd),
      inW(excBot(supabase.from('recharge_records').select(rechSel).eq('status', 'success')), yestStart, yestEnd),
      inW(excBot(supabase.from('recharge_records').select(rechSel).eq('status', 'success')), dayBeforeStart, yestStart),
      inW(supabase.from('user_events').select('user_id').not('user_id', 'is', null), yestStart, yestEnd),
      inW(supabase.from('user_events').select('user_id').not('user_id', 'is', null), dayBeforeStart, yestStart),
      inW(supabase.from('users').select('id').or('is_bot.eq.false,is_bot.is.null'), yestStart, yestEnd),
      inW(supabase.from('marketplace_transactions').select('fee'), yestStart, yestEnd),
      inW(excBot(supabase.from('token_adjustments').select('delta').eq('category', 'shipping_fee')), yestStart, yestEnd),
      inW(supabase.from('orders').select('status, logistics_type'), yestStart, yestEnd),
      // 回收整表撈（量小），發生時間 COALESCE(dismantled_at, created_at) 在 JS 端過濾
      excBot(supabase.from('draw_records').select('created_at, dismantled_at, refund_amount, user_id').eq('status', 'dismantled')),
      supabase.from('refund_requests').select('amount_twd, processed_at')
        .gte('processed_at', yestStart.toISOString()).lt('processed_at', yestEnd.toISOString()),
      supabase.from('suppliers').select('id, profit_share_percent'),
      getSettlementDefaults(supabase),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('products').select('id', { count: 'exact', head: true }).gt('total_count', 0).lte('remaining', 3).neq('status', 'archived'),
      supabase.from('refund_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('settlement_snapshots').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase.from('recharge_records').select('id', { count: 'exact', head: true }).eq('needs_review', true).eq('status', 'pending'),
    ])

    // ── 昨日成績 ────────────────────────────────────────────────────────
    const amt = (r: any) => Number(r.tokens_spent ?? r.product?.price ?? 0)
    const rowsY: any[] = drawsY.data ?? []
    const rowsD2: any[] = drawsD2.data ?? []

    const spendY = rowsY.reduce((s: number, r: any) => s + amt(r), 0)
    const spendD2 = rowsD2.reduce((s: number, r: any) => s + amt(r), 0)
    const drawCount = rowsY.length
    const aov = drawCount > 0 ? Math.round(spendY / drawCount) : 0

    const realY: any[] = (rechY.data ?? []).filter(isRealRevenueRecharge)
    const realD2: any[] = (rechD2.data ?? []).filter(isRealRevenueRecharge)
    const rechargeY = realY.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)
    const rechargeD2 = realD2.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)

    // 真實毛利（與儀表板同式）
    const shareOf = new Map<string, number>((suppliers.data ?? []).map((sp: any) =>
      [String(sp.id), sp.profit_share_percent == null ? settle.supplierShare : Number(sp.profit_share_percent)]))
    const supplierCost = rowsY.reduce((s: number, r: any) => {
      const share = shareOf.get(String(r.product?.supplier_id ?? '')) ?? settle.supplierShare
      return s + amt(r) * share / 100
    }, 0)
    const feeY = realY.reduce((s: number, r: any) => s + Number(r.payment_fee ?? 0), 0)
    const mktFee = (mktFeeY.data ?? []).reduce((s: number, r: any) => s + Number(r.fee ?? 0), 0)
    const shipIncome = -(shipAdjY.data ?? []).reduce((s: number, r: any) => s + Number(r.delta ?? 0), 0)
    const SHIP_STATUS = new Set(['shipping', 'delivered', 'completed'])
    const shipCost = (shipOrdersY.data ?? [])
      .filter((o: any) => SHIP_STATUS.has(String(o.status))).length * 60
    const grossProfit = Math.round(spendY - supplierCost - feeY + mktFee + shipIncome - shipCost)
    const grossPct = spendY > 0 ? Math.round(grossProfit / spendY * 1000) / 10 : 0

    // ── 人 ──────────────────────────────────────────────────────────────
    const botSet = new Set(botIds)
    const idsOf = (rows: any[]) => rows.map((r: any) => String(r.user_id ?? '')).filter(id => id && !botSet.has(id))
    const activeY = new Set<string>([...idsOf(eventsY.data ?? []), ...idsOf(rowsY), ...idsOf(rechY.data ?? [])])
    const activeD2 = new Set<string>([...idsOf(eventsD2.data ?? []), ...idsOf(rowsD2), ...idsOf(rechD2.data ?? [])])
    const payersY = new Set(idsOf(rowsY)).size
    const payRate = activeY.size > 0 ? Math.round(payersY / activeY.size * 100) : 0
    const newIds = new Set((newUserRows.data ?? []).map((r: any) => String(r.id)))
    const returning = [...activeY].filter(id => !activeD2.has(id) && !newIds.has(id)).length

    // ── 月累計 ──────────────────────────────────────────────────────────
    const monthSpend = (drawsMonth.data ?? []).reduce((s: number, r: any) => s + amt(r), 0)
    // 月儲值另撈會多一趟：realY 是昨天的，月累計用月區間重算（沿用真金過濾）
    const rechargeMonth = await inW(
      excBot(supabase.from('recharge_records').select('amount, payment_method').eq('status', 'success')),
      monthStart, yestEnd,
    )
    const monthRecharge = (rechargeMonth.data ?? []).filter(isRealRevenueRecharge)
      .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)

    // ── ⚠️ 注意（有才出現）────────────────────────────────────────────────
    const disAt = (r: any) => new Date(r.dismantled_at ?? r.created_at).getTime()
    const recycleY = (dismantledAll.data ?? [])
      .filter((r: any) => disAt(r) >= yestStart.getTime() && disAt(r) < yestEnd.getTime())
      .reduce((s: number, r: any) => s + Number(r.refund_amount ?? 0), 0)
    const recyclePct = spendY > 0 ? Math.round(recycleY / spendY * 100) : 0
    const refundRows: any[] = refundsY.data ?? []
    const refundAmt = refundRows.reduce((s: number, r: any) => s + Number(r.amount_twd ?? 0), 0)

    const warnLines: string[] = []
    if (spendY > 0 && recyclePct > RECYCLE_WARN_PCT) warnLines.push(`• 回收率 ${recyclePct}% 偏高`)
    if (refundRows.length > 0) warnLines.push(`• 退款 ${refundRows.length} 筆 NT$ ${fmt(refundAmt)}`)

    // ── 待處理（有才出現）────────────────────────────────────────────────
    const pendingLines: string[] = []
    if ((pendingShipments   ?? 0) > 0) pendingLines.push(`• 待配送 ${pendingShipments} 筆`)
    if ((lowInventory       ?? 0) > 0) pendingLines.push(`• 低庫存 ${lowInventory} 件`)
    if ((pendingRefunds     ?? 0) > 0) pendingLines.push(`• 待審退款 ${pendingRefunds} 筆`)
    if ((pendingSettlements ?? 0) > 0) pendingLines.push(`• 廠商月結 ${pendingSettlements} 份`)
    if ((pendingReview      ?? 0) > 0) pendingLines.push(`• 待複核儲值 ${pendingReview} 筆`)

    // ── 組訊息（一行一個數據，行長壓在手機不折行的範圍）──────────────────
    const yestLabel = formatTaiwanDate(yestStart, { month: 'long', day: 'numeric', weekday: 'short' })
    const twYest = getTaiwanNow(yestStart)
    const monthLabel = twYest.getUTCFullYear() !== getTaiwanNow().getUTCFullYear()
      ? formatTaiwanDate(yestStart, { year: 'numeric', month: 'long' })
      : formatTaiwanDate(yestStart, { month: 'long' })

    const lines = [
      `📊 ${yestLabel} 早報`,
      ``,
      `昨日成績`,
      `• 營收 ${fmt(spendY)} G${cmp(spendY, spendD2)}`,
      `• 毛利 ${fmt(grossProfit)} G（${grossPct}%）`,
      `• 儲值 NT$ ${fmt(rechargeY)}${cmp(rechargeY, rechargeD2)}`,
      `• 抽獎 ${fmt(drawCount)} 次`,
      `• 每抽均價 ${fmt(aov)} G`,
      `• 活躍 ${fmt(activeY.size)} 人`,
      `• 付費 ${fmt(payersY)} 人（${payRate}%）`,
      `• 新增會員 ${fmt(newIds.size)} 人`,
      `• 回流 ${fmt(returning)} 人`,
      ``,
      `${monthLabel}累計`,
      `• 營收 ${fmt(monthSpend)} G`,
      `• 儲值 NT$ ${fmt(monthRecharge)}`,
    ]
    if (warnLines.length > 0) lines.push(``, `⚠️ 注意`, ...warnLines)
    if (pendingLines.length > 0) lines.push(``, `待處理`, ...pendingLines)

    await pushLine(lines.join('\n'))

    return NextResponse.json({
      ok: true, date: yestLabel,
      spendY, grossProfit, grossPct, rechargeY, drawCount, aov,
      active: activeY.size, payers: payersY, newUsers: newIds.size, returning,
      monthSpend, monthRecharge, recyclePct, refunds: refundRows.length,
    })
  } catch (e: any) {
    console.error('[daily-report] error:', e)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
