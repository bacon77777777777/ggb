import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createLinePusher } from '@/lib/linePush'
const pushLine = createLinePusher('line_push_dormant')

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

// Config (can be adjusted without code change via env)
const DORMANT_DAYS    = Number(process.env.DORMANT_DAYS    ?? 30)  // inactive threshold
const COUPON_DISCOUNT = Number(process.env.DORMANT_COUPON_DISCOUNT ?? 50)   // NT$
const COUPON_MINSPE   = Number(process.env.DORMANT_COUPON_MINSPEND ?? 100)  // NT$
const COUPON_DAYS     = Number(process.env.DORMANT_COUPON_DAYS ?? 14)       // expiry
const COUPON_CODE     = 'DORMANT_WAKEUP'


export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const dormantThreshold = new Date(Date.now() - DORMANT_DAYS * 86400_000).toISOString()
  const recentThreshold  = new Date(Date.now() - 30 * 86400_000).toISOString() // re-send window
  const expiryDate       = new Date(Date.now() + COUPON_DAYS * 86400_000).toISOString()

  // 1. Ensure the dormant coupon exists
  let couponId: string | null = null
  {
    const { data: existing } = await supabase
      .from('coupons')
      .select('id')
      .eq('code', COUPON_CODE)
      .single()

    if (existing) {
      couponId = existing.id
    } else {
      const { data: created } = await supabase
        .from('coupons')
        .insert({
          code:           COUPON_CODE,
          title:          '老朋友回來了！專屬優惠',
          description:    `久違了！送你一張 NT$${COUPON_DISCOUNT} 折扣券，快來看看新品吧 🎁`,
          discount_type:  'fixed',
          discount_value: COUPON_DISCOUNT,
          min_spend:      COUPON_MINSPE,
          is_active:      true,
        })
        .select('id')
        .single()
      couponId = created?.id ?? null
    }
  }

  if (!couponId) {
    return NextResponse.json({ error: '無法建立優惠券' }, { status: 500 })
  }

  // 2. Find dormant users (active, not bots, last login older than threshold)
  const { data: dormantUsers } = await supabase
    .from('users')
    .select('id')
    .eq('status', 'active')
    .or('is_bot.is.null,is_bot.eq.false')
    .not('last_login_at', 'is', null)
    .lt('last_login_at', dormantThreshold)
    .limit(300)

  const userIds = (dormantUsers ?? []).map(u => u.id)
  if (userIds.length === 0) {
    await pushLine(`🛌 沉睡客喚回｜本週無新增沉睡用戶`)
    return NextResponse.json({ ok: true, dormantCount: 0, sent: 0 })
  }

  // 3. Skip users who already received a coupon recently (within re-send window)
  const { data: alreadyReceived } = await supabase
    .from('user_coupons')
    .select('user_id')
    .eq('coupon_id', couponId)
    .in('user_id', userIds)
    .gte('created_at', recentThreshold)

  const alreadySent = new Set((alreadyReceived ?? []).map(c => c.user_id))
  const toSend = userIds.filter(id => !alreadySent.has(id))

  // 4. Issue coupons + in-app notifications
  if (toSend.length > 0) {
    await supabase.from('user_coupons').insert(
      toSend.map(userId => ({
        user_id:     userId,
        coupon_id:   couponId,
        status:      'unused',
        expiry_date: expiryDate,
      }))
    )

    await supabase.from('notifications').insert(
      toSend.map(userId => ({
        user_id: userId,
        type:    'promotion',
        title:   '老朋友回來了！送你專屬優惠券 🎁',
        body:    `久違了！送你一張 NT$${COUPON_DISCOUNT} 折扣券（滿 NT$${COUPON_MINSPE} 可用），${COUPON_DAYS} 天內有效，快來看看新品吧！`,
        link:    '/shop',
        meta:    { campaign: 'dormant_wakeup', coupon_id: couponId },
      }))
    )
  }

  // 5. Admin LINE report
  const lines = [
    `🛌 沉睡客喚回排程`,
    ``,
    `沉睡門檻：${DORMANT_DAYS} 天未登入`,
    `掃描用戶：${userIds.length} 人`,
    `本次發送：${toSend.length} 人`,
    `略過（已持有）：${alreadySent.size} 人`,
    ``,
    `優惠內容：滿 NT$${COUPON_MINSPE} 折 NT$${COUPON_DISCOUNT}`,
    `有效期限：${COUPON_DAYS} 天`,
  ]
  await pushLine(lines.join('\n'))

  return NextResponse.json({
    ok: true,
    dormantCount: userIds.length,
    sent: toSend.length,
    skipped: alreadySent.size,
    couponId,
  })
}
