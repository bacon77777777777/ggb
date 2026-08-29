'use client';

import { useCallback, useReducer, useRef } from 'react';

/**
 * 分批載入的哨兵登記簿：把每一顆哨兵都記下來，而不是只留最後掛上的那一顆。
 *
 * 為什麼需要：`renderProductSections()` 在同一頁被呼叫兩次 —— 手機版包在
 * `md:hidden` 的容器裡、桌機版包在 `<main>` 裡，兩份 DOM 同時存在，靠 CSS
 * 決定哪一份顯示。兩份各自渲染一顆哨兵，但共用同一個 `useRef`，
 * 後掛上的桌機那顆會蓋掉手機那顆。
 *
 * 結果就是桌機正常、手機永遠卡在「載入中...」：被觀察的是桌機那顆，
 * 它在手機上整段 `display:none`、量出來的 rect 是 0×0，
 * IntersectionObserver 永遠不會回報 isIntersecting。
 *
 * 改成兩顆都觀察，哪一顆在畫面上就由哪一顆觸發；沒顯示的那顆不會誤觸發，
 * 因為 display:none 的元素本來就不會 intersect。
 */
export function useSentinelRegistry() {
  const nodes = useRef<Set<HTMLDivElement>>(new Set());
  const [version, bump] = useReducer((v: number) => v + 1, 0);

  const register = useCallback((el: HTMLDivElement | null) => {
    // React 18 的 ref callback 沒有 cleanup，卸載時只會收到 null；
    // 舊節點改在 liveNodes() 用 isConnected 掃掉，不會累積。
    if (!el || nodes.current.has(el)) return;
    nodes.current.add(el);
    bump();
  }, []);

  const liveNodes = useCallback(() => {
    for (const el of nodes.current) if (!el.isConnected) nodes.current.delete(el);
    return [...nodes.current];
  }, []);

  return { register, liveNodes, version };
}
