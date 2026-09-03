/**
 * 會員編號（= 邀請碼）：隨機 8 位數，7 位 + 1 位 Luhn 檢查碼（migration 693）。
 * 跟 DB 的 luhn_check_digit / is_valid_member_no 同一套算法，
 * 前端先驗格式，聽錯一位數的邀請碼不用打到 API 才知道。
 * 純函數、零依賴；後台 lib/memberNo.ts 是同一份。
 */

export function luhnCheckDigit(payload: string): number {
  let s = 0
  for (let i = 1; i <= payload.length; i++) {
    let d = Number(payload[payload.length - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    s += d
  }
  return (10 - (s % 10)) % 10
}

/** 去掉空白、全形空白、# —— 玩家會照「2841 7063」的顯示照抄 */
export function normalizeMemberNo(input: string | null | undefined): string {
  return String(input ?? '').replace(/[\s\u3000#]/g, '')
}

export function isValidMemberNo(input: string | null | undefined): boolean {
  const code = normalizeMemberNo(input)
  return /^[1-9]\d{7}$/.test(code) && luhnCheckDigit(code.slice(0, 7)) === Number(code[7])
}

/** 顯示用：四位一組「2841 7063」 */
export function formatMemberNo(no: number | string | null | undefined): string {
  const s = normalizeMemberNo(no == null ? '' : String(no))
  return s.length === 8 ? `${s.slice(0, 4)} ${s.slice(4)}` : s
}
