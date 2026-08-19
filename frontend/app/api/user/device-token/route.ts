import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * 推播裝置註冊 / 撤銷
 *
 * POST   { token, platform }  註冊或更新（同一台裝置換帳號登入時把 token 轉過去）
 * DELETE { token }            撤銷（登出時呼叫，避免推播推到已經登出的裝置）
 */

const PLATFORMS = new Set(['ios', 'android', 'web'])

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

const admin = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let token = ''
  let platform = ''
  try {
    const body = await request.json()
    token = String(body?.token ?? '').trim()
    platform = String(body?.platform ?? '').trim()
  } catch {
    /* 交給下面的驗證擋掉 */
  }

  if (!token || token.length > 4096 || !PLATFORMS.has(platform)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // token 是 UNIQUE：同一台手機換帳號登入時，這裡會把它改掛到新的 user，
  // 舊帳號就自動收不到那台的推播 —— 正是我們要的行為
  const { error } = await admin()
    .from('device_tokens')
    .upsert(
      {
        user_id: user.id,
        token,
        platform,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
        revoke_reason: null,
      },
      { onConflict: 'token' }
    )

  if (error) {
    console.error('[device-token] upsert 失敗', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let token = ''
  try {
    const body = await request.json()
    token = String(body?.token ?? '').trim()
  } catch {
    /* 空 body → 撤銷這個帳號的全部裝置 */
  }

  const q = admin()
    .from('device_tokens')
    .update({ revoked_at: new Date().toISOString(), revoke_reason: 'signed_out' })
    .eq('user_id', user.id)
    .is('revoked_at', null)

  const { error } = token ? await q.eq('token', token) : await q

  if (error) {
    console.error('[device-token] 撤銷失敗', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
