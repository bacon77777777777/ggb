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
import { Loader2, ChevronLeft, BookOpen, Heart, Share2, Minus, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import PinchZoomImage from '@/components/ui/PinchZoomImage';
import { SoundToggle } from '@/components/ui/SoundToggle';
import { trackEvent } from '@/lib/trackEvent';
import { homeTabHref } from '@/lib/desktopShell';
import { hapticHeavy, hapticLight, hapticMedium, hapticNotify } from '@/lib/haptics';
import { asset } from '@/lib/asset';
import ViewerPill from '@/components/product/ViewerPill';
import { MachineLoadingOverlay } from '@/components/ui/MachineLoadingOverlay';
import { cn } from '@/lib/utils';
import { ProductStage, StageButton } from '@/components/shop/desktop/ProductStage';
import { resolveProductBackUrl } from '@/lib/productNav';
import { useProductFollow } from '@/hooks/useProductFollow';

interface GachaProductDetailProps {
  product: Database['public']['Tables']['products']['Row'];
  prizes: Database['public']['Tables']['product_prizes']['Row'][];
  machineTheme?: string;
  onMachineReady?: () => void;
  /** 機台圖還沒到：機台那塊蓋黑遮罩（老闆 2026-09-03，頁面其他部分照常先出來） */
  machineLoading?: boolean;
}

/** 右側面板的 48px 方鈕（規則／收藏／分享）—— cardx 的 secondaryButton 改亮色 */
const panelSquareBtn = 'flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800';

/** 機台本身不畫按鈕的主題 —— 推一下／立即轉蛋／試試看改走頁面底部操作欄 */
const BUTTONLESS_THEMES = ['gacha_mode2', 'gacha_mode5']

/**
 * 舞台標題上方的小標（packs 的「CARDS FROM」）：分類名。
 * 舞台底色不再依機台主題換：老闆 2026-09-04 看了 packs 之後要「介面一模一樣」，
 * 一律 packs 的紫色（`ProductStage` 的 `STAGE_BACKGROUND`）。
 */
const TYPE_LABEL: Record<string, string> = {
  gacha: '轉蛋', blindbox: '盒玩', ichiban: '一番賞', card: '抽卡', custom: '自製賞',
}

const MACHINE_COMPONENTS: Record<string, React.ComponentType<React.ComponentProps<typeof GachaMachineVisual>>> = {
  gacha_classic: GachaMachineVisual,
  gacha_modern: GachaMachineModern,
  gacha_retro: GachaMachineRetro,
  gacha_mode2: GachaMachineMode2,
  gacha_mode3: GachaMachineMode3,
  gacha_mode4: GachaMachineMode4,
  gacha_mode5: GachaMachineMode5,
}

export function GachaProductDetail({ product, prizes, machineTheme, onMachineReady, machineLoading = false }: GachaProductDetailProps) {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [supabase] = useState(() => createClient());

  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  /*
   * 電腦版（≥ 1024）與手機版是兩棵不同的樹，只掛其中一棵 —— 以前是兩棵都掛、用 CSS 藏一棵，
   * 機台（含物理模擬與圖片）等於載兩份。初值直接看視窗寬度：這個元件只在客戶端拿到商品資料後
   * 才掛上，沒有 SSR 對不上的問題。
   */
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  /**
   * 平板（768–1023，老闆 2026-09-04）：機台區改成滿版正方形舞台，底下照手機的單欄往下排，
   * 品項一排四個。768 以下一字不動。
   */
  /* 平板模式已停用（老闆 2026-09-05：768～1023 直接用手機版型），isTablet 永遠 false，留著是因為下面很多分支在讀 */
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const BASE = 375;
    const updateScale = () => {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth;
      const isMob = w <= 1023;
      const isDesk = w >= 1024;
      setIsMobile(isMob);
      setIsDesktop(isDesk);
      setIsTablet(!isMob && !isDesk);
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

  // ── 電腦版舞台（老闆 2026-09-04：照 packs.com，返回／規則／收藏／分享／數量都在框內）──
  const [desktopQty, setDesktopQty] = useState(1);
  const maxQty = Math.max(1, Math.min(20, typeof product.remaining === 'number' ? product.remaining : 20));
  useEffect(() => { setDesktopQty(q => Math.min(Math.max(1, q), maxQty)); }, [maxQty]);
  const { followed, toggle: toggleFollow } = useProductFollow(product.id, isDesktop);
  /* 右側面板的「廠商」：跟 GachaCollectionList 一樣照 supplier_id 查名字 */
  const [supplierName, setSupplierName] = useState<string | null>(null);
  useEffect(() => {
    const supplierId = (product as any).supplier_id;
    if (!supplierId || !isDesktop) return;
    let alive = true;
    supabase.from('suppliers').select('name').eq('id', supplierId).maybeSingle()
      .then(({ data }) => { if (alive && data?.name) setSupplierName(data.name as string); });
    return () => { alive = false; };
  }, [(product as any).supplier_id, supabase, isDesktop]);
  const handleDesktopShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('連結已複製', 'success');
    } catch {
      showToast('複製失敗，請手動複製網址', 'error');
    }
  };

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

  // 機台內容（手機/桌面共用 JSX 片段，由父層控制 scale 與容器）。
  // 電腦版舞台自己算 scale、原點改左上（容器就是縮放後的尺寸）、機台上的按鈕不畫
  const renderMachineInner = (opts: { scale?: number; origin?: 'top center' | 'top left'; hideButtons?: boolean } = {}) => (
    <div
      className="relative"
      style={{ width: 375, transform: `scale(${opts.scale ?? scale})`, transformOrigin: opts.origin ?? 'top center' }}
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
                hideButtons={opts.hideButtons}
              />
            );
          })()}
          <MachineLoadingOverlay show={machineLoading} />
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
                src={product.image_url || asset(`/images/item/${product.id.toString().padStart(5, '0')}.jpg`)}
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

  const stageDisabled = isSoldOut || machineDisabled;
  const gcoin = <Image src={asset('/images/gcoin.webp')} alt="G" width={16} height={16} className="h-4 w-4 shrink-0" unoptimized />;

  /*
   * 中獎彈窗與購買彈窗兩棵樹共用。電腦版要當 overlays 塞進舞台**裡面**：
   * 全螢幕只會畫 fullscreen 元素的子樹，掛在外面的 fixed 彈窗會整個看不到。
   */
  const modals = (
    <>
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
        initialQuantity={isDesktop ? desktopQty : undefined}
      />
    </>
  );

  /* ── 舞台（≥1024）：紫色正方形，只放「玩」的東西（老闆 2026-09-04：左格保留紫色舞台）——
     標題／價格／數量／立即轉蛋都在右側面板，這裡只剩推一下、試試看、音效 ── */
  const renderStage = () => (
      <ProductStage
        machineWidth={375}
        machineHeight={375 * 932 / 750}
        renderMachine={(s) => renderMachineInner({ scale: s, origin: 'top left', hideButtons: true })}
        bottomLeft={<SoundToggle variant="glass" />}
        controls={
          <div className="flex items-center gap-2.5">
            <StageButton variant="glass" onClick={handlePush} disabled={stageDisabled}>推一下</StageButton>
            <StageButton variant="glass" onClick={handleTrial} disabled={stageDisabled}>試試看</StageButton>
          </div>
        }
        overlays={modals}
      />
  );

  const typeLabel = TYPE_LABEL[product.type] ?? '轉蛋';
  const totalPrice = product.price * desktopQty;

  /* ── 右側面板（照 cardx `/packs/pack_001` 的 infoCol／priceCard，改亮色）：
     分類小標、商品名 32px、廠商；卡片裡 單抽價、剩餘、幾人在看、數量、規則／收藏／分享＋立即轉蛋 ── */
  const renderPanel = () => (
    <div className="flex flex-col gap-3 pt-1">
      <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-neutral-500">{typeLabel}</div>
      <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.015em] text-neutral-900 dark:text-white">{product.name}</h1>
      {supplierName && (
        <div className="flex items-center gap-2 text-[14px] text-neutral-500">
          <span>廠商</span>
          <span className="font-bold text-neutral-900 dark:text-white">{supplierName}</span>
        </div>
      )}
      <div className="mt-1 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="grid gap-0.5">
          <div className="text-[14px] text-neutral-500">單抽</div>
          <div className="flex items-end gap-1.5">
            <Image src={asset('/images/gcoin.webp')} alt="G" width={22} height={22} className="mb-1 h-[22px] w-[22px] shrink-0" unoptimized />
            <span className="font-amount text-[28px] font-black leading-none tracking-[-0.02em] text-amount">{product.price.toLocaleString()}</span>
            <span className="mb-0.5 text-[14px] text-neutral-400">/ 抽</span>
          </div>
        </div>
        {typeof product.remaining === 'number' && (
          <div className="flex items-center justify-between text-[14px]">
            <span className="text-neutral-500">剩餘</span>
            <span className="font-amount font-bold text-neutral-900 dark:text-white">
              {product.remaining.toLocaleString()}
              {typeof product.total_count === 'number' && product.total_count > 0 && (
                <span className="text-neutral-400"> / {product.total_count.toLocaleString()}</span>
              )}
            </span>
          </div>
        )}
        {(product as any).is_preorder && (
          <div className="flex items-center justify-between text-[14px]">
            <span className="text-neutral-500">預購</span>
            <span className="font-bold text-yellow-700">
              預計可配送 {(product as any).preorder_available_at
                ? new Date((product as any).preorder_available_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
                : '待公布'}
            </span>
          </div>
        )}
        <ViewerPill
          productId={product.id}
          inline
          render={(n) => (
            <div className="flex items-center gap-2 text-[14px] text-neutral-500">
              <span className="relative flex h-[7px] w-[7px] items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-75" />
                <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-accent-red" />
              </span>
              <span className="font-amount font-bold text-neutral-900 dark:text-white">{n}</span> 人正在看
            </div>
          )}
        />
        <div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-[14px] dark:border-neutral-800">
          <span className="text-neutral-500">數量</span>
          <div className="inline-flex h-10 items-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
            <button type="button" aria-label="減少數量" disabled={stageDisabled || desktopQty <= 1}
              onClick={() => setDesktopQty((q) => Math.max(1, q - 1))}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-700 transition-colors hover:bg-neutral-200 disabled:opacity-40 disabled:hover:bg-transparent dark:text-neutral-200">
              <Minus className="h-4 w-4 stroke-[2.5]" />
            </button>
            <div className="w-10 text-center font-amount text-[18px] font-black tabular-nums text-neutral-900 dark:text-white">{desktopQty}</div>
            <button type="button" aria-label="增加數量" disabled={stageDisabled || desktopQty >= maxQty}
              onClick={() => setDesktopQty((q) => Math.min(maxQty, q + 1))}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-700 transition-colors hover:bg-neutral-200 disabled:opacity-40 disabled:hover:bg-transparent dark:text-neutral-200">
              <Plus className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
        {/* 規則／收藏／分享三顆 48px 方鈕＋主鈕（cardx 的 actionGrid：48px 48px 1fr、間距 10） */}
        <div className="mt-1 grid grid-cols-[48px_48px_48px_1fr] gap-2.5">
          <Link href={`/${product.type}/rules`} aria-label="規則" title="規則" className={panelSquareBtn}>
            <BookOpen className="h-[22px] w-[22px] stroke-[2]" />
          </Link>
          <button type="button" aria-label={followed ? '取消收藏' : '收藏'} title={followed ? '取消收藏' : '收藏'} aria-pressed={followed}
            onClick={() => void toggleFollow()}
            className={cn(panelSquareBtn, followed && 'border-accent-red/50 bg-accent-red/10 text-accent-red hover:bg-accent-red/15')}>
            <Heart className={cn('h-[22px] w-[22px] stroke-[2]', followed && 'fill-current')} />
          </button>
          <button type="button" aria-label="分享" title="分享" onClick={handleDesktopShare} className={panelSquareBtn}>
            <Share2 className="h-[22px] w-[22px] stroke-[2]" />
          </button>
          {/* 主鈕：cardx 的 button-3d（漸層＋內側高光＋底下 3px 厚度），顏色換成品牌紅 */}
          <button
            type="button"
            onClick={handlePurchaseClick}
            disabled={stageDisabled}
            className="relative flex h-12 items-center justify-center gap-1.5 rounded-xl text-[15px] font-black text-white transition-transform hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            style={{
              background: 'linear-gradient(360deg, #c4003b 0.8%, #fb1949)',
              boxShadow: '0 3px 0 0 #61001d, 0 6px 16px rgba(255,35,65,0.35), inset 0 4px 3px rgba(255,255,255,0.3)',
            }}
          >
            {isSoldOut ? '已完抽' : (
              <>
                立即轉蛋
                {gcoin}
                <span className="font-amount text-[17px]">{totalPrice.toLocaleString()}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── 電腦版（≥1024）：照 cardx 的 /packs/pack_001（老闆 2026-09-04）——
     麵包屑 → 左欄：舞台 → 品項總覽／商品資訊／猜你喜歡；右欄：sticky 面板。
     兩欄各半、間距 16（cardx 在 1920 是 812／812）。頂部導覽列跟首頁同一條（Navbar 那邊處理） ── */
  const renderDesktop = () => (
    <div className="pb-16">
      {/* 不限最大寬（cardx 也沒限）：1920 時兩欄各 812，舞台才夠大 */}
      <div className="px-6 pt-5">
        {/* 麵包屑（老闆 2026-09-04 指定加）：‹ 首頁 / 轉蛋 / 商品名，照 cardx 的 breadcrumbs（13px、返回小方鈕 22px） */}
        <nav aria-label="breadcrumb" className="mb-[18px] flex min-w-0 items-center gap-2.5 text-[13px] text-neutral-500">
          <button
            type="button"
            aria-label="返回"
            onClick={() => router.push(resolveProductBackUrl())}
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[8px] border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <ChevronLeft className="h-4 w-4 stroke-[2]" />
          </button>
          <Link href="/" className="shrink-0 text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300">首頁</Link>
          <span className="text-neutral-300 dark:text-neutral-600">/</span>
          <Link href={homeTabHref(product.type)} className="shrink-0 text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300">{typeLabel}</Link>
          <span className="text-neutral-300 dark:text-neutral-600">/</span>
          <span className="truncate font-extrabold text-neutral-900 dark:text-white">{product.name}</span>
        </nav>

        {/* 不用 items-start：右格要跟左欄一樣高，裡面的 sticky 才有空間黏住 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            {renderStage()}
            <div className="mt-6">
              <GachaCollectionList variant="desktop" productId={product.id} product={product} prizes={prizes} refreshKey={collectionRefreshKey} />
            </div>
          </div>
          <div className="min-w-0">
            <div className="sticky top-[73px]">
              {renderPanel()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-0 bg-neutral-50 dark:bg-neutral-950">
      {isDesktop ? renderDesktop() : (
        <>
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
                <Image src={asset("/images/gcoin.webp")} alt="G" width={16} height={16}
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

      {/* 「N 人正在看」（老闆 2026-08-31：轉蛋與盒玩也要）。
          放在 BUTTONLESS_THEMES 的條件外面 —— 只有 mode5 有底部操作欄，
          其他主題的按鈕畫在機台上，那時膠囊會自己改貼畫面底 */}

          <ViewerPill productId={product.id} />
          {modals}
        </>
      )}
    </div>
  );
}
