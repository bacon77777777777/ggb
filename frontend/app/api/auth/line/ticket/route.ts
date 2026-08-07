import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * 偽 app 的取票端點
 *
 * 偽 app 跳 LINE app 授權期間，票由 Safari 端的 callback 存進
 * line_login_tickets（見 /api/auth/line 的 ticket 模式）。
 * 偽 app 每 2 秒帶著自己出發前產的 state 來問一次 —— 有票就取走。
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

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const stateHash = crypto.createHash('sha256').update(state).digest('hex')
    const { data } = await admin
      .from('line_login_tickets')
      .delete()
      .eq('state_hash', stateHash)
      .gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
      .select('token_hash')
      .maybeSingle()

    if (!data?.token_hash) return NextResponse.json({ found: false })
    return NextResponse.json({ found: true, tokenHash: data.token_hash })
  } catch {
    return NextResponse.json({ found: false })
  }
}
