/**
 * 「這個錯是不是因為推版了」以及自動重載一次。
 *
 * 推新版之後，Vercel 上一版的 JS chunk 就沒了。玩家／管理員那邊還開著舊分頁，
 * 一旦去載一個還沒下載過的 chunk（捲到下面才載入的區塊、點進某個路由、
 * 開一個 dynamic import 的彈窗），就會 404 → ChunkLoadError → 整頁掛掉。
 *
 * 這種錯重新整理一次就好了，沒有必要讓人看到錯誤畫面。
 * 但一定要防重載迴圈：真的壞掉的頁面每次重載都會再壞一次，
 * 所以同一個分頁在 RELOAD_WINDOW_MS 內只自動重載一次，第二次就乖乖顯示錯誤畫面。
 */

const RELOAD_KEY = 'ggb:stale-build-reload';
const RELOAD_WINDOW_MS = 60_000;

const STALE_PATTERNS = [
  /loading chunk \S+ failed/i,
  /loading css chunk/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /'text\/html' is not a valid javascript mime type/i,
];

export function isStaleBuildError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: string; message?: string };
  if (e.name === 'ChunkLoadError') return true;
  const msg = String(e.message ?? error);
  return STALE_PATTERNS.some(re => re.test(msg));
}

/**
 * 需要且允許自動重載時回 true（呼叫端可以據此不要閃一下錯誤畫面）。
 * 回 false 代表「剛剛已經自動重載過了，這次要顯示錯誤畫面」。
 */
export function recoverFromStaleBuild(error: unknown): boolean {
  if (typeof window === 'undefined') return false;
  if (!isStaleBuildError(error)) return false;

  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* 無痕模式讀不到 sessionStorage —— 讀不到就不自動重載，寧可顯示錯誤畫面也不要無限迴圈 */
    return false;
  }

  window.location.reload();
  return true;
}
