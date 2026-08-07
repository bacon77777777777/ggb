import { NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  exchangeAndVerify,
  isAllowedRedirect,
  serviceClient,
  syntheticEmail,
} from '@/lib/lineAuth'

/**
 * LINE 登入／綁定的後端橋
 *
 * Supabase Auth 沒有 LINE provider，所以不能一行 signInWithOAuth 解決。
 * 這支收前端傳來的授權碼，驗完身份後依模式分流：
 *
 * （無 mode）direct —— 呼叫端跟出發時是同一個瀏覽器情境：
 *   查／建帳號 → generateLink(magiclink) → 回 hashed_token，
 *   前端 verifyOtp 就得到跟 Email 登入完全一樣的 session ——
 *   RLS、middleware、AuthContext 一行都不用改。
 *
 * mode:'ticket' —— 呼叫端是「別的情境」（偽 app 跳 LINE app 授權後，
 *   回程被 iOS 丟進 Safari）。登入態不能建在這裡，改把票存進
 *   line_login_tickets 讓偽 app 輪詢取走（同門市選擇的 cvs-pending 模式）。
 *   再依 intent 分兩種票：
 *     - 登入票（kind=login）：帳號照查照建，票裡是一次性登入權
 *     - 綁定票（kind=bind，intent:'bind'）：只存「這個 LINE 是誰」。
 *       實際綁定發生在偽 app 帶著自己的 session 來取票的那一刻 ——
 *       Safari 這頭沒有 session，不能也不必動帳號
 *
 * 身份驗證的兩條底線在 lib/lineAuth 的 exchangeAndVerify：
 * id_token 一定在後端驗、aud 必須是我們的 Channel ID。
 */
export async function POST(request: Request) {
  try {
    const { code, redirectUri, mode, state, intent } = await request.json()
    if (!code || !redirectUri) {
      return NextResponse.json({ error: '缺少授權碼' }, { status: 400 })
    }
    if (!isAllowedRedirect(redirectUri)) {
      return NextResponse.json({ error: '轉址位置不合法' }, { status: 400 })
    }
    if (mode === 'ticket' && (typeof state !== 'string' || state.length < 16)) {
      return NextResponse.json({ error: '缺少驗證碼' }, { status: 400 })
    }

    const line = await exchangeAndVerify(code, redirectUri)
    if (!line) return NextResponse.json({ error: 'LINE 授權失敗，請重試一次' }, { status: 401 })

    const admin = serviceClient()
    const stateHash = mode === 'ticket'
      ? crypto.createHash('sha256').update(String(state)).digest('hex')
      : null

    const storeTicket = async (row: Record<string, unknown>) => {
      // 順手清過期票，表才不會無限長大（低頻操作，多一刀 DELETE 無感）
      await admin.from('line_login_tickets')
        .delete().lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString())
      return admin.from('line_login_tickets').upsert({
        state_hash: stateHash,
        created_at: new Date().toISOString(),
        ...row,
      })
    }

    // ── 綁定票：驗完身份就存票走人，不動任何帳號 ──
    if (mode === 'ticket' && intent === 'bind') {
      const { error } = await storeTicket({
        token_hash: '',
        kind: 'bind',
        line_sub: line.sub,
        line_name: line.name,
        line_picture: line.picture,
      })
      if (error) return NextResponse.json({ error: '綁定失敗，請重試一次' }, { status: 500 })
      return NextResponse.json({ stored: true })
    }

    // ── 登入：查有沒有綁過 ──
    const { data: existing } = await admin
      .from('users')
      .select('id, email')
      .eq('line_user_id', line.sub)
      .maybeSingle()

    let email = existing?.email as string | null | undefined

    if (!existing) {
      // auth.users 一寫入，DB 的 handle_new_user trigger 就會自動建
      // public.users（名字取 metadata、撞名加後綴、發 invite_code），
      // 跟 Email 註冊走的是同一條路，帳號形狀完全一致。
      // LINE 拿不到 email（要另外過審），用合成信箱建 ——
      // generateLink 只產 token 不寄信，這個信箱永遠不會真的收信
      email = syntheticEmail(line.sub)
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name: line.name || 'LINE玩家', line_user_id: line.sub },
      })
      if (createErr || !created.user) {
        // 罕見的重放：同一個 code 被送兩次，第二次撞唯一索引。
        // 再查一次，查得到就當既有帳號繼續走
        const { data: retry } = await admin
          .from('users').select('id, email').eq('line_user_id', line.sub).maybeSingle()
        if (!retry) return NextResponse.json({ error: '建立帳號失敗，請重試一次' }, { status: 500 })
        email = retry.email
      } else {
        await admin.from('users')
          .update({ line_user_id: line.sub, avatar_url: line.picture })
          .eq('id', created.user.id)
      }
    }

    if (!email) return NextResponse.json({ error: '帳號資料異常，請聯絡客服' }, { status: 500 })

    // ── 換出 Supabase 的一次性 token ──
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = link?.properties?.hashed_token
    if (linkErr || !tokenHash) {
      return NextResponse.json({ error: '登入失敗，請重試一次' }, { status: 500 })
    }

    // ── 登入票：存表讓偽 app 輪詢取走 ──
    if (mode === 'ticket') {
      const { error: tErr } = await storeTicket({ token_hash: tokenHash, kind: 'login' })
      if (tErr) return NextResponse.json({ error: '登入失敗，請重試一次' }, { status: 500 })
      return NextResponse.json({ stored: true })
    }

    return NextResponse.json({ tokenHash })
  } catch {
    return NextResponse.json({ error: '登入失敗，請重試一次' }, { status: 500 })
  }
}
