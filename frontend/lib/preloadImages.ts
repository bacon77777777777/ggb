/**
 * 把一批圖先抓進瀏覽器快取（老闆 2026-09-03：撕開卡包翻牌時圖還沒到，翻開是黑的）。
 * 抽獎結果一回來就呼叫，演出（撕包、發牌）那幾秒剛好拿來載圖；演出元件自己也會再保險一次。
 * `new Image()` 不看可視範圍、也不管容器 visibility，一律開始下載。
 */
export function preloadImages(urls: (string | null | undefined)[]): void {
  if (typeof window === 'undefined') return;
  for (const u of urls) {
    if (!u) continue;
    const im = new window.Image();
    im.decoding = 'async';
    im.src = u;
  }
}

/** 給 setWonPrizes 用：抓完圖原樣回傳同一個陣列 */
export function preloadPrizeImages<T extends { image_url?: string | null }>(list: T[]): T[] {
  preloadImages(list.map(p => p.image_url));
  return list;
}
