import { NextResponse } from 'next/server'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/lineAuth'

/**
 * 邀請碼 —— 事後填寫
 *
 * 邀請碼從註冊頁移到個人設定：門口少一個欄位，而且 LINE／Google
 * 進站的玩家（不經過註冊頁）也有機會被推薦，覆蓋反而變完整。
 *
 * GET   目前狀態（設定頁那一列要顯示什麼）
 * POST  填寫 { code }
 *
 * 防呆規則：
 * - 一個帳號只能填一次（referrals.referee_id 唯一索引兜底）
 * - 不能填自己的
 * - 邀請人不能是機器人帳號
 * - 不限時間（原 7 天窗口老闆 2026-08-08 拆掉）
 * - 同 IP 每日填碼上限（防洗第二道保險；主鎖是 LINE 帳本）
 *
 * 計獎時點（邀請體系 2.0，migration 505）：填碼只建 referrals 列，
 * **綁定 LINE 那一刻才生效**（apply_line_perks 統一發放）。
 * 這裡若發現已經綁了 LINE（先綁後填的順序），當場補跑生效。
 */

const IP_DAILY_LIMIT = 5

async function getContext() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = serviceClient()
  const { data: me } = await admin
    .from('users').select('id, invite_code, line_user_id').eq('id', user.id).maybeSingle()
  if (!me) return null

  const { data: referral } = await admin
    .from('referrals').select('id').eq('referee_id', user.id).maybeSingle()

  return { admin, me, claimed: Boolean(referral) }
}

export async function GET() {
  const ctx = await getContext()
  if (!ctx) return NextResponse.json({ error: '請先登入' }, { status: 401 })
  // eligible 恆為 true，留著是為了不炸還在跑舊版快取的 client
  return NextResponse.json({ claimed: ctx.claimed, eligible: true })
}

export async function POST(request: Request) {
  try {
    const ctx = await getContext()
    if (!ctx) return NextResponse.json({ error: '請先登入' }, { status: 401 })
    const { admin, me, claimed } = ctx

    if (claimed) return NextResponse.json({ error: '已經填過邀請碼了' }, { status: 409 })

    const { code } = await request.json()
    const normalized = String(code ?? '').trim().toUpperCase()
    if (!normalized) return NextResponse.json({ error: '請輸入邀請碼' }, { status: 400 })
    if (normalized === String(me.invite_code ?? '').toUpperCase()) {
      return NextResponse.json({ error: '不能填自己的邀請碼' }, { status: 400 })
    }

    const { data: referrer } = await admin
      .from('users').select('id, is_bot').eq('invite_code', normalized).maybeSingle()
    if (!referrer || referrer.is_bot) {
      return NextResponse.json({ error: '找不到這個邀請碼' }, { status: 404 })
    }

    // 同 IP 每日填碼上限：機房批量開號的便宜保險
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    if (ip) {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
      const { count } = await admin
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .eq('claim_ip', ip)
        .gte('created_at', dayStart.toISOString())
      if ((count ?? 0) >= IP_DAILY_LIMIT) {
        return NextResponse.json({ error: '今天填寫次數太多了，請明天再試' }, { status: 429 })
      }
    }

    // referee_id 唯一索引擋重複：同時送兩次只會成功一筆
    const { error: insErr } = await admin
      .from('referrals')
      .insert({ referrer_id: referrer.id, referee_id: me.id, claim_ip: ip })
    if (insErr) {
      return NextResponse.json({ error: '已經填過邀請碼了' }, { status: 409 })
    }

    // 已綁 LINE 的（先綁後填）：當場生效計入邀請人。
    // 還沒綁的：referrals 先掛著，等他綁 LINE 那一刻由 apply_line_perks 生效
    if (me.line_user_id) {
      await admin.rpc('apply_line_perks', { p_user_id: me.id, p_line_sub: me.line_user_id })
        .then(undefined, () => {})
    }

    return NextResponse.json({ claimed: true })
  } catch {
    return NextResponse.json({ error: '填寫失敗，請重試一次' }, { status: 500 })
  }
}
