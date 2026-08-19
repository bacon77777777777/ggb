import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Database } from '@/types/database.types';
import { GachaMachineVisual } from './GachaMachineVisual';
import { GachaMachineModern } from './GachaMachineModern';
import { GachaMachineRetro } from './GachaMachineRetro';
import { GachaMachineMode2 } from './GachaMachineMode2';
import { GachaMachineMode3 } from './GachaMachineMode3';
import { GachaMachineMode4 } from './GachaMachineMode4';
import { GachaMachineMode5 } from './GachaMachineMode5';
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
import PinchZoomImage from '@/components/ui/PinchZoomImage';
import { SoundToggle } from '@/components/ui/SoundToggle';
import { trackEvent } from '@/lib/trackEvent';
import ProductBadge from '@/components/ui/ProductBadge';
import { hapticHeavy, hapticLight, hapticMedium, hapticNotify } from '@/lib/haptics';

interface GachaProductDetailProps {
  product: Database['public']['Tables']['products']['Row'];
  prizes: Database['public']['Tables']['product_prizes']['Row'][];
  machineTheme?: string;
  onMachineReady?: () => void;
}

/** 機台本身不畫按鈕的主題 —— 推一下／立即轉蛋／試試看改走頁面底部操作欄 */
const BUTTONLESS_THEMES = ['gacha_mode2', 'gacha_mode5']

