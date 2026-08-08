import { NextResponse } from 'next/server'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import {
  bindLineToUser,
  exchangeAndVerify,
  isAllowedRedirect,
  serviceClient,
  isSyntheticEmail,
} from '@/lib/lineAuth'

/**
 * LINE 綁定 —— 給已登入玩家用的三個操作
 *
 * GET    綁定狀態（會員中心的那一列要顯示什麼）
 * POST   綁定：收 LINE 授權碼，驗完綁到「目前登入的帳號」上。
 *        給同情境流程用（一般瀏覽器授權完回來，session 就在 cookie 裡）；
 *        偽 app 的跨情境流程走票（見 /api/auth/line 的 intent:'bind'）
 * DELETE 解除綁定
 *
 * 三個都以 session 為準 —— 綁誰、解誰，永遠是「現在登入的人」，
 * 呼叫端沒有指定帳號的空間。
 */

async function requireUser() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const admin = serviceClient()
  const { data } = await admin
    .from('users').select('line_user_id, email').eq('id', user.id).maybeSingle()

  const synthetic = isSyntheticEmail(data?.email)
  return NextResponse.json({
    bound: Boolean(data?.line_user_id),
    // 純 LINE 帳號（合成信箱）不能解綁：解了就再也登不進來
    canUnbind: Boolean(data?.line_user_id) && !synthetic,
    synthetic,
  })
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

    const { code, redirectUri } = await request.json()
    if (!code || !redirectUri) return NextResponse.json({ error: '缺少授權碼' }, { status: 400 })
    if (!isAllowedRedirect(redirectUri)) return NextResponse.json({ error: '轉址位置不合法' }, { status: 400 })

    const line = await exchangeAndVerify(code, redirectUri)
    if (!line) return NextResponse.json({ error: 'LINE 授權失敗，請重試一次' }, { status: 401 })

    const result = await bindLineToUser(serviceClient(), user.id, line)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ bound: true, bonus: result.bonus ?? 0 })
  } catch {
    return NextResponse.json({ error: '綁定失敗，請重試一次' }, { status: 500 })
  }
}

export async function DELETE() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const admin = serviceClient()
  const { data } = await admin
    .from('users').select('line_user_id, email').eq('id', user.id).maybeSingle()
  if (!data?.line_user_id) return NextResponse.json({ error: '尚未綁定 LINE' }, { status: 400 })
  if (isSyntheticEmail(data.email)) {
    return NextResponse.json({ error: '這個帳號只能用 LINE 登入，無法解除綁定' }, { status: 400 })
  }

  const { error } = await admin.from('users').update({ line_user_id: null }).eq('id', user.id)
  if (error) return NextResponse.json({ error: '解除失敗，請重試一次' }, { status: 500 })
  return NextResponse.json({ unbound: true })
}
