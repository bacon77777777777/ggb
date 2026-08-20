/**
 * 「這次重掛是下拉更新造成的」的共用旗標
 *
 * 下拉更新不整頁 reload，而是由 PathnameKeyed 換 key 把 <main> 底下整棵頁面
 * 重掛（見 components/PathnameKeyed.tsx）。好處是框與登入態不動、沒有白屏，
 * 代價是**頁面元件分不出「玩家導航進來」和「玩家下拉刷新」** —— 兩者都是
 * 一次全新的 mount，於是首頁彈窗每刷一次就跳一次
 * （老闆 2026-08-20：刷新不該再看到彈窗）。
 *
 * 這裡用時間戳而不是「消費一次就清掉」的旗標：同一次刷新可能有多個元件要問，
 * 先問的把旗標拿走，後問的就漏判了。
 */

let lastRefreshAt = 0;

/** 由 PathnameKeyed 在重掛之前呼叫 —— 那是所有 `ggb:content-refresh` 的統一入口 */
export function markContentRefresh(): void {
  lastRefreshAt = Date.now();
}

/**
 * 剛剛才因為下拉更新重掛過嗎？
 *
 * 兩秒的窗口涵蓋「發事件 → 換 key → 子元件 effect 跑起來」這段，
 * 又短到不會誤傷「刷新完馬上點去別頁再回首頁」（那要花上好幾秒）。
 */
export function isJustRefreshed(withinMs = 2000): boolean {
  return lastRefreshAt > 0 && Date.now() - lastRefreshAt < withinMs;
}
