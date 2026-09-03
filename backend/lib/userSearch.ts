import { realEmail } from '@/lib/syntheticEmail'
import { normalizeMemberNo } from '@/lib/memberNo'

/**
 * 列表搜尋框比對「用戶」的統一規則：會員編號（`2841 7063`／`28417063`／`#28417063`）、暱稱、真信箱。
 * LINE 快速帳號的合成信箱不參與比對 —— 畫面上看不到的東西搜得到只會讓人困惑。
 * 各頁再把自己的欄位（訂單編號、商品名…）OR 上去。
 */
export function userMatches(
  query: string,
  u?: { member_no?: number | null; memberNo?: number | null; name?: string | null; email?: string | null } | null,
): boolean {
  if (!u) return false
  const q = query.trim().toLowerCase()
  if (!q) return true
  const no = u.member_no ?? u.memberNo
  const digits = normalizeMemberNo(q)
  if (no != null && /^\d+$/.test(digits) && String(no).includes(digits)) return true
  if ((u.name ?? '').toLowerCase().includes(q)) return true
  const mail = realEmail(u.email)
  return !!mail && mail.toLowerCase().includes(q)
}
