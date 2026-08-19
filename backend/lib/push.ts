import crypto from 'crypto'
import { getSupabaseAdmin } from './supabaseAdmin'

/**
 * 推播發送（Firebase Cloud Messaging HTTP v1）
 *
 * 兩個平台共用這一條路徑：Android 原生就是 FCM，iOS 由 Firebase 代發 APNs
 * （Firebase 後台上傳 APNs Auth Key 即可）。所以這裡不需要另外實作
 * APNs 的 JWT + HTTP/2。
 *
 * 沒有引入 google-auth-library 或 jsonwebtoken —— service account 的
 * OAuth2 流程就是「用私鑰簽一個 RS256 JWT 去換 access token」，
 * Node 內建的 crypto 就夠了，不值得為它多背一個相依。
 *
 * 環境變數：
 *   FIREBASE_SERVICE_ACCOUNT  Firebase 專案設定 → 服務帳戶 → 產生新的私密金鑰，
 *                             整個 JSON 塞進來（單行）
 * 沒設定時所有發送都是 no-op 並記一行 log —— 開發環境不該因為少一把金鑰就爆掉。
 */

type ServiceAccount = { project_id: string; client_email: string; private_key: string }

let saCache: ServiceAccount | null | undefined
function serviceAccount(): ServiceAccount | null {
  if (saCache !== undefined) return saCache
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) {
    saCache = null
    return null
  }
  try {
    const parsed = JSON.parse(raw) as ServiceAccount
    // 環境變數常見的坑：私鑰的換行被存成字面上的 \n
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
    saCache = parsed
  } catch {
    console.error('[push] FIREBASE_SERVICE_ACCOUNT 不是合法 JSON，推播停用')
    saCache = null
  }
  return saCache
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

let tokenCache: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string | null> {
  const sa = serviceAccount()
  if (!sa) return null
  // 提早 60 秒換新，避免拿到剛好過期的 token
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token

  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )
  const signature = b64url(
    crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(sa.private_key)
  )

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
  })

  if (!res.ok) {
    console.error('[push] 取得 access token 失敗', res.status, await res.text())
    return null
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return json.access_token
}

export type PushPayload = {
  title: string
  body: string
  /** 點開通知要去哪一頁，例如 '/profile'。前台收到後自行導頁。 */
  link?: string
  data?: Record<string, string>
}

type SendResult = { sent: number; revoked: number; failed: number }

/**
 * 推給指定使用者的所有有效裝置。
 *
 * FCM HTTP v1 沒有多播端點（舊的 batch 已停用），所以逐個 token 送，
 * 但併發控制在 10，避免一次上千台把 function 的連線數吃光。
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<SendResult> {
  const empty: SendResult = { sent: 0, revoked: 0, failed: 0 }
  if (!userIds.length) return empty

  const sa = serviceAccount()
  const accessToken = await getAccessToken()
  if (!sa || !accessToken) {
    console.warn('[push] 未設定 FIREBASE_SERVICE_ACCOUNT，略過推播')
    return empty
  }

  const supabase = getSupabaseAdmin()
  const { data: rows, error } = await supabase
    .from('device_tokens')
    .select('token, platform')
    .in('user_id', userIds)
    .is('revoked_at', null)

  if (error) {
    console.error('[push] 讀取裝置 token 失敗', error)
    return empty
  }
  if (!rows?.length) return empty

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  const result: SendResult = { sent: 0, revoked: 0, failed: 0 }
  const deadTokens: string[] = []

  const sendOne = async (row: { token: string }) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: row.token,
          notification: { title: payload.title, body: payload.body },
          // data 的值一律要是字串，FCM 不接受數字或巢狀物件
          data: { ...(payload.data ?? {}), ...(payload.link ? { link: payload.link } : {}) },
          android: { notification: { sound: 'default' }, priority: 'HIGH' },
          apns: { payload: { aps: { sound: 'default' } } },
        },
      }),
    })

    if (res.ok) {
      result.sent++
      return
    }

    const text = await res.text()
    // 使用者刪了 App 或關掉通知 → token 永久失效，標記起來不要再送
    if (res.status === 404 || text.includes('UNREGISTERED') || text.includes('INVALID_ARGUMENT')) {
      deadTokens.push(row.token)
      result.revoked++
    } else {
      result.failed++
      console.error('[push] 發送失敗', res.status, text.slice(0, 300))
    }
  }

  const CONCURRENCY = 10
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(rows.slice(i, i + CONCURRENCY).map(sendOne))
  }

  if (deadTokens.length) {
    await supabase
      .from('device_tokens')
      .update({ revoked_at: new Date().toISOString(), revoke_reason: 'fcm_unregistered' })
      .in('token', deadTokens)
  }

  return result
}
