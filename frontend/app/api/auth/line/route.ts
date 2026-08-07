import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * LINE 登入的後端橋
 *
 * Supabase Auth 沒有 LINE provider，所以不能一行 signInWithOAuth 解決。
 * 這支收前端傳來的授權碼，做完整段換證流程，最後回一張 Supabase 的
 * 一次性 token（hashed_token），前端拿去 verifyOtp 就得到跟 Email 登入
 * **完全一樣**的 session —— RLS、middleware、AuthContext 一行都不用改。
 *
 *   code → LINE 換 access_token + id_token
 *        → LINE 的 verify 端點驗 id_token（簽章、效期、aud 都是 LINE 驗）
 *        → 查 users.line_user_id：有 → 既有帳號｜無 → 建新帳號
 *        → admin.generateLink(magiclink) 換出 hashed_token
 *
 * 安全的關鍵兩條：
 * - id_token 一定在後端驗，**不信前端自報的 profile** —— liff.getProfile()
 *   之類的東西可以被竄改，verify 端點才是可信來源。
 * - 檢查回傳的 aud 等於我們的 Channel ID，否則任何人拿「自己的 LINE app」
 *   簽出來的 token 就能登入我們站上的任意帳號。
 */

const CHANNEL_ID = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID
const CHANNEL_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET

/**
 * LINE 帳號不一定拿得到 email（要另外過 LINE 的審核），所以純 LINE 的
 * 新帳號用合成信箱建。generateLink 只產 token 不寄信，這個信箱永遠
 * 不會真的收到郵件；網域刻意用不存在的內部後綴，跟真實玩家的信箱
 * 絕不可能撞在一起。
 */
const syntheticEmail = (lineUserId: string) => `line_${lineUserId.toLowerCase()}@line-login.ggb.internal`

export async function POST(request: Request) {
  try {
    if (!CHANNEL_ID || !CHANNEL_SECRET) {
      return NextResponse.json({ error: 'LINE 登入尚未設定' }, { status: 500 })
    }

    /*
     * 兩種模式：
     *   direct —— 呼叫端跟出發時是同一個瀏覽器情境（state 對得上），
     *             tokenHash 直接回給它，當場 verifyOtp
     *   ticket —— 呼叫端是「別的情境」：偽 app 跳 LINE app 授權後，
     *             回程被 iOS 丟進 Safari，登入態不能建在這裡。
     *             改把票存進 line_login_tickets，讓偽 app 輪詢取走，
     *             在自己的情境裡完成登入（同門市選擇的 cvs-pending 模式）
     */
    const { code, redirectUri, mode, state } = await request.json()
    if (!code || !redirectUri) {
      return NextResponse.json({ error: '缺少授權碼' }, { status: 400 })
    }
    if (mode === 'ticket' && (typeof state !== 'string' || state.length < 16)) {
      return NextResponse.json({ error: '缺少驗證碼' }, { status: 400 })
    }

    // redirect_uri 必須跟授權當下用的一模一樣，LINE 會比對；
    // 但值本身要驗過，不能讓呼叫端拿這支 API 當任意轉址的跳板
    const allowedHosts = ['www.ggb.com.tw', 'staging.ggb.com.tw', 'localhost:3000']
    const uriHost = (() => { try { const u = new URL(redirectUri); return u.host } catch { return '' } })()
    if (!allowedHosts.includes(uriHost)) {
      return NextResponse.json({ error: '轉址位置不合法' }, { status: 400 })
    }

    // ── 1. 授權碼換 token ──
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: CHANNEL_ID,
        client_secret: CHANNEL_SECRET,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!tokenRes.ok) {
      return NextResponse.json({ error: 'LINE 授權失敗，請重試一次' }, { status: 401 })
    }
    const { id_token: idToken } = await tokenRes.json()
    if (!idToken) return NextResponse.json({ error: 'LINE 授權失敗，請重試一次' }, { status: 401 })

    // ── 2. 驗 id_token（LINE 的官方 verify 端點）──
    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: CHANNEL_ID }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!verifyRes.ok) {
      return NextResponse.json({ error: 'LINE 身份驗證失敗' }, { status: 401 })
    }
    const profile = await verifyRes.json() as { sub?: string; aud?: string; name?: string; picture?: string }

    // aud 必須是我們的 channel —— 別人的 app 簽的 token 到這裡擋下
    if (!profile.sub || profile.aud !== CHANNEL_ID) {
      return NextResponse.json({ error: 'LINE 身份驗證失敗' }, { status: 401 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // ── 3. 查有沒有綁過 ──
    const { data: existing } = await admin
      .from('users')
      .select('id, email')
      .eq('line_user_id', profile.sub)
      .maybeSingle()

    let email = existing?.email as string | null | undefined

    if (!existing) {
      // ── 4. 建新帳號 ──
      // auth.users 一寫入，DB 的 handle_new_user trigger 就會自動建
      // public.users（名字取 metadata、撞名加後綴、發 invite_code），
      // 跟 Email 註冊走的是同一條路，帳號形狀完全一致
      email = syntheticEmail(profile.sub)
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name: profile.name || 'LINE玩家', line_user_id: profile.sub },
      })
      if (createErr || !created.user) {
        // 可能是罕見的重放：同一個 code 被送兩次，第二次撞唯一索引。
        // 再查一次，查得到就當既有帳號繼續走
        const { data: retry } = await admin
          .from('users').select('id, email').eq('line_user_id', profile.sub).maybeSingle()
        if (!retry) return NextResponse.json({ error: '建立帳號失敗，請重試一次' }, { status: 500 })
        email = retry.email
      } else {
        await admin.from('users')
          .update({ line_user_id: profile.sub, avatar_url: profile.picture ?? null })
          .eq('id', created.user.id)
      }
    }

    if (!email) return NextResponse.json({ error: '帳號資料異常，請聯絡客服' }, { status: 500 })

    // ── 5. 換出 Supabase 的一次性 token ──
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = link?.properties?.hashed_token
    if (linkErr || !tokenHash) {
      return NextResponse.json({ error: '登入失敗，請重試一次' }, { status: 500 })
    }

    if (mode === 'ticket') {
      // 順手清過期票，表才不會無限長大（低頻操作，多一刀 DELETE 無感）
      await admin.from('line_login_tickets')
        .delete().lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString())
      const stateHash = crypto.createHash('sha256').update(String(state)).digest('hex')
      const { error: tErr } = await admin.from('line_login_tickets')
        .upsert({ state_hash: stateHash, token_hash: tokenHash, created_at: new Date().toISOString() })
      if (tErr) return NextResponse.json({ error: '登入失敗，請重試一次' }, { status: 500 })
      return NextResponse.json({ stored: true })
    }

    return NextResponse.json({ tokenHash })
  } catch {
    return NextResponse.json({ error: '登入失敗，請重試一次' }, { status: 500 })
  }
}
