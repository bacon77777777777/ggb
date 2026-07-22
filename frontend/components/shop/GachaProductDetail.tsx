import React, { useState, useEffect, useMemo } from 'react';
import { Database } from '@/types/database.types';
import { GachaMachineVisual } from './GachaMachineVisual';
import { GachaMachineModern } from './GachaMachineModern';
import { GachaMachineRetro } from './GachaMachineRetro';
import { GachaMachineMode2 } from './GachaMachineMode2';
import { GachaMachineMode3 } from './GachaMachineMode3';
import { GachaMachineMode4 } from './GachaMachineMode4';
import { GachaCollectionList } from './GachaCollectionList';
import { GachaResultModal } from '@/components/shop/GachaResultModal';
import { Prize } from '@/components/GachaMachine';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useRouter } from 'next/navigation';
import { PurchaseConfirmationModal } from '@/components/shop/PurchaseConfirmationModal';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { trackEvent } from '@/lib/trackEvent';
import ProductBadge from '@/components/ui/ProductBadge';

interface GachaProductDetailProps {
  product: Database['public']['Tables']['products']['Row'];
  prizes: Database['public']['Tables']['product_prizes']['Row'][];
  machineTheme?: string;
  onMachineReady?: () => void;
}

const MACHINE_COMPONENTS: Record<string, React.ComponentType<React.ComponentProps<typeof GachaMachineVisual>>> = {
  gacha_classic: GachaMachineVisual,
  gacha_modern: GachaMachineModern,
  gacha_retro: GachaMachineRetro,
  gacha_mode2: GachaMachineMode2,
  gacha_mode3: GachaMachineMode3,
  gacha_mode4: GachaMachineMode4,
}

