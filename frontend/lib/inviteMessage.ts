import { formatMemberNo } from '@/lib/memberNo'

/**
 * 邀請碼的分享文案 —— 全站唯一的定義處
 *
 * 會員頁的複製鈕與邀請頁共用，兩邊複製到的必須是同一段話。
 * 「綁 LINE 送 300 積分」是真的（migration 505 綁定禮，
 * 300 積分＝75 代幣，可全積分抽一次低價機台）—— 承諾過的
 * 獎勵改動時，這個檔案要跟著改，不能寫沒有的東西。
 */
export function buildInviteMessage(code: string, origin: string): string {
  return `用我的邀請碼 ${formatMemberNo(code)} 加入吉吉比，綁定 LINE 就送 300 積分，免費抽一次！\n${origin}/login?invite=${code}`
}
