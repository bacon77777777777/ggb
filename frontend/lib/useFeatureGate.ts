'use client';

import { notFound } from 'next/navigation';
import { useFeatureFlags, type FeatureKey, type FlagState } from '@/contexts/FeatureFlagsContext';

/**
 * 功能沒開放就直接吐 404
 *
 * ── 為什麼是 404，不是導回首頁 ──
 * 原本 `/market` 與 `/challenge` 是 `router.replace('/')`：頁面先載一半、
 * 閃一下再被彈回首頁，玩家會覺得「我按錯了嗎」。老闆指定改成直接 404。
 * `notFound()` 會渲染最近的 `not-found.tsx`，沒有任何跳轉。
 *
 * ── 維護中也擋 ──
 * 維護中的入口在首頁選單上**還會顯示**（點下去跳提示，讓玩家知道會回來），
 * 但直接打網址進來一樣擋掉 —— 頁面本身不能用，讓人進去看半成品更糟。
 *
 * ── 一定要等旗標載完 ──
 * `isLoading` 期間不判斷。旗標是非同步讀的，載入中就 404 的話，
 * 每次進頁面都會先閃一次找不到頁面。
 */
export function useFeatureGate(key: FeatureKey): { state: FlagState; isLoading: boolean } {
  const { states, isLoading } = useFeatureFlags();
  const state = (states?.[key] ?? 'on') as FlagState;
  if (!isLoading && state !== 'on') notFound();
  return { state, isLoading };
}
