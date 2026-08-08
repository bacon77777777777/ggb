/**
 * 邀請碼的分享文案 —— 全站唯一的定義處
 *
 * 會員頁的複製鈕與任務頁的邀請任務共用，兩邊複製到的必須是同一段話。
 * 文案刻意**不承諾任何獎品**：被邀請人目前沒有入站獎勵，
 * 寫「送折價券」就是不實廣告 —— 哪天真的做了填碼送禮，改這一個檔案就好。
 */
export function buildInviteMessage(code: string, origin: string): string {
  return `歡迎輸入我的邀請碼 ${code}，一起來吉吉比開箱抽好運！\n${origin}/login?invite=${code}`
}
