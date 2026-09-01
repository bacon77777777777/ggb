import { asset } from '@/lib/asset';

/**
 * 內建卡包圖的閒置暖機
 *
 * **為什麼要**：抽卡商品頁上半部那個 3D 輪播，貼圖是掛載之後才開始下載的。
 * 玩家點進商品頁的那一刻才發第一個請求，於是前幾百毫秒卡包是空的
 *（老闆 2026-09-01 回報「卡包都顯示純白底、渲染很慢」）。
 *
 * 這五款是站上內建的靜態檔、帶 `?v=` 內容雜湊、有一年 immutable 快取，
 * 所以**只要在列表頁先抓過一次，之後點進任何抽卡商品都是本機讀取**，
 * 不用等網路 —— 這就是「進來就已經渲染好」而又不必加載入畫面的作法。
 *
 * ── 三條自我約束 ──────────────────────────────────────────────
 *
 * 1. **只在瀏覽器閒置時做**（requestIdleCallback）。它是加分項，不該跟
 *    首屏的商品圖、字型搶頻寬。
 * 2. **省流量模式與慢速網路直接放棄**。十張約 3.9MB，在 2G／3G 或使用者
 *    開了 Data Saver 的情況下，這個暖機幫不上忙只會扣他的流量。
 * 3. **正面先、背面後**。輪播是正面朝著鏡頭，正面到了那一格就顯示得出來；
 *    背面只有轉到側面或遠格才看得到（見 PackShowcase3D 的 applyOne）。
 *
 * 一個 session 只跑一次 —— 跑完圖就在 HTTP 快取裡，再叫也沒有意義。
 */

/** 與 `app/item/[id]/page.tsx` 的 PACK_STYLES 同一組。加款式時兩邊都要加 */
const PACK_STYLES = ['a', 'b', 'c', 'd', 'e'] as const;

let started = false;

/** 使用者明講要省流量、或網路本來就慢 —— 那就別多抓這 3.9MB */
function shouldSkip(): boolean {
  const c = (navigator as unknown as {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!c) return false;
  if (c.saveData) return true;
  return c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g';
}

const idle = (fn: () => void) => {
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 3000 });
  else setTimeout(fn, 1200);
};

/** 一張一張排隊，不要一次塞十個請求把首屏的圖擠掉 */
async function warm(urls: string[]) {
  for (const src of urls) {
    await new Promise<void>(resolve => {
      const img = new window.Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();   // 抓不到就算了，這只是暖機
      img.src = src;
    });
  }
}

/**
 * 開始暖機。可以重複呼叫（例如列表上每張抽卡小卡都叫一次），只有第一次會真的做事。
 */
export function prefetchPackArt(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (shouldSkip()) return;

  idle(() => {
    const fronts = PACK_STYLES.map(s => asset(`/images/card/pack/${s}01.webp`));
    const backs = PACK_STYLES.map(s => asset(`/images/card/pack/${s}02.webp`));
    void warm(fronts).then(() => idle(() => void warm(backs)));
  });
}
