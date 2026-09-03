/**
 * LINE 快速建立帳號用的合成信箱 —— 與前台 `frontend/lib/syntheticEmail.ts` 同一套定義。
 *
 * 玩家第一次用 LINE 登入、沒有給信箱時，Supabase Auth 需要一個 email 當帳號，
 * 前台就填 `line_<LINE userId>@line-login.ggb.com.tw`（自家子網域、沒有 MX、永遠收不到信）。
 * 它是內部代號，不是玩家的聯絡方式 —— 後台任何「有沒有綁信箱」的判斷都要先過這關，
 * 不然會像 2026-09-04 老闆截到的那樣：帳號綁定頁把這串印出來、還標「已綁定」。
 *
 * 純函數、零依賴；改後綴要兩邊一起改。
 */

export const SYNTHETIC_EMAIL_SUFFIX = '@line-login.ggb.com.tw'

/** 第一版的後綴。已有帳號用 SQL 遷移過，判斷邏輯保留舊後綴以防漏網 */
const LEGACY_SUFFIXES = ['@line-login.ggb.internal']

/** 這個信箱是不是 LINE 快速帳號的內部代號（= 不算「已綁定信箱」） */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '')
  return e.endsWith(SYNTHETIC_EMAIL_SUFFIX) || LEGACY_SUFFIXES.some(s => e.endsWith(s))
}

/** 玩家真的有綁的信箱；LINE 快速帳號回 null */
export function realEmail(email: string | null | undefined): string | null {
  return email && !isSyntheticEmail(email) ? email : null
}