export function GachaProductDetail({ product, prizes, machineTheme, onMachineReady }: GachaProductDetailProps) {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [supabase] = useState(() => createClient());

  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const BASE = 375;
    const updateScale = () => {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth;
      const isMob = w <= 767;
      const isDesk = w >= 1024;
      setIsMobile(isMob);
      setIsDesktop(isDesk);
      if (isDesk) {
        // 左欄約 4/12 of (min(w,1280)-16px padding - 24px gap)
        const colW = Math.floor((Math.min(w, 1280) - 40) * 4 / 12);
        setScale(colW / BASE);
      } else {
        setScale(Math.min(w, 560) / BASE);
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  // States
  const [machineState, setMachineState] = useState<'idle' | 'shaking' | 'spinning' | 'dropping' | 'waiting' | 'result'>('idle');
  const [shakeRepeats, setShakeRepeats] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wonPrizes, setWonPrizes] = useState<Prize[]>([]);
  const [showResultModal, setShowResultModal] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [hasPendingResult, setHasPendingResult] = useState(false);
  const [isMachineLoaded, setIsMachineLoaded] = useState(false);
  const [isEggBoxImageMode, setIsEggBoxImageMode] = useState(false);
  const [forceGoldEgg, setForceGoldEgg] = useState(false);

  const hasHighTierPending = useMemo(() => {
    if (wonPrizes.length === 0) return false;
    if (machineState !== 'dropping' && machineState !== 'waiting' && machineState !== 'result') return false;

    const HIGH_TIER_GRADES = ['A', 'B', 'C', 'Last One', 'LAST ONE', 'SP'];

    return wonPrizes.some((prize) => {
      if (prize.is_last_one) return true;
      const grade = prize.grade || prize.rarity || '';
      if (!grade) return false;
      if (grade.includes('隱藏')) return true;
      if (grade.includes('最後賞')) return true;
      return HIGH_TIER_GRADES.some((tier) => grade.includes(tier));
    });
  }, [machineState, wonPrizes]);
  const [collectionRefreshKey, setCollectionRefreshKey] = useState(0);
  const [pushSoundMode, setPushSoundMode] = useState<'manual' | 'auto'>('auto');
  const [isPushShaking, setIsPushShaking] = useState(false);

  const isSoldOut = product.status === 'ended'
    || product.remaining === 0
    || (prizes.length > 0 && prizes.every(p => (p.remaining ?? 0) <= 0));

  const handlePush = () => {
    if (machineState !== 'idle') return;
    trackEvent('draw_preview', { productId: product.id, series: product.name });
    setPushSoundMode('manual');
    setShakeRepeats(1);
    setIsPushShaking(true);
    setMachineState('shaking');
    setTimeout(() => {
      setMachineState('idle');
      setIsPushShaking(false);
      setPushSoundMode('auto');
    }, 200);
  };

  const handlePurchaseClick = () => {
    if (machineState !== 'idle' || isProcessing) return;
    setIsPurchaseModalOpen(true);
  };

  const handlePurchaseConfirm = async (quantity: number, options: { usePoints: boolean, couponId?: string }) => {
    if (!product) return;
    if (!user) {
      showToast('請先登入會員', 'info');
      router.push('/login');
      return;
    }
    
    setForceGoldEgg(false);
    const totalPrice = product.price * quantity;
    const pointsCost = totalPrice * 4;
    
    if (options.usePoints) {
      if ((user.points || 0) < pointsCost) {
        showToast('積分不足，請先獲得積分', 'error');
        return;
      }
    } else {
      // If using coupon, we should check discounted price?
      // For now, let backend handle validation or do simple check here.
      // Since we don't have coupon info here (it's in the modal), we rely on backend or previous check.
      // PurchaseConfirmationModal checks balance before calling onConfirm.
      if ((user.tokens || 0) < totalPrice && !options.couponId) {
         // This check might be inaccurate if coupon is used.
         // But PurchaseConfirmationModal should have blocked it if insufficient.
      }
    }
    
    setIsProcessing(true);
    setIsPurchaseModalOpen(false);
    // Start animation immediately (API call runs in parallel)
    runGachaAnimation();
    try {
      let latestRemaining = product.remaining ?? 0;
      try {
        const { data: latest } = await supabase
          .from('products')
          .select('remaining, status')
          .eq('id', product.id)
          .single();
        if (latest) {
          latestRemaining = latest.remaining ?? latestRemaining;
          if (latest.status === 'ended' || latestRemaining <= 0) {
            setMachineState('idle');
            showToast('商品已完抽', 'info');
            setIsProcessing(false);
            return;
          }
        }
      } catch {
      }

      const clampedQty = Math.min(Math.max(1, quantity), Math.max(1, latestRemaining));
      if (clampedQty < quantity) {
        showToast(`剩餘數量不足，已調整為 ${clampedQty} 抽`, 'info');
      }

      const drawRes = await fetch('/api/gacha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          count: clampedQty,
          usePoints: options.usePoints,
          couponId: options.couponId || null,
        }),
      });

      if (!drawRes.ok) {
        const err = await drawRes.json().catch(() => ({}));
        throw new Error(err.error || '購買失敗，請稍後再試');
      }

      const drawJson = await drawRes.json();
      const data = drawJson.prizes;

      interface PlayGachaResult {
        name: string;
        grade: string;
        image_url: string;
        ticket_number?: number;
        is_last_one?: boolean;
      }

      const rawResults = data as unknown as PlayGachaResult[];
      let results = rawResults.map((item, index) => ({
        id: item.ticket_number !== undefined ? String(item.ticket_number) : `${product.id}-${index}`,
        name: item.name,
        rarity: item.grade,
        image_url: item.image_url,
        grade: item.grade,
        is_last_one: item.is_last_one,
        ticket_number: item.ticket_number
      }));

      if (results.some(r => !r.image_url) && prizes.length > 0) {
        const imageMap = new Map<string, string>();
        for (const p of prizes) {
          if (!p.image_url) continue;
          const key = `${(p.level || '').trim()}|${(p.name || '').trim()}`;
          if (!imageMap.has(key)) {
            imageMap.set(key, p.image_url);
          }
        }

        results = results.map(r => {
          if (r.image_url) return r;
          const key = `${(r.grade || '').trim()}|${(r.name || '').trim()}`;
          const mapped = imageMap.get(key);
          return mapped ? { ...r, image_url: mapped } : r;
        });
      }

      setWonPrizes(results);
      // Animation already started above; results will be available when user clicks the egg hole.

    } catch (error: unknown) {
      let errorMessage = '購買失敗，請稍後再試';

      const errObj = (typeof error === 'object' && error !== null) ? (error as Record<string, unknown>) : null;
      const nestedErrObj = (errObj && typeof errObj.error === 'object' && errObj.error !== null)
        ? (errObj.error as Record<string, unknown>)
        : null;

      const msgCandidate =
        (errObj && typeof errObj.message === 'string' && errObj.message) ? errObj.message :
        (nestedErrObj && typeof nestedErrObj.message === 'string' && nestedErrObj.message) ? nestedErrObj.message :
        (typeof error === 'string' ? error : undefined) ||
        (error instanceof Error ? error.message : undefined) ||
        undefined;

      if (typeof msgCandidate === 'string' && msgCandidate.trim()) {
        const msg = msgCandidate.trim();
        if (msg === 'DRAW_IN_PROGRESS') {
          errorMessage = '抽獎進行中，請稍後再試';
        } else if (msg === 'PRODUCT_BUSY') {
          errorMessage = '目前商品繁忙，請稍後再試';
        } else if (/not enough stock|no prizes left|商品已完抽|Not enough stock remaining/i.test(msg)) {
          errorMessage = '剩餘數量不足或已完抽，請刷新後重試';
        } else if (/function hmac\(|pgcrypto/i.test(msg)) {
          errorMessage = '系統更新中，請稍後重試（資料庫尚未同步）';
        } else {
          errorMessage = msg;
        }
      }

      const rawSummary =
        (typeof msgCandidate === 'string' && msgCandidate.trim())
          ? msgCandidate.trim()
          : (error instanceof Error ? error.message : '');
      console.error(`Purchase error: ${errorMessage}${rawSummary ? ` | raw=${rawSummary}` : ''}`);
      setMachineState('idle');
      showToast(errorMessage, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const runTrialAnimation = () => {
    setPushSoundMode('auto');
    setShakeRepeats(2);
    setMachineState('shaking');
    setTimeout(() => {
      setMachineState('dropping');
      setTimeout(() => {
        setMachineState('waiting');
        setHasPendingResult(true);
      }, 800);
    }, 2000);
  };

  const runGachaAnimation = () => {
    runTrialAnimation();
  };

  const handleResultClose = () => {
    setShowResultModal(false);
    setWonPrizes([]);
    setHasPendingResult(false);
    setForceGoldEgg(false);
    // Force refresh profile to update balance
    if (refreshProfile) {
      refreshProfile();
    }
    // After closing modal, ensure we are back to idle state and not navigating unexpectedly
    setMachineState('idle');
  };

  const handleTrial = () => {
    if (machineState !== 'idle' || isSoldOut) return;
    trackEvent('draw_trial', { productId: product.id, series: product.name });
    setForceGoldEgg(true);
    
    if (prizes.length > 0) {
      const scoreLevel = (levelRaw: string) => {
        const level = String(levelRaw || '').trim()
        if (level.includes('A賞') || level === 'A') return 1000
        if (level.includes('SSR')) return 1000
        if (level.includes('最後賞') || /last\s*one/i.test(level)) return 950
        if (level.includes('SP賞') || level.includes('SP')) return 900
        if (level.includes('S賞') || level === 'S') return 880
        if (level.includes('B賞') || level === 'B') return 800
        if (level.includes('C賞') || level === 'C') return 700
        if (level.includes('D賞') || level === 'D') return 650
        if (level.includes('隱藏')) return 820
        if (level.includes('限定')) return 810
        if (level.includes('傳說')) return 800
        if (level.includes('超稀有')) return 750
        if (level.includes('稀有')) return 700
        if (level.includes('普通')) return 650
        if (level.includes('小賞')) return 100
        return 500
      }

      const sample = prizes.reduce((best, cur) => {
        if (!best) return cur
        const bestScore = scoreLevel(String(best.level || ''))
        const curScore = scoreLevel(String(cur.level || ''))
        if (curScore !== bestScore) return curScore > bestScore ? cur : best
        if (cur.image_url && !best.image_url) return cur
        return best
      }, prizes[0])
      setWonPrizes([
        {
          id: String(sample.id),
          name: sample.name,
          rarity: sample.level,
          image_url: sample.image_url || undefined,
          grade: sample.level,
          is_last_one: false,
        }
      ]);
    }

    runTrialAnimation();
  };

  const handleHoleClick = () => {
    if (!hasPendingResult || wonPrizes.length === 0) return;
    setShowResultModal(true);
    // Refresh collection when showing results, so the collection list updates AFTER the user sees the result.
    setCollectionRefreshKey(prev => prev + 1);
    if (refreshProfile) {
      refreshProfile();
    }
    setMachineState('result');
  };

  // 機台內容（手機/桌面共用 JSX 片段，由父層控制 scale 與容器）
  const renderMachineInner = () => (
    <div
      className="relative"
      style={{ width: 375, transform: `scale(${scale})`, transformOrigin: 'top center' }}
    >
      {/* 點擊蛋箱提示 */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center px-3 rounded-full text-center"
        style={{ top: 221, height: 20, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 20, pointerEvents: 'none' }}
      >
        <span className="font-medium" style={{ color: '#FFFFFF', fontSize: 12 }}>點擊蛋箱顯示圖片</span>
      </div>
      <div className="w-full max-w-[750px] mx-auto">
        <div className="relative w-full" style={{ aspectRatio: '750/932' }}>
          {(() => {
            const MachineComponent = MACHINE_COMPONENTS[machineTheme || 'gacha_classic'] ?? GachaMachineVisual;
            return (
              <MachineComponent
                state={machineState}
                shakeRepeats={shakeRepeats}
                onPush={handlePush}
                onPurchase={handlePurchaseClick}
                onTrial={handleTrial}
                onHoleClick={handleHoleClick}
                onLoaded={() => { setIsMachineLoaded(true); onMachineReady?.(); }}
                isSoldOut={isSoldOut}
                pushSoundMode={pushSoundMode}
                hasHighTierPending={forceGoldEgg || hasHighTierPending}
                disableButtons={machineState !== 'idle' && !isPushShaking}
              />
            );
          })()}
          {/* 蛋箱圖片切換區 */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 42, width: 167, height: 167, zIndex: 20 }}>
            <div className="relative w-full h-full">
              <div
                className="absolute inset-0 cursor-pointer"
                style={{ opacity: isEggBoxImageMode ? 0 : 1, pointerEvents: isEggBoxImageMode ? 'none' : 'auto', transition: 'opacity 200ms ease-out' }}
                onClick={() => { if (!product.id) return; setIsEggBoxImageMode(true); }}
              />
              {product.id && (
                <div
                  className="absolute inset-0 flex items-center justify-center cursor-pointer"
                  style={{ opacity: isEggBoxImageMode ? 1 : 0, pointerEvents: isEggBoxImageMode ? 'auto' : 'none', transition: 'opacity 200ms ease-out' }}
                  onClick={() => setIsEggBoxImageMode(false)}
                >
                  <Image
                    src={product.image_url || `/images/item/${product.id.toString().padStart(5, '0')}.jpg`}
                    alt={product.name} fill className="rounded-lg object-fill"
                    onError={(e) => { const t = e.target as HTMLImageElement; t.srcset = '/images/item.png'; t.src = '/images/item.png'; }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pt-14 md:pt-0 bg-neutral-50 dark:bg-neutral-950">

      {/* ── 手機/平板（< 1024px）：原始直式佈局，完全不動 ── */}
      <div className="block lg:hidden overflow-x-hidden pb-32">
        <div
          className="w-full flex justify-center"
          style={{ marginBottom: Math.round(375 * (932 / 750) * (scale - 1)) }}
        >
          {renderMachineInner()}
        </div>
        <div className="w-full max-w-[560px] mx-auto px-2 pb-2 mt-2">
          <GachaCollectionList productId={product.id} product={product} prizes={prizes} refreshKey={collectionRefreshKey} />
        </div>
      </div>

      {/* ── 桌面（≥ 1024px）：左右分欄 ── */}
      <div className="hidden lg:block pb-12">
        <div className="max-w-7xl mx-auto px-2 pt-20 pb-6">
          <div className="grid grid-cols-12 gap-6 items-start">

            {/* 左欄：機台 + 資訊（sticky） */}
            <div className="col-span-4 sticky top-20">
              <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                {/* 機台：明確高度 = 視覺高度，防止 overflow-hidden 切掉 */}
                <div
                  className="w-full overflow-hidden flex justify-center"
                  style={{ height: Math.round(scale * 375 * 932 / 750) }}
                >
                  {renderMachineInner()}
                </div>

                {/* 商品名稱 + 價格 + 剩餘 */}
                <div className="p-5 space-y-3">
                  <h1 className="text-lg font-black text-neutral-900 dark:text-neutral-50 leading-tight tracking-tight break-all">
                    <span className="inline-block align-middle mr-2">
                      <ProductBadge type={product.type as 'gacha' | 'blindbox' | 'ichiban' | 'card' | 'custom'} className="h-5 px-1.5 text-[10px]" />
                    </span>
                    <span className="align-middle">{product.name}</span>
                  </h1>

                  {(product as any).is_preorder && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-yellow-50 text-yellow-700 border border-yellow-200">
                      <span className="text-[11px] font-black">預購商品</span>
                      <span className="text-[11px] font-bold">
                        預計可配送日 {(product as any).preorder_available_at
                          ? new Date((product as any).preorder_available_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
                          : '待公布'}
                      </span>
                    </div>
                  )}

                  <div className="flex items-end justify-between gap-2 pb-4 border-b border-neutral-50 dark:border-neutral-800">
                    <div className="flex items-baseline gap-2">
                      <Image src="/images/gcoin.png" alt="G Coin" width={20} height={20} className="w-5 h-5 object-contain" />
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-black text-accent-red font-amount tracking-tighter leading-none">
                          {product.price.toLocaleString()}
                        </span>
                        <span className="text-sm text-neutral-400 font-black uppercase tracking-widest">/ 抽</span>
                      </div>
                    </div>
                    {typeof product.remaining === 'number' && (
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-neutral-400 font-bold">剩餘</div>
                        <div className="text-xl font-black text-neutral-900 dark:text-white font-amount leading-none">
                          {product.remaining.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 右欄：品項列表 */}
            <div className="col-span-8">
              <GachaCollectionList productId={product.id} product={product} prizes={prizes} refreshKey={collectionRefreshKey} />
            </div>
          </div>
        </div>
      </div>

      <GachaResultModal isOpen={showResultModal} onClose={handleResultClose} results={wonPrizes} />
      <PurchaseConfirmationModal
        isOpen={isPurchaseModalOpen}
        onClose={() => !isProcessing && setIsPurchaseModalOpen(false)}
        onConfirm={handlePurchaseConfirm}
        product={product}
        userTokens={user?.tokens || 0}
        userPoints={user?.points || 0}
        isProcessing={isProcessing}
        onTopUp={() => router.push('/topup')}
      />
    </div>
  );
}
