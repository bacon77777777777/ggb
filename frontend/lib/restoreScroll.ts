/**
 * 「返回時捲回原位」的共用實作（老闆 2026-08-30：每一頁的返回都要記得位置）
 *
 * 為什麼不能只 scrollTo 一次：列表頁幾乎都是掛載後才長出內容 —— 先 loading、
 * 資料回來才排版、縮圖載完才撐開版位。在那之前頁面高度接近 0，`scrollTo(y)`
 * 會被瀏覽器夾在「當下這個高度」的底部，位置就永遠停在同一個地方。
 *
 * 也不能掛在 render 的 effect 上重試：圖片載完撐開高度**不會**觸發 re-render。
 * 所以自己驅動 rAF，一直試到真的到位、逾時、或玩家自己動了為止。
 */
export function restoreScrollTo(
  y: number,
  timeoutMs = 3000,
  /**
   * 捲的是哪個容器。不給就是整頁（window）——
   * 「我的」頁那幾份清單各自捲在自己的 overflow 容器裡，記的也是容器的 scrollTop。
   */
  target?: () => HTMLElement | null,
): () => void {
  if (typeof window === 'undefined' || !(y > 0)) return () => {}

  const until = Date.now() + timeoutMs
  let raf = 0
  let stopped = false

  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchstart', stop)
    window.removeEventListener('keydown', stop)
  }

  const tick = () => {
    if (stopped) return
    const el = target?.()
    if (el) el.scrollTop = y
    else window.scrollTo(0, y)
    const at = el ? el.scrollTop : window.scrollY
    // 到位（或已經捲到底、再多也去不了）就收手
    if (Math.abs(at - y) < 2 || Date.now() > until) { stop(); return }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  // 玩家自己動了就別再把他拉回去
  window.addEventListener('wheel', stop, { passive: true })
  window.addEventListener('touchstart', stop, { passive: true })
  window.addEventListener('keydown', stop)

  return stop
}
