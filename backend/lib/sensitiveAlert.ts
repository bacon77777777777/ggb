/**
 * 敏感操作的 LINE 告警
 *
 * 原本 `products/[id]` 與 `users/[id]` 各寫了一份一模一樣的 `pushLineAlert()`，
 * 而且**只檢查 token 與 target 有沒有值，完全沒有判斷環境** ——
 * 只要 env 裡有 LINE 憑證就照推。
 *
 * 後果：本機開發（`.env.local` 放的是正式的 channel token 與正式群組 ID，
 * 因為要能測 GB哥）刪一件 STG 的測試商品，正式群組就跳一則
 * 「管理員敏感操作／刪除商品」。老闆在群裡看到會以為線上出事。
 *
 * 判斷環境用 **Supabase 專案** 而不是 NODE_ENV／VERCEL_ENV：
 * 這套系統的「環境」本來就是由連哪個資料庫定義的（見 CLAUDE.md 的雙環境原則），
 * 而且 STG 部署在 Vercel 上 NODE_ENV 也是 production，分不出來。
 *
 * 這樣的行為是 fail-safe 的：萬一有人把本機指向 PROD 資料庫，
 * 那確實是在動正式資料，告警就該發出去。
 */

/** PROD 的 Supabase 專案 ref（ap-northeast-2） */
const PROD_PROJECT_REF = 'akdqleelvqvjhjnfkpfq'

function isProdEnvironment(): boolean {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').includes(PROD_PROJECT_REF)
}

/**
 * 推一則敏感操作告警到 LINE。**只有連著 PROD 資料庫時才會真的送出。**
 *
 * 非正式環境改印到伺服器 log，開發時仍看得到「這個操作會觸發告警」，
 * 只是不會吵到群組。
 */
export async function pushSensitiveAlert(text: string): Promise<void> {
  if (!isProdEnvironment()) {
    console.log('[sensitiveAlert] 非 PROD 環境，略過 LINE 推播：\n' + text)
    return
  }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const id = process.env.NOTIFY_TARGET_ID
  if (!token || !id) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: id, messages: [{ type: 'text', text }] }),
  }).catch(() => {})
}

export default pushSensitiveAlert
