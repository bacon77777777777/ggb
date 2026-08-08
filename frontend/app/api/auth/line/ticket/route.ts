import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { bindLineToUser, serviceClient } from '@/lib/lineAuth'

/**
 * 偽 app 的取票端點
 *
 * 偽 app 跳 LINE app 授權期間，票由 Safari 端的 callback 存進
 * line_login_tickets（見 /api/auth/line）。偽 app 每 2 秒帶著自己
 * 出發前產的 state 來問一次 —— 有票就取走。兩種票：
 *
 *   login —— 回 tokenHash，偽 app 拿去 verifyOtp 完成登入
 *   bind  —— 票裡是「這個 LINE 是誰」，在**這裡**綁到取票者的帳號上。
 *            取票的請求帶著偽 app 的 session（同源 fetch 自帶 cookie），
 *            這正是 Safari 那頭沒有的東西 —— 所以綁定必須發生在取票端
 *
 * 取票是一次性的：DELETE ... RETURNING 原子取出，第二個人拿同一個
 * state 來問只會拿到空。加上 5 分鐘過期與 state 本身不可猜（UUID），
 * 這個端點沒有可枚舉的東西。
 */
export async function POST(request: Request) {
  try {
    const { state } = await request.json()
    if (typeof state !== 'string' || state.length < 16) {
      return NextResponse.json({ found: false })
    }

    const admin = serviceClient()
    const stateHash = crypto.createHash('sha256').update(state).digest('hex')
    const { data } = await admin
      .from('line_login_tickets')
      .delete()
      .eq('state_hash', stateHash)
      .gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
      .select('token_hash, kind, line_sub, line_name, line_picture')
      .maybeSingle()

    if (!data) return NextResponse.json({ found: false })

    if (data.kind === 'bind') {
      if (!data.line_sub) return NextResponse.json({ found: true, error: '綁定資料不完整，請重試一次' })
      const supabase = await createSessionClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ found: true, error: '登入狀態逾時，請重新整理後再綁一次' })

      const result = await bindLineToUser(admin, user.id, {
        sub: data.line_sub,
        name: data.line_name,
        picture: data.line_picture,
      })
      if (!result.ok) return NextResponse.json({ found: true, error: result.error })
      return NextResponse.json({ found: true, bound: true, bonus: result.bonus ?? 0 })
    }

    if (!data.token_hash) return NextResponse.json({ found: false })
    return NextResponse.json({ found: true, tokenHash: data.token_hash })
  } catch {
    return NextResponse.json({ found: false })
  }
}
