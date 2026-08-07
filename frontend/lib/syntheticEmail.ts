/**
 * LINE 快速建立帳號用的合成信箱 —— 全站唯一的定義處
 *
 * 為什麼是自家網域的子網域：第一版用了 @line-login.ggb.internal，
 * 結果 Supabase 的 updateUser 會連「帳號目前的信箱」一起做格式驗證，
 * .internal 不是真實存在的網域結尾，直接被打回票 ——
 * 純 LINE 帳號按「綁定電子郵件」必炸（實測抓到的）。
 * 換成 .ggb.com.tw 的子網域就過了：TLD 真實、網域是我們的、
 * 沒有 MX 紀錄所以永遠收不到信（也沒有任何流程會寄信給它）。
 *
 * 這個檔案必須保持純函數、零依賴 —— client 元件與 server route 都要 import。
 */

export const SYNTHETIC_EMAIL_SUFFIX = '@line-login.ggb.com.tw'

/** 第一版的後綴。已有帳號用 SQL 遷移過，但判斷邏輯保留舊後綴以防漏網 */
const LEGACY_SUFFIXES = ['@line-login.ggb.internal']

export const syntheticEmail = (lineUserId: string) =>
  `line_${lineUserId.toLowerCase()}${SYNTHETIC_EMAIL_SUFFIX}`

/** 這個信箱是不是 LINE 快速帳號的內部代號（= 不該顯示給玩家看） */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '')
  return e.endsWith(SYNTHETIC_EMAIL_SUFFIX) || LEGACY_SUFFIXES.some(s => e.endsWith(s))
}