const MACHINE_COMPONENTS: Record<string, React.ComponentType<React.ComponentProps<typeof GachaMachineVisual>>> = {
  gacha_classic: GachaMachineVisual,
  gacha_modern: GachaMachineModern,
  gacha_retro: GachaMachineRetro,
  gacha_mode2: GachaMachineMode2,
  gacha_mode3: GachaMachineMode3,
  gacha_mode4: GachaMachineMode4,
  gacha_mode5: GachaMachineMode5,
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
  // 商品圖預設顯示（老闆指定），點一下收起看蛋箱
  const [isEggBoxImageMode, setIsEggBoxImageMode] = useState(true);
  const [forceGoldEgg, setForceGoldEgg] = useState(false);

  const animTimersRef = useRef<number[]>([]);
  const clearAnimTimers = () => {
    animTimersRef.current.forEach(id => window.clearTimeout(id));
    animTimersRef.current = [];
  };

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

  /** 演出進行中就鎖住互動。機台內建按鈕與 mode5 的底部操作欄共用同一個判斷 */
  const machineDisabled = machineState !== 'idle' && !isPushShaking;

  const handlePush = () => {
    if (machineState !== 'idle') return;
    hapticLight();
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
            clearAnimTimers();
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
      clearAnimTimers();
      setMachineState('idle');
      showToast(errorMessage, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const runTrialAnimation = () => {
    clearAnimTimers();
    setPushSoundMode('auto');
    setShakeRepeats(2);
    setMachineState('shaking');
    hapticMedium();                    // 機台開始轉
    const t1 = window.setTimeout(() => {
      setMachineState('dropping');
      hapticMedium();                  // 蛋掉下來
      const t2 = window.setTimeout(() => {
        setMachineState('waiting');
        setHasPendingResult(true);
      }, 800);
      animTimersRef.current.push(t2);
    }, 2000);
    animTimersRef.current.push(t1);
  };

  const runGachaAnimation = () => {
    runTrialAnimation();
  };

  const handleResultClose = () => {
    clearAnimTimers();
    setShowResultModal(false);
    setWonPrizes([]);
    setHasPendingResult(false);
    setForceGoldEgg(false);
    if (refreshProfile) {
      refreshProfile();
    }
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
        if (level.includes('普通') || level.includes('一般')) return 650
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
    // 最後賞給最重的回饋，其餘用系統的「成功」震動樣式
    if (wonPrizes.some(p => p.is_last_one)) hapticHeavy();
    else hapticNotify('SUCCESS');
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
                disableButtons={machineDisabled}
              />
            );
          })()}
          {/* 蛋箱裡的商品圖：預設就顯示（老闆指定），點一下收起、再點一下又出現。
              整塊維持可點擊 —— 收起後那層就是「再點一次」的目標，
              不然圖藏起來之後玩家沒有東西可以點回來。 */}
          {product.id && (
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{ top: 30, width: 232, height: 200, zIndex: 20,
                       opacity: isEggBoxImageMode ? 1 : 0,
                       // 收起時整層不吃觸控，不然看不見的縮放區還會攔手勢
                       pointerEvents: isEggBoxImageMode ? 'auto' : 'none',
                       transition: 'opacity 200ms ease-out' }}
            >
              {/* 雙指可放大／拖移看細節（放開彈回，放大時會浮到全螢幕不被機台框裁掉）；
                  單指點一下才收起 —— 跟盒玩、抽卡走同一支元件，手感一致 */}
              <PinchZoomImage
                src={product.image_url || `/images/item/${product.id.toString().padStart(5, '0')}.jpg`}
                alt={product.name}
                className="h-full w-full"
                onTap={() => setIsEggBoxImageMode(false)}
              />
            </div>
          )}
          {/* 收起後的點擊區：圖藏起來就沒有東西可以點回來，
              所以留一塊透明的觸發區在原位 */}
          {product.id && !isEggBoxImageMode && (
            <div
              className="absolute left-1/2 -translate-x-1/2 cursor-pointer"
              style={{ top: 30, width: 232, height: 200, zIndex: 21 }}
              onClick={() => setIsEggBoxImageMode(true)}
            />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pt-14 md:pt-0 bg-neutral-50 dark:bg-neutral-950">

      {/* ── 手機/平板（< 1024px）：原始直式佈局，完全不動 ── */}
      <div className="block lg:hidden overflow-x-hidden pb-32">
        <div
          className="relative w-full flex justify-center"
          style={{ marginBottom: Math.round(375 * (932 / 750) * (scale - 1)) }}
        >
          {renderMachineInner()}
          {/* 聲音開關掛在機台外層而不是 renderMachineInner 裡面 ——
              機台那層有 scale()，放進去按鈕會跟著機台一起被縮放。 */}
          <SoundToggle className="absolute top-3 right-3 z-30" />
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
                  className="relative w-full overflow-hidden flex justify-center"
                  style={{ height: Math.round(scale * 375 * 932 / 750) }}
                >
                  {renderMachineInner()}
                  <SoundToggle className="absolute top-3 right-3 z-30" />
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
                      <Image src="/images/gcoin.webp" alt="G Coin" width={20} height={20} className="w-5 h-5 object-contain" />
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

      {/* mode5 的底部操作欄 —— 機台上不畫按鈕（老闆指定），三顆移到這裡。
          版型照盒玩立體機台 blindbox_mode5：左側單抽金額，右側三顆按鈕 */}
      {BUTTONLESS_THEMES.includes(machineTheme ?? '') && (
        <div data-testid="bottom-action-bar" className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-100 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-modal backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/90">
          <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4">
            <div className="flex h-full shrink-0 flex-col justify-center pl-1">
              <span className="mb-0.5 text-[13px] font-black uppercase tracking-widest leading-none text-neutral-400">
                單抽
              </span>
              <div className="flex items-center gap-1">
                <Image src="/images/gcoin.webp" alt="G" width={16} height={16}
                  className="inline-block shrink-0" style={{ width: 16, height: 16 }} unoptimized />
                <span className="font-amount text-xl font-black leading-none text-accent-red">
                  {(product.price ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex h-[44px] flex-1 items-center gap-2">
              <button
                onClick={handlePush}
                disabled={isSoldOut || machineDisabled}
                className="h-[44px] shrink-0 rounded-xl bg-neutral-200 px-3 text-sm font-black text-neutral-700 transition-colors hover:bg-neutral-300 disabled:opacity-50"
              >
                推一下
              </button>
              <button
                onClick={handlePurchaseClick}
                disabled={isSoldOut || machineDisabled}
                className="h-full flex-1 whitespace-nowrap rounded-xl bg-accent-red text-base font-black text-white shadow-lg shadow-accent-red/30 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                立即轉蛋
              </button>
              <button
                onClick={handleTrial}
                disabled={isSoldOut || machineDisabled}
                className="h-[44px] shrink-0 rounded-xl bg-purple-600 px-3 text-sm font-black text-white shadow-lg shadow-purple-600/30 transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                試試看
              </button>
            </div>
          </div>
        </div>
      )}

      <GachaResultModal isOpen={showResultModal} onClose={handleResultClose} results={wonPrizes} hideTicketNumber />
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
