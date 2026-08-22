import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isSyntheticEmail } from '@/lib/syntheticEmail'

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
   * 預設暱稱 —— 跟 DB trigger handle_new_user 同一套規則：metadata 的 name
   * → 真信箱的前綴 → 'GGB 玩家'。以前這裡寫 `|| null`，email 註冊的人經這條
   * 路補建檔（清資料後 auth.users 還在、public.users 沒了）就會是空名；
   * 留言／排行榜／跑馬燈／資料小卡全讀 users.name，空的就變「用戶／神秘玩家」
   * （老闆 2026-08-22）。會員頁看得到名字只是 AuthContext 裝出來的暫時名。
   * LINE 合成信箱的前綴是 line_<id> 亂碼，不拿來當名字。
   * DB 端 migration 600 另有 BEFORE INSERT 保險，這裡仍明確帶值，不靠它。
   */
  const metaName = String(user.user_metadata?.name ?? '').trim()
  const email = user.email ?? ''
  const name =
    metaName ||
    (email && !isSyntheticEmail(email) ? email.split('@')[0] : '') ||
    'GGB 玩家'

  const { error } = await admin.from('users').insert({
    id: user.id,
    email: user.email,
    name,
    invite_code: inviteCode,
  })

  if (error) {
    console.error('[ensure-profile] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, created: true })
}
