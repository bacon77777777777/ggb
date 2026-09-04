'use client';

/**
 * 抽獎流程（購買彈窗 → 扣款抽獎 → 機台演出 → 中獎彈窗）
 *
 * 桌機商品頁（cardx 版）用這支把「立即開抽／試試看／推一下」接上真的抽獎，
 * 流程與手機商品頁 `components/shop/GachaProductDetail.tsx` 完全一致：
 * 同一支 `/api/gacha`、同一組演出時間、同樣先跑動畫再等 API 回來。
 *
 * ⚠️ 手機頁沒有改成吃這支 —— 它的演出與機台狀態綁在同一個元件裡，
 * 抽出來要動到 768 以下的畫面。老闆的規則是手機端一個字都不能動，
 * 所以這裡是照抄一份給桌機用，不是把手機重構掉。
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Database } from '@/types/database.types';
import type { Prize } from '@/components/GachaMachine';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/trackEvent';
import { hapticHeavy, hapticLight, hapticMedium, hapticNotify } from '@/lib/haptics';

type ProductRow = Database['public']['Tables']['products']['Row'];
type PrizeRow = Database['public']['Tables']['product_prizes']['Row'];

export type MachineState = 'idle' | 'shaking' | 'spinning' | 'dropping' | 'waiting' | 'result';

/** 演出裡「值得給大回饋」的賞等（金蛋、重震動） */
const HIGH_TIER_GRADES = ['A', 'B', 'C', 'Last One', 'LAST ONE', 'SP'];

/** 試試看要挑哪一項來演：分數高的優先（跟手機頁同一張表） */
function scoreLevel(levelRaw: string) {
  const level = String(levelRaw || '').trim();
  if (level.includes('A賞') || level === 'A') return 1000;
  if (level.includes('SSR')) return 1000;
  if (level.includes('最後賞') || /last\s*one/i.test(level)) return 950;
  if (level.includes('SP賞') || level.includes('SP')) return 900;
  if (level.includes('S賞') || level === 'S') return 880;
  if (level.includes('B賞') || level === 'B') return 800;
  if (level.includes('C賞') || level === 'C') return 700;
  if (level.includes('D賞') || level === 'D') return 650;
  if (level.includes('隱藏')) return 820;
  if (level.includes('限定')) return 810;
  if (level.includes('傳說')) return 800;
  if (level.includes('超稀有')) return 750;
  if (level.includes('稀有')) return 700;
  if (level.includes('普通') || level.includes('一般')) return 650;
  if (level.includes('小賞')) return 100;
  return 500;
}

