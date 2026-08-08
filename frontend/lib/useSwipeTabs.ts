'use client';

import { useRef } from 'react';

/**
 * 頁籤左右滑切換 —— 全站共用的手勢
 *
 * 老闆指定：前台有 tab 頁籤的頁面都要能左右滑動切頁。
 * 把手勢處理集中在這裡，每頁只要把回傳的兩個 handler 撒在內容容器上。
 *
 * 三道防呆，缺一個就會誤觸：
 * 1. **邊緣讓位**：起點在螢幕左右 28px 內不理 —— 那是 iOS 系統
 *    「返回/前進」手勢的地盤，搶了會跟系統打架
 * 2. **水平捲動區讓位**：起點落在可以左右捲的元素裡（商品輪播、
 *    分類 chips 列）不理 —— 玩家是在捲它，不是在切頁
 * 3. **斜滑不算**：水平位移要夠大（56px）且明顯大於垂直位移，
 *    上下捲頁面時手指帶一點斜度不該切頁；拖超過 600ms 視為瀏覽也不算
 */

const EDGE_PX = 28;
const MIN_DX = 56;
const MAX_DURATION_MS = 600;
const H_V_RATIO = 1.6;

function startsInHorizontalScroller(target: EventTarget | null, boundary: HTMLElement): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== boundary) {
    if (node.scrollWidth > node.clientWidth + 4) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowX)) return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function useSwipeTabs<T extends string>(
  keys: readonly T[],
  active: T,
  onChange: (key: T) => void,
) {
  const start = useRef<{ x: number; y: number; at: number; blocked: boolean } | null>(null);

  const onTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1) { start.current = null; return; }
    const t = e.touches[0];
    const blocked =
      t.clientX < EDGE_PX ||
      t.clientX > window.innerWidth - EDGE_PX ||
      startsInHorizontalScroller(e.target, e.currentTarget);
    start.current = { x: t.clientX, y: t.clientY, at: Date.now(), blocked };
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    const s = start.current;
    start.current = null;
    if (!s || s.blocked) return;
    if (Date.now() - s.at > MAX_DURATION_MS) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * H_V_RATIO) return;

    const i = keys.indexOf(active);
    if (i < 0) return;
    const next = dx < 0 ? i + 1 : i - 1;  // 往左滑 = 下一個頁籤
    if (next < 0 || next >= keys.length) return;
    onChange(keys[next]);
  };

  return { onTouchStart, onTouchEnd };
}
