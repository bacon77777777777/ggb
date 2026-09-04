'use client';

import { useEffect, useState } from 'react';

/**
 * 視窗寬度有沒有到 `px`。初值 null＝還不知道（SSR 與第一次 render），
 * 呼叫端在 null 時先不畫，兩棵樹（手機版／cardx）才不會同時掛上去、也不會 hydration 對不上。
 */
export function useMinWidth(px: number): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [px]);
  return matches;
}
