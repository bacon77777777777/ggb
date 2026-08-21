import crypto from 'crypto'

/**
 * 金流交接簽章
 *
 * 為什麼需要：App 裡不能讓 webview 自己導去綠界 —— 3D 驗證會跳到各家銀行的
 * 網域，那是列不完的，`allowNavigation` 白名單擋不住。所以付款頁改用
 * in-app browser 開啟。
 *
 * 但 in-app browser（iOS 的 SFSafariViewController）**跟 webview 不共用 cookie**，
 * 那邊拿不到登入 session。所以交接不能靠身分驗證，改用一次性簽章：
 * 把綠界表單的欄位簽起來塞進網址，開啟的那一頁驗簽後自動送出。
 *
 * 重放攻擊不成立：簽章內容是固定的 MerchantTradeNo，重放只會再看到同一個
 * 付款頁，而綠界本身會擋重複的交易編號。加上 10 分鐘有效期就夠了。
 */

const TTL_MS = 10 * 60 * 1000

function secret(): string {
  // 專用密鑰優先；沒設定就退回 service role key（同樣只存在於伺服器端，
  // 不會外流到瀏覽器）—— 這樣不改環境變數也能運作
  const s = process.env.PAYMENT_HANDOFF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('缺少 PAYMENT_HANDOFF_SECRET / SUPABASE_SERVICE_ROLE_KEY')
  return s
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64url')

export type HandoffPayload = {
  action: string
  fields: Record<string, string>
  exp: number
}

export function signHandoff(action: string, fields: Record<string, string>): string {
  const payload: HandoffPayload = { action, fields, exp: Date.now() + TTL_MS }
  const body = b64url(JSON.stringify(payload))
  const sig = b64url(crypto.createHmac('sha256', secret()).update(body).digest())
  return `${body}.${sig}`
}

export function verifyHandoff(token: string): HandoffPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expected = b64url(crypto.createHmac('sha256', secret()).update(body).digest())
  // 定時比較，避免用回應時間逐位元猜出簽章
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as HandoffPayload
    if (!payload?.exp || Date.now() > payload.exp) return null
    if (typeof payload.action !== 'string' || !payload.action.startsWith('https://')) return null
    // host 白名單（資安審查 2026-08-21）：即使簽章正確，action 的目標網域也只能
    // 是綠界（縱深防禦，防簽發端日後被繞過或誤用）
    try {
      const host = new URL(payload.action).host
      if (host !== 'payment.ecpay.com.tw' && host !== 'payment-stage.ecpay.com.tw') return null
    } catch { return null }
    return payload
  } catch {
    return null
  }
}
