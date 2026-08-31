/**
 * 抽籤販售的階段判斷（後台用）
 *
 * 階段一律由時間現算。同一套規則有三份實作：
 *   DB    lottery_phase()（migration 653）
 *   後台  這支
 *   前台  frontend/lib/lottery.ts
 * 改規則要三邊一起改。存成資料庫欄位就不用同步，但那樣 cron 漏跑一次
 * 狀態就跟時鐘對不上，而且看不出哪個才是對的 —— 兩害相權取這個。
 *
 * 放在 lib 而不是 route 檔裡：Next.js 的 route.ts 只能匯出 handler，
 * 多匯出一個函數會被型別檢查擋下來（App Router 的路由型別是 exact）。
 */
export type LotteryPhase =
  | 'draft' | 'upcoming' | 'registering' | 'pending_draw' | 'drawn' | 'cancelled'

export function phaseOf(e: {
  status: string
  drawn_at: string | null
  register_start_at: string
  register_end_at: string
}): LotteryPhase {
  if (e.status === 'cancelled') return 'cancelled'
  if (e.status !== 'published') return 'draft'
  if (e.drawn_at) return 'drawn'
  const now = Date.now()
  if (now < new Date(e.register_start_at).getTime()) return 'upcoming'
  if (now < new Date(e.register_end_at).getTime()) return 'registering'
  return 'pending_draw'
}
