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
 * - 不限時間（原本有註冊後 7 天的窗口，老闆 2026-08-08 拆掉：
 *   老用戶點朋友的邀請連結也要能填。互填集團的防線改由
 *   「獎勵後置到首儲」的誘因方案承擔）
 */

async function getContext() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = serviceClient()
  const { data: me } = await admin
    .from('users').select('id, invite_code').eq('id', user.id).maybeSingle()
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

    // referee_id 唯一索引擋重複：同時送兩次只會成功一筆
    const { error: insErr } = await admin
      .from('referrals')
      .insert({ referrer_id: referrer.id, referee_id: me.id })
    if (insErr) {
      return NextResponse.json({ error: '已經填過邀請碼了' }, { status: 409 })
    }

    // 計入邀請人的任務進度。既有 RPC 冪等（is_mission_credited 旗標），失敗不擋流程
    await admin.rpc('complete_registration_referral', { p_user_id: me.id }).then(undefined, () => {})

    return NextResponse.json({ claimed: true })
  } catch {
    return NextResponse.json({ error: '填寫失敗，請重試一次' }, { status: 500 })
  }
}
