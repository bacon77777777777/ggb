import React, { useState, useEffect, useMemo } from 'react';
import { Database } from '@/types/database.types';
import { GachaMachineVisual } from './GachaMachineVisual';
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

interface GachaProductDetailProps {
  product: Database['public']['Tables']['products']['Row'];
  prizes: Database['public']['Tables']['product_prizes']['Row'][];
}

export function GachaProductDetail({ product, prizes }: GachaProductDetailProps) {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [supabase] = useState(() => createClient());

  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const baseWidth = 375;
    const maxWidth = 560;

    const updateScale = () => {
      if (typeof window === 'undefined') return;
      const width = Math.min(window.innerWidth, maxWidth);
      setScale(width / baseWidth);
      setIsMobile(window.innerWidth <= 767);
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

  const isSoldOut = product.status === 'ended' || product.remaining === 0;

  const handlePush = () => {
    if (machineState !== 'idle') return;
    setPushSoundMode('manual');
    setShakeRepeats(1);
    setMachineState('shaking');
    setTimeout(() => {
      setMachineState('idle');
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
    const pointsCost = totalPrice * 3;
    
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

      const { data, error } = await supabase.rpc('play_gacha_locked', {
        p_product_id: product.id,
        p_count: clampedQty,
        p_use_points: options.usePoints,
        p_coupon_id: options.couponId || null
      });

      if (error) {
        const err = error as unknown as { message?: string; details?: string; hint?: string; code?: string };
        const msg = [err.message, err.details, err.hint].filter(Boolean).join(' | ');
        throw new Error(msg || '購買失敗，請稍後再試');
      }

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
      // We do NOT refresh profile here immediately to avoid revealing results via balance/collection updates.
      // Profile and collection will be refreshed when the result modal opens or closes.
      runGachaAnimation();

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
    if (machineState !== 'idle') return;
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

  return (
    <div className="min-h-screen pt-14 md:pt-0 overflow-x-hidden bg-neutral-50 dark:bg-neutral-950">
      {/* 機台區域 — scale 容器，只含機台視覺，不含下方內容 */}
      <div
        className="w-full flex justify-center"
        style={{
          marginBottom: Math.round(375 * (932 / 750) * (scale - 1)),
          backgroundImage: "url('/images/gacha/bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#000000',
        }}
      >
        <div
          className="relative"
          style={{
            width: 375,
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center px-4 rounded-full"
            style={{
              top: isMobile ? 92 : 40,
              height: 24,
              backgroundColor: 'rgba(0,0,0,0.7)',
              maxWidth: 320,
              zIndex: 20,
              pointerEvents: 'none',
              opacity: isEggBoxImageMode || isMobile ? 0 : 1,
              transition: 'opacity 200ms ease-out',
            }}
          >
            <span
              className="font-black text-center truncate"
              style={{ color: '#FFFF30', fontSize: 16 }}
            >
              {product.name}
            </span>
          </div>
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center px-3 rounded-full text-center"
            style={{
              top: 221,
              height: 20,
              backgroundColor: 'rgba(0,0,0,0.6)',
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            <span className="font-medium" style={{ color: '#FFFFFF', fontSize: 12 }}>
              點擊蛋箱顯示圖片
            </span>
          </div>
          <div className="w-full max-w-[750px] mx-auto">
            <div className="relative w-full" style={{ aspectRatio: '750/932' }}>
              <GachaMachineVisual
                state={machineState}
                shakeRepeats={shakeRepeats}
                onPush={handlePush}
                onPurchase={handlePurchaseClick}
                onTrial={handleTrial}
                onHoleClick={handleHoleClick}
                onLoaded={() => setIsMachineLoaded(true)}
                isSoldOut={isSoldOut}
                pushSoundMode={pushSoundMode}
                hasHighTierPending={forceGoldEgg || hasHighTierPending}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{ top: 42, width: 167, height: 167, zIndex: 20 }}
              >
                <div className="relative w-full h-full">
                  <div
                    className="absolute inset-0 cursor-pointer"
                    style={{
                      opacity: isEggBoxImageMode ? 0 : 1,
                      pointerEvents: isEggBoxImageMode ? 'none' : 'auto',
                      transition: 'opacity 200ms ease-out',
                    }}
                    onClick={() => { if (!product.id) return; setIsEggBoxImageMode(true); }}
                  />
                  {product.id && (
                    <div
                      className="absolute inset-0 flex items-center justify-center cursor-pointer"
                      style={{
                        opacity: isEggBoxImageMode ? 1 : 0,
                        pointerEvents: isEggBoxImageMode ? 'auto' : 'none',
                        transition: 'opacity 200ms ease-out',
                      }}
                      onClick={() => setIsEggBoxImageMode(false)}
                    >
                      <Image
                        src={product.image_url || `/images/item/${product.id.toString().padStart(5, '0')}.jpg`}
                        alt={product.name}
                        fill
                        className="rounded-lg object-fill"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.srcset = '/images/item.png';
                          target.src = '/images/item.png';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              {!isMachineLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80">
                  <div className="flex flex-col items-center gap-3 text-white">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-xs font-black tracking-widest">載入機台中...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 總覽 + 猜你喜歡 — 在 scale 容器外，正常文件流 */}
      <div className="w-full max-w-[560px] mx-auto px-2 pb-24 mt-2">
        <GachaCollectionList productId={product.id} product={product} prizes={prizes} refreshKey={collectionRefreshKey} />
      </div>

      <GachaResultModal
        isOpen={showResultModal}
        onClose={handleResultClose}
        results={wonPrizes}
      />

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