function readableError(error: unknown): string {
  const errObj = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const nested = errObj && typeof errObj.error === 'object' && errObj.error !== null
    ? (errObj.error as Record<string, unknown>)
    : null;
  const raw =
    (errObj && typeof errObj.message === 'string' && errObj.message) ||
    (nested && typeof nested.message === 'string' && nested.message) ||
    (typeof error === 'string' ? error : '') ||
    (error instanceof Error ? error.message : '');
  const msg = String(raw || '').trim();
  if (!msg) return '購買失敗，請稍後再試';
  if (msg === 'DRAW_IN_PROGRESS') return '抽獎進行中，請稍後再試';
  if (msg === 'PRODUCT_BUSY') return '目前商品繁忙，請稍後再試';
  if (/not enough stock|no prizes left|商品已完抽/i.test(msg)) return '剩餘數量不足或已完抽，請刷新後重試';
  if (/function hmac\(|pgcrypto/i.test(msg)) return '系統更新中，請稍後重試（資料庫尚未同步）';
  return msg;
}

export function useGachaDraw(product: ProductRow | null, prizes: PrizeRow[]) {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [supabase] = useState(() => createClient());

  const [machineState, setMachineState] = useState<MachineState>('idle');
  const [shakeRepeats, setShakeRepeats] = useState(1);
  const [pushSoundMode, setPushSoundMode] = useState<'manual' | 'auto'>('auto');
  const [isPushShaking, setIsPushShaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wonPrizes, setWonPrizes] = useState<Prize[]>([]);
  const [showResultModal, setShowResultModal] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [hasPendingResult, setHasPendingResult] = useState(false);
  const [forceGoldEgg, setForceGoldEgg] = useState(false);
  const [collectionRefreshKey, setCollectionRefreshKey] = useState(0);

  const timersRef = useRef<number[]>([]);
  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const isSoldOut = !!product && (
    product.status === 'ended'
    || product.remaining === 0
    || (prizes.length > 0 && prizes.every((p) => (p.remaining ?? 0) <= 0))
  );

  /** 演出進行中就鎖住互動（推一下的 200ms 晃動不算） */
  const machineDisabled = machineState !== 'idle' && !isPushShaking;

  const hasHighTierPending = useMemo(() => {
    if (wonPrizes.length === 0) return false;
    if (machineState !== 'dropping' && machineState !== 'waiting' && machineState !== 'result') return false;
    return wonPrizes.some((prize) => {
      if (prize.is_last_one) return true;
      const grade = prize.grade || prize.rarity || '';
      if (!grade) return false;
      if (grade.includes('隱藏') || grade.includes('最後賞')) return true;
      return HIGH_TIER_GRADES.some((tier) => grade.includes(tier));
    });
  }, [machineState, wonPrizes]);

  const runAnimation = useCallback(() => {
    clearTimers();
    setPushSoundMode('auto');
    setShakeRepeats(2);
    setMachineState('shaking');
    hapticMedium();
    const t1 = window.setTimeout(() => {
      setMachineState('dropping');
      hapticMedium();
      const t2 = window.setTimeout(() => {
        setMachineState('waiting');
        setHasPendingResult(true);
      }, 800);
      timersRef.current.push(t2);
    }, 2000);
    timersRef.current.push(t1);
  }, [clearTimers]);

  const handlePush = useCallback(() => {
    if (!product || machineState !== 'idle') return;
    hapticLight();
    trackEvent('draw_preview', { productId: product.id, series: product.name });
    setPushSoundMode('manual');
    setShakeRepeats(1);
    setIsPushShaking(true);
    setMachineState('shaking');
    window.setTimeout(() => {
      setMachineState('idle');
      setIsPushShaking(false);
      setPushSoundMode('auto');
    }, 200);
  }, [product, machineState]);

  const openPurchase = useCallback(() => {
    if (!product || machineState !== 'idle' || isProcessing || isSoldOut) return;
    if (!user) { showToast('請先登入會員', 'info'); router.push('/login'); return; }
    setIsPurchaseModalOpen(true);
  }, [product, machineState, isProcessing, isSoldOut, user, showToast, router]);

  const confirmPurchase = useCallback(async (quantity: number, options: { usePoints: boolean; couponId?: string }) => {
    if (!product) return;
    if (!user) { showToast('請先登入會員', 'info'); router.push('/login'); return; }

    setForceGoldEgg(false);
    if (options.usePoints && (user.points || 0) < product.price * quantity * 4) {
      showToast('積分不足，請先獲得積分', 'error');
      return;
    }

    setIsProcessing(true);
    setIsPurchaseModalOpen(false);
    // 先開始演出，API 平行跑（跟手機頁一樣，玩家不用盯著轉圈圈等）
    runAnimation();

    try {
      let latestRemaining = product.remaining ?? 0;
      try {
        const { data: latest } = await supabase.from('products').select('remaining, status').eq('id', product.id).single();
        if (latest) {
          latestRemaining = latest.remaining ?? latestRemaining;
          if (latest.status === 'ended' || latestRemaining <= 0) {
            clearTimers();
            setMachineState('idle');
            showToast('商品已完抽', 'info');
            setIsProcessing(false);
            return;
          }
        }
      } catch {}

      const clampedQty = Math.min(Math.max(1, quantity), Math.max(1, latestRemaining));
      if (clampedQty < quantity) showToast(`剩餘數量不足，已調整為 ${clampedQty} 抽`, 'info');

      const res = await fetch('/api/gacha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          count: clampedQty,
          usePoints: options.usePoints,
          couponId: options.couponId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '購買失敗，請稍後再試');
      }
      const json = await res.json();
      const raw = (json.prizes || []) as {
        name: string; grade: string; image_url: string; ticket_number?: number; is_last_one?: boolean;
      }[];

      let results: Prize[] = raw.map((item, index) => ({
        id: item.ticket_number !== undefined ? String(item.ticket_number) : `${product.id}-${index}`,
        name: item.name,
        rarity: item.grade,
        image_url: item.image_url,
        grade: item.grade,
        is_last_one: item.is_last_one,
        ticket_number: item.ticket_number,
      }));

      // API 沒帶圖時照「賞等＋品名」補上品項圖
      if (results.some((r) => !r.image_url) && prizes.length > 0) {
        const imageMap = new Map<string, string>();
        for (const p of prizes) {
          if (!p.image_url) continue;
          const key = `${(p.level || '').trim()}|${(p.name || '').trim()}`;
          if (!imageMap.has(key)) imageMap.set(key, p.image_url);
        }
        results = results.map((r) => (r.image_url
          ? r
          : { ...r, image_url: imageMap.get(`${(r.grade || '').trim()}|${(r.name || '').trim()}`) ?? r.image_url }));
      }

      setWonPrizes(results);
    } catch (error) {
      const message = readableError(error);
      console.error('Purchase error:', message);
      clearTimers();
      setMachineState('idle');
      showToast(message, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [product, user, prizes, supabase, showToast, router, runAnimation, clearTimers]);

  const handleTrial = useCallback(() => {
    if (!product || machineState !== 'idle' || isSoldOut) return;
    trackEvent('draw_trial', { productId: product.id, series: product.name });
    setForceGoldEgg(true);
    if (prizes.length > 0) {
      const sample = prizes.reduce((best, cur) => {
        if (!best) return cur;
        const b = scoreLevel(String(best.level || ''));
        const c = scoreLevel(String(cur.level || ''));
        if (c !== b) return c > b ? cur : best;
        if (cur.image_url && !best.image_url) return cur;
        return best;
      }, prizes[0]);
      setWonPrizes([{
        id: String(sample.id),
        name: sample.name,
        rarity: sample.level,
        image_url: sample.image_url || undefined,
        grade: sample.level,
        is_last_one: false,
      }]);
    }
    runAnimation();
  }, [product, machineState, isSoldOut, prizes, runAnimation]);

  /** 蛋掉下來之後點取物口才看結果（跟手機一樣，不自動彈） */
  const handleHoleClick = useCallback(() => {
    if (!hasPendingResult || wonPrizes.length === 0) return;
    if (wonPrizes.some((p) => p.is_last_one)) hapticHeavy();
    else hapticNotify('SUCCESS');
    setShowResultModal(true);
    setCollectionRefreshKey((k) => k + 1);
    refreshProfile?.();
    setMachineState('result');
  }, [hasPendingResult, wonPrizes, refreshProfile]);

  const closeResult = useCallback(() => {
    clearTimers();
    setShowResultModal(false);
    setWonPrizes([]);
    setHasPendingResult(false);
    setForceGoldEgg(false);
    refreshProfile?.();
    setMachineState('idle');
  }, [clearTimers, refreshProfile]);

  return {
    machineState,
    shakeRepeats,
    pushSoundMode,
    isProcessing,
    isSoldOut,
    machineDisabled,
    hasHighTierPending: forceGoldEgg || hasHighTierPending,
    wonPrizes,
    showResultModal,
    isPurchaseModalOpen,
    collectionRefreshKey,
    handlePush,
    openPurchase,
    closePurchase: () => { if (!isProcessing) setIsPurchaseModalOpen(false); },
    confirmPurchase,
    handleTrial,
    handleHoleClick,
    closeResult,
  };
}
