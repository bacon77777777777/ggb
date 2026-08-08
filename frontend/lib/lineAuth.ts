import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSyntheticEmail } from '@/lib/syntheticEmail'

/**
 * LINE 登入／綁定共用的伺服器端邏輯
 *
 * 只在 API route 裡用（吃 CHANNEL_SECRET 與 service role），
 * 不可以被任何 client component import。
 */

const CHANNEL_ID = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID
const CHANNEL_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET

export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/** redirect_uri 白名單。這支 API 不能被當成任意轉址的跳板 */
export function isAllowedRedirect(redirectUri: string): boolean {
  const allowed = ['www.ggb.com.tw', 'staging.ggb.com.tw', 'localhost:3000']
  try { return allowed.includes(new URL(redirectUri).host) } catch { return false }
}

export interface LineProfile {
  sub: string
  name: string | null
  picture: string | null
}

/**
 * 授權碼 → token → 驗 id_token，回這個 LINE 是誰。
 *
 * 兩條安全底線：
 * - id_token 一定在後端驗（LINE 官方 verify 端點），不信前端自報的 profile
 * - 檢查 aud 等於我們的 Channel ID，擋別人拿自己的 app 簽的 token 冒充
 */
export async function exchangeAndVerify(code: string, redirectUri: string): Promise<LineProfile | null> {
  if (!CHANNEL_ID || !CHANNEL_SECRET) return null

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
  if (!tokenRes.ok) return null
  const { id_token: idToken } = await tokenRes.json()
  if (!idToken) return null

  const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: CHANNEL_ID }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!verifyRes.ok) return null
  const p = await verifyRes.json() as { sub?: string; aud?: string; name?: string; picture?: string }
  if (!p.sub || p.aud !== CHANNEL_ID) return null

  return { sub: p.sub, name: p.name ?? null, picture: p.picture ?? null }
}

// 合成信箱的定義集中在 lib/syntheticEmail（client 與 server 共用），這裡轉出口
export { SYNTHETIC_EMAIL_SUFFIX, syntheticEmail, isSyntheticEmail } from '@/lib/syntheticEmail'

/**
 * 把某個 LINE 綁到某個玩家帳號上。
 *
 * 衝突規則（都走保守路線，錯綁等於把別人的 G 幣送出去）：
 * - 這個帳號已綁別的 LINE → 拒絕，請先解除
 * - 這個 LINE 已綁在別的帳號：
 *     - 那是 LINE 快速建立的**空殼**（合成信箱、0 代幣、無任何紀錄）
 *       → 收回綁定給現在這個帳號。空殼從此不可達，無害
 *     - 有任何資產或紀錄 → 拒絕，請玩家找客服，人工處理合併
 */
export async function bindLineToUser(
  admin: SupabaseClient,
  userId: string,
  line: LineProfile,
): Promise<{ ok: true; already?: boolean } | { ok: false; error: string }> {
  const { data: me } = await admin
    .from('users').select('id, line_user_id').eq('id', userId).maybeSingle()
  if (!me) return { ok: false, error: '找不到你的帳號資料' }
  if (me.line_user_id === line.sub) return { ok: true, already: true }
  if (me.line_user_id) return { ok: false, error: '這個帳號已綁定另一個 LINE，請先解除綁定' }

  const { data: other } = await admin
    .from('users').select('id, email, tokens').eq('line_user_id', line.sub).maybeSingle()

  if (other && other.id !== userId) {
    if (!isSyntheticEmail(other.email)) {
      return { ok: false, error: '這個 LINE 已綁定其他帳號，若有疑問請聯絡客服' }
    }
    // 空殼檢查：只要有任何一種紀錄就不是空殼
    const tables = ['draw_records', 'recharge_records', 'orders'] as const
    for (const t of tables) {
      const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq('user_id', other.id)
      if ((count ?? 0) > 0) {
        return { ok: false, error: '這個 LINE 之前登入建立的帳號已有使用紀錄，請聯絡客服協助合併' }
      }
    }
    if (Number(other.tokens ?? 0) > 0) {
      return { ok: false, error: '這個 LINE 之前登入建立的帳號還有代幣，請聯絡客服協助合併' }
    }
    await admin.from('users').update({ line_user_id: null }).eq('id', other.id)
  }

  /*
   * 綁定**不碰頭像**。層級規則（老闆定的）：只有「用 LINE 開的帳號」
   * 建立當下才拿 LINE 頭貼；既有帳號事後綁 LINE 是加一把鑰匙，
   * 不是換身份 —— 就算原本掛的是預設頭像也不動。
   */
  const { error } = await admin
    .from('users')
    .update({ line_user_id: line.sub })
    .eq('id', userId)
  if (error) return { ok: false, error: '綁定失敗，請重試一次' }

  // 綁定禮／邀請計入（migration 505）：一顆 LINE 一生一次，帳本兜底。
  // 失敗不擋綁定結果
  await admin.rpc('apply_line_perks', { p_user_id: userId, p_line_sub: line.sub })
    .then(undefined, () => {})

  return { ok: true }
}
