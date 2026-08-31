'use client';

/**
 * 找出畫面上的底部欄本體，讓要「貼在它上緣」的東西直接掛進去（portal）。
 *
 * 兩種底部欄都要認：首頁是 MobileTabbar，商品內頁是底部操作欄
 * （立即抽獎／立即開包…）。兩者不會同時出現，取有高度的那個。
 *
 * 不抓著同一個節點：導航列先渲染 Suspense 骨架再換成本體，
 * 骨架被卸載後 portal 會掛在孤兒節點上，掛在上面的東西就整條消失。
 * 所以 DOM 一動就重找（用 rAF 合併，一幀最多一次）。
 *
 * 為什麼要 portal 進去，而不是自己開一個 fixed 元素去對齊：見 NoticeBar 的長註解
 * —— 自己算偏移在 iPhone Safari 上會飛掉（網址列收合時 safe-area 由 0 變 ~34px，
 * 底部欄當場重排，JS 量到的數字要等 ResizeObserver 回呼才跟上）。
 * 掛進底部欄之後兩者是同一個圖層、同一次重排，沒有可以分家的空間。
 */

import { useEffect, useState } from 'react';

export function useBottomBar(active: boolean) {
  const [bar, setBar] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) { setBar(null); return; }
    let raf = 0;
    const find = () => {
      const els = Array.from(document.querySelectorAll<HTMLElement>(
        '[data-testid="mobile-tabbar"], [data-testid="bottom-action-bar"]',
      ));
      let best: HTMLElement | null = null;
      for (const el of els) {
        if (!el.isConnected || el.offsetHeight <= 0) continue;
        if (!best || el.offsetHeight > best.offsetHeight) best = el;
      }
      setBar(prev => (prev === best ? prev : best));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(find);
    };
    find();
    schedule();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [active]);

  return bar;
}

export default useBottomBar;
