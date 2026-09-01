import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
  formatTaiwanDate,
  getRevenueSummaryForWindow,
  getTaiwanMonthStartUtc,
  getTaiwanNow,
  getTaiwanYesterdayWindow,
  isRealRevenueRecharge,
} from '@/lib/financeMetrics'
import { createLinePusher } from '@/lib/linePush'
const pushLine = createLinePusher('line_push_daily')

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''


function fmt(n: number) {
  return n.toLocaleString('en-US')
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
    /*
     * 月累計的月份**以昨日為準**，不是以發報當天為準（老闆 2026-09-01）。
     *
     * 早報從頭到尾都在講昨天，月份當然要跟著昨天走。而且以前用
     * `getFinancePeriodWindow('this_month')`（＝今天所在的月）搭配「昨天結束」
     * 當上界，**每個月 1 號兩端會夾成空區間**：9/1 那天是
     * [9/1 00:00, 9/1 00:00) → 撈不到任何一筆 → 報成 NT$ 0。
     * 實例：9/1 早報寫「本月累計儲值 NT$ 0」，八月實際是 NT$ 617,600。
     * 八月是第一個真的有儲值的月份，所以這個洞到現在才被看見。
     */
    const monthStart = getTaiwanMonthStartUtc(yestStart)

    // 用 bot exclusion（.not）取代 real-user inclusion（.in）— 避免用戶數超過 1000 時截斷
    const { data: botRows } = await supabase.from('users').select('id').eq('is_bot', true)
    const botIds = (botRows ?? []).map((r: any) => r.id as string)
    const excBot = (q: any) => botIds.length > 0 ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q

    const [
      revenueYest,
      newUsersRes,
      rechargeMonth,
      { count: pendingShipments },
      { count: lowInventory },
      { count: pendingRefunds },
      { count: pendingSettlements },
      { count: pendingReview },
    ] = await Promise.all([
      getRevenueSummaryForWindow(supabase, 'yesterday', yestStart, yestEnd),
      supabase.from('users').select('id', { count: 'exact', head: true })
        .or('is_bot.eq.false,is_bot.is.null')
        .gte('created_at', yestStart.toISOString()).lt('created_at', yestEnd.toISOString()),
      /*
       * 上界切在**昨天結束**，跟上面的「昨日數據」同一個切點（老闆 2026-08-31 回報）。
       *
       * 原本是 `>= 月初` 但沒有上界 —— 等於算到「發報當下」。凌晨進來的儲值
       * 當天早上就被算進月累計，但它屬於今天、要隔天才會出現在「昨日儲值」，
       * 於是看起來像「昨天多了十萬，月累計卻沒動」。
       * 實例：08-30 00:11 的 100,000 在 8/30 的報表裡已經計入月累計 617,600，
       * 而 8/31 的報表才把它列進昨日儲值。
       *
       * 對齊之後這條式子才成立：該月累計 = 那個月每天「昨日儲值」的總和。
       * 換月當天（9/1 報 8/31）算出來的就是八月的完整月結。
       */
      excBot(supabase.from('recharge_records').select('amount, payment_method').eq('status', 'success'))
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', yestEnd.toISOString()),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('products').select('id', { count: 'exact', head: true }).gt('total_count', 0).lte('remaining', 3).neq('status', 'archived'),
      supabase.from('refund_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('settlement_snapshots').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase.from('recharge_records').select('id', { count: 'exact', head: true }).eq('needs_review', true).eq('status', 'pending'),
    ])

    const totalRecharge = revenueYest.totalRechargeTwd
    const totalSpent    = revenueYest.drawSpendG
    const drawCount     = revenueYest.drawCount
    const uniquePlayers = revenueYest.uniquePlayers
    const newUsers      = newUsersRes.count ?? 0
    const monthTotal    = (rechargeMonth.data ?? []).filter(isRealRevenueRecharge).reduce((s: number, r: any) => s + Number(r.amount), 0)

    const yestLabel = formatTaiwanDate(yestStart, { month: 'long', day: 'numeric', weekday: 'short' })
    /*
     * 月累計那行的標題：平常只寫月份（「8月累計儲值」），跟開頭的「8月31日週一」一致。
     * **只有跨年那天帶年份** —— 1/1 的早報報的是去年 12/31，寫「12月累計儲值」
     * 會被當成今年的十二月。判斷式直接比昨日與今日的台灣年份，不用寫死日期。
     */
    const twYest = getTaiwanNow(yestStart)
    const monthLabel = twYest.getUTCFullYear() !== getTaiwanNow().getUTCFullYear()
      ? formatTaiwanDate(yestStart, { year: 'numeric', month: 'long' })   // 2025年12月
      : formatTaiwanDate(yestStart, { month: 'long' })                    // 8月

    const pendingLines: string[] = []
    if ((pendingShipments  ?? 0) > 0) pendingLines.push(`• 待配送 ${pendingShipments} 筆`)
    if ((lowInventory      ?? 0) > 0) pendingLines.push(`• 低庫存 ${lowInventory} 件`)
    if ((pendingRefunds    ?? 0) > 0) pendingLines.push(`• 待審退款 ${pendingRefunds} 筆`)
    if ((pendingSettlements ?? 0) > 0) pendingLines.push(`• 廠商月結 ${pendingSettlements} 份`)
    if ((pendingReview     ?? 0) > 0) pendingLines.push(`• 待複核儲值 ${pendingReview} 筆`)

    const lines = [
      `吉吉比 早報｜${yestLabel}`,
      ``,
      `昨日數據`,
      `• 儲值：NT$ ${fmt(totalRecharge)}`,
      `• 抽獎消費：${fmt(totalSpent)} G`,
      `• 抽獎次數：${fmt(drawCount)} 次`,
      `• 參與玩家：${fmt(uniquePlayers)} 人`,
      `• 新增會員：${fmt(newUsers)} 人`,
      /* 月累計獨立成一段：混在「昨日數據」底下會被讀成昨天的數字（老闆 2026-09-01） */
      ``,
      `• ${monthLabel}累計儲值：NT$ ${fmt(monthTotal)}`,
      ``,
      pendingLines.length > 0
        ? `待處理\n${pendingLines.join('\n')}`
        : `✓ 目前無待處理事項`,
    ]

    await pushLine(lines.join('\n'))

    return NextResponse.json({ ok: true, date: yestLabel, totalRecharge, totalSpent, drawCount, uniquePlayers, newUsers, monthTotal })
  } catch (e: any) {
    console.error('[daily-report] error:', e)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
