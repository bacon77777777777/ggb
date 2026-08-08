import { NextResponse } from 'next/server'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { serviceClient, isSyntheticEmail } from '@/lib/lineAuth'

/**
 * 設定頁「帳號與安全」區塊需要的狀態，一次回齊
 *
 * 原本 LINE 綁定與邀請碼各打各的 API，設定頁一開先看到「…」，
 * 邀請碼那列還慢半拍才冒出來（老闆回報的體感問題）。
 * 合併成一趟，配合前端的 localStorage 快取（useSettingsStatus），
 * 第二次進頁面完全零等待。
 */

export async function GET() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const admin = serviceClient()
  const [{ data: me }, { data: referral }, { data: hasPassword }] = await Promise.all([
    admin.from('users').select('line_user_id, email, created_at').eq('id', user.id).maybeSingle(),
    admin.from('referrals').select('id').eq('referee_id', user.id).maybeSingle(),
    admin.rpc('user_has_password', { p_user_id: user.id }),
  ])
  if (!me) return NextResponse.json({ error: '找不到帳號資料' }, { status: 404 })

  const synthetic = isSyntheticEmail(me.email)
  // 綁定禮資格（migration 505 的新戶分界）：新戶＋還沒綁 → 設定頁
  // LINE 列顯示「綁定領300」。極端例外（拿別人用過的 LINE 來綁領不到）
  // 由帳本擋，這裡只管顯示
  const LAUNCH = '2026-08-08T00:00:00+08:00'

  return NextResponse.json({
    line: {
      bound: Boolean(me.line_user_id),
      canUnbind: Boolean(me.line_user_id) && !synthetic,
      synthetic,
      bonusOnBind: !me.line_user_id && new Date(me.created_at) >= new Date(LAUNCH),
    },
    invite: {
      claimed: Boolean(referral),
      // 填碼不限時間（原 7 天窗口老闆拆掉了）。欄位留著給舊快取
      eligible: true,
    },
    password: { set: Boolean(hasPassword) },
  })
}
