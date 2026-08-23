import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ success: true, created: false })
  }

  const { data: inviteCode } = await admin.rpc('generate_invite_code')

  /*
   * 預設暱稱：metadata 有名字（LINE 顯示名）就用它；沒有就交給 DB 的 BEFORE INSERT
   * trigger（migration 607 的隨機詞庫：形容詞×名詞，例「幸運的水豚」）。
   * 信箱從此完全不參與暱稱 —— 信箱前綴會被猜出帳號，隱私外洩（老闆 2026-08-24）。
   */
  const metaName = String(user.user_metadata?.name ?? '').trim()

  const { error } = await admin.from('users').insert({
    id: user.id,
    email: user.email,
    name: metaName || null,
    invite_code: inviteCode,
  })

  if (error) {
    console.error('[ensure-profile] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, created: true })
}
