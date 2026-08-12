'use client';

import { useEffect, useState } from 'react';
import { isSoundMuted, subscribeSoundMuted } from '@/lib/soundPrefs';

/**
 * 讀取全站靜音偏好，並在別處切換時跟著更新。
 *
 * 抽獎演出裡的 `<video>` 與 `new Audio()` 不經過 `lib/sfx`，
 * 沒辦法像機台音效那樣自動被 `soundPrefs` 靜音，得各自訂閱。
 * 這些畫面原本各自 `useState(false)` 管一顆自己的開關 —— 玩家在商品頁
 * 關掉聲音，進了演出又自己響起來，所以統一改吃這裡。
 *
 * SSR 期間一律回 false（等同沒靜音），掛載後才讀 localStorage，
 * 避免 hydration 前後不一致。
 */
export function useSoundMuted(): boolean {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(isSoundMuted());
    return subscribeSoundMuted(setMuted);
  }, []);

  return muted;
}

export default useSoundMuted;
