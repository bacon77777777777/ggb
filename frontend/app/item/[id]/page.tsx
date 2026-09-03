'use client';

import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

/* 彈窗與演出元件一律動態載入。
   這頁把七支轉蛋機台、卡包 3D 檢視器、對戰特效全部靜態 import，
   但一個商品只用得到其中一條路徑 —— 沒下載的 JS 不用解析，
   慢手機省下的是解析時間，不只是流量。 */
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Share2, Heart, ShieldCheck, Info, Trophy, FileCheck, Loader2, Check, BookOpen, ChevronRight } from 'lucide-react';
import SoundToggle, { RAISED_STYLE, RAISED_STYLE_GOLD } from '@/components/ui/SoundToggle';
import { useSoundMuted } from '@/hooks/useSoundMuted';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';
import { machineAssets } from '@/lib/machineAssets';
import { useMachineAssets } from '@/lib/useMachineAssets';
import ProductCard from '@/components/ProductCard';
import { useState, useEffect, useMemo, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import CopyableTruncatedField from '@/components/ui/CopyableTruncatedField';
import ProductBadge from '@/components/ui/ProductBadge';
import Image from 'next/image';

import { PurchaseConfirmationModal } from '@/components/shop/PurchaseConfirmationModal';
import GachaMachine, { Prize } from '@/components/GachaMachine';
import { trackPageView, trackScrollDepth, trackEvent } from '@/lib/trackEvent';
import { GachaThemeRenderer, type MachineTheme } from '@/components/gacha-themes';
import { PrizeResultModal } from '@/components/shop/PrizeResultModal';
const FigmaTearScene = dynamic(
  () => import('@/components/shop/FigmaTearScene'),
  { ssr: false },
);
const TicketSelectionFlow = dynamic(
  () => import('@/components/shop/TicketSelectionFlow').then(m => m.TicketSelectionFlow),
  { ssr: false },
);
import type { CardItem as BattleCardItem } from '@/components/card/GachaBattleEffect';
const GachaBattleEffect = dynamic(
  () => import('@/components/card/GachaBattleEffect').then(m => m.GachaBattleEffect),
  { ssr: false },
);
const CardDrawAnimation = dynamic(() => import('@/components/card/CardDrawAnimation'), { ssr: false });
const GgbPackRip = dynamic(() => import('@/components/card/GgbPackRip'), { ssr: false });
const PackShowcase3D = dynamic(() => import('@/components/card/PackShowcase3D'), {
  ssr: false,
  // 佔位用同一個天空漸層，載入期間不會出現空白或別的顏色（ssr:false，所以讀得到時鐘）
  loading: () => (
    <div
      style={{
        width: '100%',
        height: Math.round(375 * 932 / 750),
        background: skyGradientCss(skyProgressNow()),
      }}
    />
  ),
});
const ProductPackViewer3D = dynamic(
  () => import('@/components/card/ProductPackViewer3D').then(m => m.ProductPackViewer3D),
  { ssr: false },
);
import { GachaProductDetail } from '@/components/shop/GachaProductDetail';
import { GachaResultModal } from '@/components/shop/GachaResultModal';
import { MissionService } from '@/services/mission';
import PrizeDetailSheet from '@/components/ui/PrizeDetailSheet';
import PinchZoomImage from '@/components/ui/PinchZoomImage';
import FairnessPanel from '@/components/product/FairnessPanel';
import ViewerPill from '@/components/product/ViewerPill';
import { fetchRecommendations } from '@/lib/recommendations';
import { PRODUCT_PUBLIC_COLUMNS, PRIZE_PUBLIC_COLUMNS } from '@/lib/productColumns'
import { useQueryClient } from '@tanstack/react-query';
import { swrLoad } from '@/lib/swr';
import { productKey, fetchProductDetail } from '@/lib/queries/product';
import { noteInteraction } from '@/lib/feed/session';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { isCategoryHidden, isCategoryUnderMaintenance, categoryFlagKey, CATEGORY_LABELS } from '@/lib/categoryFlags';
import { fetchProductPromotion, type ProductPromotion } from '@/lib/promotions';
import GradeBadge from '@/components/ui/GradeBadge';
import { asset } from '@/lib/asset';
import { isLastOneLevel } from '@/lib/grade';
import { skyGradientCss, skyProgressNow } from '@/lib/oceanSky';

/**
 * 走 commit-reveal 抽獎引擎的三種商品（migration 405 的 play_ichiban_auto）。
 * 這三種才有籤號、才有「種子事前封存、完抽後公開」可驗算。
 *
 * 底部操作欄上緣原本掛的是公平性警語列，老闆 2026-08-31 指定改成
 * 「N 人正在看」膠囊（ViewerPill）—— 公平性沒有拿掉，頁內的
 * 「公平性驗證」區塊（FairnessPanel）還在，這個常數兩者共用。
 */
const FAIR_ENGINE_TYPES = ['ichiban', 'card', 'custom'];

/**
 * 內建卡包外觀（卡包樣式選「預設」時的輪播用；選「自訂」吃商品自己的 pack_front/back_image_url）
 *
 * 素材在 `public/images/card/pack/`，每款兩張：`<款>01.webp` 正面、`<款>02.webp` 背面。
 * 老闆 2026-08-30 換了整組圖，從六款（01~06）變成五款（a~e）。
 *
 * **加新款只要把字母加進這個陣列**（圖檔叫 `f01.webp`／`f02.webp` 就加 'f'）。
 * 先前是「一個數字 + padStart」，數字寫死在 Math.random() 裡，加圖的人很容易漏改，
 * 新款躺在資料夾裡永遠抽不到；改成陣列之後漏加就是漏加，看得出來。
 *
 * 出圖規格見 `components/card/packSpec.ts`（62 : 116，建議 1240 × 2320）。
 * ⚠️ 圖一律轉 WebP 再放進來 —— 這組原檔是 PNG、十張 28.5MB，轉完 3.7MB。
 */
const PACK_STYLES = ['a', 'b', 'c', 'd', 'e'] as const;

function getRandomPackStyles(): string[] {
  return Array.from({ length: 9 }, () =>
    PACK_STYLES[Math.floor(Math.random() * PACK_STYLES.length)]
  );
}

type PackSelectionCarouselHandle = {
  goToNext: () => void;
  getActiveIndex: () => number;
};

type PackSelectionCarouselProps = {
  cardScale: number;
  packStyles: string[];
  onActiveStyleChange?: (styleId: string) => void;
};

const PackSelectionCarousel = forwardRef<PackSelectionCarouselHandle, PackSelectionCarouselProps>(
  ({ packStyles, onActiveStyleChange }, ref) => {
    const onActiveStyleChangeRef = useRef(onActiveStyleChange);
    useEffect(() => { onActiveStyleChangeRef.current = onActiveStyleChange; });
    const audioCtxRef = useRef<AudioContext | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const offsetRef = useRef(0);
    const [offset, setOffset] = useState(0);
    const rafIdRef = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const startXRef = useRef(0);
    const startOffsetRef = useRef(0);
    const lastOffsetRef = useRef(0);
    const lastTimeRef = useRef(0);
    const lastActiveIndexRef = useRef(0);
    const muteTickRef = useRef(false);

    const PACK_COUNT = 9;

    const normalizeOffset = (value: number) => {
      const modulo = PACK_COUNT;
      if (modulo <= 0) return 0;
      const mod = value % modulo;
      return mod < 0 ? mod + modulo : mod;
    };

    const ensureAudioContext = () => {
      if (typeof window === 'undefined') return null;
      let ctx = audioCtxRef.current;
      if (!ctx) {
        const AC = (window as typeof window & { webkitAudioContext?: typeof AudioContext }).AudioContext
          || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        audioCtxRef.current = ctx;
      }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
      return ctx || null;
    };

    const playTickSound = () => {
      if (muteTickRef.current) return;
      const ctx = ensureAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(720, now);

      gainNode.gain.setValueAtTime(0.18, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + 0.05);
    };

    const updateActiveIndexFromOffset = (value: number) => {
      const nearest = normalizeOffset(Math.round(value));
      if (nearest !== lastActiveIndexRef.current) {
        lastActiveIndexRef.current = nearest;
        setActiveIndex(nearest);
        onActiveStyleChangeRef.current?.(packStyles[nearest]);
        playTickSound();
      }
    };

    // Notify parent when packStyles reshuffled (換一批)
    useEffect(() => {
      onActiveStyleChangeRef.current?.(packStyles[activeIndex]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [packStyles]);

    const setOffsetBoth = (value: number) => {
      const normalized = normalizeOffset(value);
      offsetRef.current = normalized;
      setOffset(normalized);
      updateActiveIndexFromOffset(normalized);
    };

    const stopAnimation = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    const animateToOffset = (target: number) => {
      stopAnimation();
      const start = offsetRef.current;
      const delta = target - start;
      if (Math.abs(delta) < 0.001) {
        return;
      }
      const duration = 260;
      const startTime = performance.now();

      const step = (time: number) => {
        const t = Math.min(1, (time - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = start + delta * eased;
        setOffsetBoth(value);
        if (t < 1) {
          rafIdRef.current = requestAnimationFrame(step);
        } else {
          rafIdRef.current = null;
        }
      };

      rafIdRef.current = requestAnimationFrame(step);
    };

    const beginDrag = (clientX: number) => {
      if (typeof window !== 'undefined') {
        const edgeThreshold = 32;
        muteTickRef.current = clientX <= edgeThreshold;
      } else {
        muteTickRef.current = false;
      }
      if (!muteTickRef.current) {
        ensureAudioContext();
      }
      stopAnimation();
      isDraggingRef.current = true;
      startXRef.current = clientX;
      startOffsetRef.current = offsetRef.current;
      lastOffsetRef.current = offsetRef.current;
      lastTimeRef.current = performance.now();
    };

    const moveDrag = (clientX: number) => {
      if (!isDraggingRef.current) return;
      const dx = clientX - startXRef.current;
      const sensitivity = 140;
      const nextOffset = startOffsetRef.current - dx / sensitivity;
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      if (dt > 0) {
        lastTimeRef.current = now;
        lastOffsetRef.current = nextOffset;
      }
      setOffsetBoth(nextOffset);
    };

    const endDrag = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const current = offsetRef.current;
      const target = Math.round(current);
      animateToOffset(target);
    };

    useImperativeHandle(ref, () => ({
      goToNext: () => {
        muteTickRef.current = false;
        const target = offsetRef.current + 1;
        animateToOffset(target);
      },
      getActiveIndex: () => lastActiveIndexRef.current,
    }));

    useEffect(() => {
      return () => {
        stopAnimation();
      };
    }, []);

    return (
      <div
        className="relative w-full"
        style={{
          height: 463,
          maxWidth: 420,
          perspective: 1200,
        }}
      >
        <div
          className="relative w-full h-full"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            event.preventDefault();
            beginDrag(event.clientX);
          }}
          onPointerMove={(event) => {
            if (!isDraggingRef.current) return;
            event.preventDefault();
            moveDrag(event.clientX);
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            endDrag();
          }}
          onPointerLeave={() => {
            endDrag();
          }}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (!touch) return;
            event.preventDefault();
            beginDrag(touch.clientX);
          }}
          onTouchMove={(event) => {
            if (!isDraggingRef.current) return;
            const touch = event.touches[0];
            if (!touch) return;
            event.preventDefault();
            moveDrag(touch.clientX);
          }}
          onTouchEnd={(event) => {
            event.preventDefault();
            endDrag();
          }}
        >
          {Array.from({ length: PACK_COUNT }).map((_, index) => {
            const total = PACK_COUNT;
            let rawOffset = index - offset;
            if (rawOffset > total / 2) {
              rawOffset -= total;
            } else if (rawOffset < -total / 2) {
              rawOffset += total;
            }
            const roundedOffset = Math.round(rawOffset);
            const isCenter = roundedOffset === 0;
            const isNear = Math.abs(roundedOffset) === 1;
            const radius = 306 * 1.14;
            const stepAngle = 360 / total;
            const angle = rawOffset * stepAngle;
            const angleRad = (angle * Math.PI) / 180;
            const isBehind = Math.cos(angleRad) < 0;
            const translateZ = isCenter ? radius * 1.05 : radius * 0.9;

            const centerScale = 1.35;
            const sideScale = 0.8;
            const distance = Math.min(Math.abs(rawOffset), 2);
            const t = 1 - distance / 2;
            const scale = sideScale + (centerScale - sideScale) * t;
            const opacity = 1;
            const zIndex = isCenter ? 4 : isNear ? 3 : 1;
            const isActive = index === activeIndex;

            return (
              <div
                key={index}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `rotateY(${angle}deg) translateZ(${translateZ}px) scale(${scale})`,
                  transformStyle: 'preserve-3d',
                  transition: isDraggingRef.current ? 'none' : 'transform 260ms ease-out',
                  pointerEvents: isActive ? 'auto' : 'none',
                  opacity,
                  zIndex,
                }}
              >
                {/* preserve-3d 不能拿掉：少了它這層會把卡包壓平，
                    輪播轉到後面時看到的會是鏡像的正面而不是卡背 */}
                <div className="relative" style={{ transformStyle: 'preserve-3d' }}>
                  <ProductPackViewer3D
                    packImage={asset(`/images/card/pack/${packStyles[index] ?? PACK_STYLES[0]}01.webp`)}
                    backImage={asset(`/images/card/pack/${packStyles[index] ?? PACK_STYLES[0]}02.webp`)}
                    interactive={isActive}
                    showSSRGlare={false}
                  />
                  {!isCenter && (
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        WebkitMaskImage: `url(${asset('/images/card/mask.svg')})`,
                        maskImage: `url(${asset('/images/card/mask.svg')})`,
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                      }}
                    >
                      <div className="w-full h-full bg-black/40" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

PackSelectionCarousel.displayName = 'PackSelectionCarousel';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, refreshProfile } = useAuth();
  const requireLogin = useRequireLogin();
  const { showToast } = useToast();
  const { states: flagStates, isLoading: isFlagsLoading } = useFeatureFlags();
  const [supabase] = useState(() => createClient());
  const queryClient = useQueryClient();

  const [product, setProduct] = useState<Database['public']['Tables']['products']['Row'] | null>(null);
  /*
   * 維護中與關閉都不讓人進商品頁，而且講同一句話。
   *
   * 兩者的差別在「類別還在不在」，那是首頁那一層的事：
   * 維護中頁籤留著並說明暫時維護，關閉整個頁籤消失。
   * 走到商品頁這一層，玩家要知道的只有「現在買不到」—— 再細分成
   * 兩種說法只是多一種要理解的狀態。
   */
  const isCategoryClosedForPlay =
    isCategoryHidden(product?.type, flagStates, isFlagsLoading) ||
    isCategoryUnderMaintenance(product?.type, flagStates, isFlagsLoading);
  const [prizes, setPrizes] = useState<Database['public']['Tables']['product_prizes']['Row'][]>([]);
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [productCategories, setProductCategories] = useState<Array<{ id: string; name: string }>>([]);
  // 進行中的促銷：商品資訊第一列（紅色膠囊），全類別跟轉蛋頁同一套樣式
  const [promo, setPromo] = useState<ProductPromotion | null>(null);
  useEffect(() => {
    if (!product?.id) return;
    let alive = true;
    void fetchProductPromotion(createClient(), product.id).then(p => { if (alive) setPromo(p); });
    return () => { alive = false; };
  }, [product?.id]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMachineReady, setIsMachineReady] = useState(false);

  const [moduleSettings, setModuleSettings] = useState<Record<string, MachineTheme>>({});
  /**
   * 全站模組設定「查回來了沒」—— 成功或失敗都算查完。
   *
   * 商品沒有自訂主題時，主題要等這一包才知道。在它到之前就先渲染機台的話，
   * 渲染出來的是 fallback（`gacha_classic`）的機台圖，等設定到了再整個換掉
   * —— 老闆 2026-09-01 回報「剛進轉蛋商品頁會先看到 gacha/main.webp，
   * 然後才馬上變成預設圖」，就是這個。
   */
  const [moduleSettingsLoaded, setModuleSettingsLoaded] = useState(false);

  /*
   * 抽卡的首屏素材預載（老闆回報：進去先看到一張全白卡包）。
   *
   * 轉蛋靠機台主圖的 onLoadingComplete 回報、盒玩有自己的 onLoaded，
   * 只有抽卡完全沒有把關 —— 卡包的棚景底圖與卡背還沒到，畫面就先渲染出去了。
   *
   * ⚠️ 位置有講究：hook 不能寫在 `if (product.type === 'card')` 裡（條件呼叫），
   * 也不能放在第一個條件式 return 之後。這裡剛好在 moduleSettings 宣告之後、
   * 所有 return 之前。
   */
  const cardAssetUrls = useMemo(() => {
    if (!product || product.type !== 'card') return [];
    const theme = (product as any).machine_theme || moduleSettings['card'];
    // 商品自己的卡包正面／卡背也要等 —— 那才是玩家第一眼看到的東西
    return machineAssets(theme, [
      (product as any).pack_front_image_url,
      (product as any).card_back_image_url,
      product.image_url,
    ]);
  }, [product, moduleSettings]);
  const cardAssetsReady = useMachineAssets(cardAssetUrls);

  const [isFollowed, setIsFollowed] = useState(false);
  const [isGachaLoading, setIsGachaLoading] = useState(false);
  /**
   * 看大圖時記的是「prizes 裡的第幾項」而不是那一項本身 ——
   * 這樣品項詳情彈窗才有辦法左右滑切換上一項／下一項
   */
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const viewingPrize = viewingIndex !== null && prizes[viewingIndex]
    ? {
        name: prizes[viewingIndex].name,
        image_url: prizes[viewingIndex].image_url || undefined,
        level: prizes[viewingIndex].level,
        total: prizes[viewingIndex].total,
        remaining: prizes[viewingIndex].remaining,
        probability: (prizes[viewingIndex] as { probability?: number | null }).probability ?? null,
        recycle_value: (prizes[viewingIndex] as { recycle_value?: number | null }).recycle_value ?? null,
        /*
         * ⚠️ 這是**逐欄抄過去**的物件，不是把整筆 row 傳下去。
         * 品項多一個欄位就要在這裡補一次，漏了不會報錯、只會靜靜失效 ——
         * display_mode 就是這樣：後台設了 360 展示、DB 也存對了，
         * 前台永遠拿到 undefined 所以一直是靜態圖（老闆 2026-08-19 回報）。
         */
        display_mode: (prizes[viewingIndex] as { display_mode?: string | null }).display_mode ?? null,
      }
    : null;
  const stepPrize = (d: 1 | -1) =>
    setViewingIndex(i => (i === null ? null : (i + d + prizes.length) % prizes.length));
  const [recommendations, setRecommendations] = useState<Database['public']['Tables']['products']['Row'][]>([]);
  
  // Purchase Flow State
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  // 抽籤販售：0 元抽，走自己的彈窗（PurchaseConfirmationModal 整支是繞著付款在轉）
  const [isGachaOpen, setIsGachaOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wonPrizes, setWonPrizes] = useState<Prize[]>([]);
  /* 自製賞的沉浸撕紙：現在撕到第幾張，以及重新掛載用的 session
     （同一張撕完再抽一次，key 不變的話 FigmaTearScene 會停在撕開的狀態） */
  const [customTearIndex, setCustomTearIndex] = useState(0);
  const [customTearSession, setCustomTearSession] = useState(0);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  /** 選籤彈窗是否為試玩（試試看）：試玩不扣款、直接進撕紙 */
  const [isTicketTrial, setIsTicketTrial] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Result Modal State
  const [showResultModal, setShowResultModal] = useState(false);
  const [drawResults, setDrawResults] = useState<{
    ticket_number: number;
    prize_level: string;
    prize_name: string;
    prize_image_url?: string;
    is_last_one?: boolean;
  }[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [cardScale, setCardScale] = useState(1);
  const [isCardImageMode, setIsCardImageMode] = useState(false);
  /* 閃電：略過撕卡包，直接看第一張。記在 localStorage —— 會用這個的人每次都想用 */
  const [skipPackIntro, setSkipPackIntro] = useState(false);
  useEffect(() => {
    try { setSkipPackIntro(localStorage.getItem('ggb_skip_pack_intro') === '1'); } catch { /* 無痕模式 */ }
  }, []);
  /* localStorage key 沿用舊的 `ggb_skip_pack_intro`：語意雖然從「略過撕包」擴充成
     「快速模式」，但換 key 會讓已經開過這顆的老玩家設定被重置。 */
  const setSkipPackIntroPref = useCallback((next: boolean) => {
    setSkipPackIntro(next);
    try { localStorage.setItem('ggb_skip_pack_intro', next ? '1' : '0'); } catch { /* 忽略 */ }
  }, []);
  /* 副作用不寫在 updater 裡：那是純函式，嚴格模式會呼叫兩次（localStorage 寫兩遍）。
     直接複用 setSkipPackIntroPref，寫入邏輯也只留一份。 */
  const toggleSkipPackIntro = useCallback(() => {
    setSkipPackIntroPref(!skipPackIntro);
  }, [skipPackIntro, setSkipPackIntroPref]);
  const packCarouselRef = useRef<PackSelectionCarouselHandle | null>(null);
  const firstPackStyles = useRef<string[]>(getRandomPackStyles());
  const [packStyles, setPackStyles] = useState<string[]>(firstPackStyles.current);
  const [activePackStyle, setActivePackStyle] = useState<string>(firstPackStyles.current[0]);
  const handleActiveStyleChange = useCallback((styleId: string) => {
    setActivePackStyle(styleId);
  }, []);
  const openingVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  /*
   * 過場影片的靜音跟著全站偏好走（`lib/soundPrefs`），不再自己 useState。
   * 以前每次開影片都 setIsVideoMuted(false) 強制開聲 —— 玩家在商品頁把聲音
   * 關掉，一抽下去影片照樣有聲音，等於那顆開關管不到這裡。
   */
  const isVideoMuted = useSoundMuted();

  const [isPrizeModalOpen, setIsPrizeModalOpen] = useState(false);
  const [tearGachaResults, setTearGachaResults] = useState<Prize[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const openingVideoSrc = product?.type === 'card' ? asset('/videos/card.mp4') : asset('/videos/blindbox_op.mp4');

  // 每個商品只計一次分享任務，以 localStorage 去重
  const trackShareOnce = () => {
    if (!user || !params.id) return;
    const key = 'ggb_shared_products';
    try {
      const shared: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      const pid = String(params.id);
      if (!shared.includes(pid)) {
        MissionService.trackEvent('share_app', {}).catch(() => {});
        localStorage.setItem(key, JSON.stringify([...shared, pid]));
      }
    } catch {
      MissionService.trackEvent('share_app', {}).catch(() => {});
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const name = product?.name || 'GGB';
    const isMobileUA = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(navigator.userAgent);
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches && isMobileUA;
    if (navigator.share && isTouchDevice) {
      try {
        await navigator.share({ title: `【吉吉比線上轉蛋】${name}`, url });
        trackShareOnce();
      } catch {
        // 使用者取消或不支援，不計次數
      }
    } else {
      // 桌面/Mac：複製商品連結
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const el = document.createElement('textarea');
        el.value = url;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      trackShareOnce();
      showToast('商品連結已複製', 'success');
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    trackShareOnce();
    showToast('商品連結已複製', 'success');
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  // Page view + scroll depth tracking
  useEffect(() => {
    const cleanupPage = trackPageView();
    const cleanupScroll = trackScrollDepth();
    return () => { cleanupPage(); cleanupScroll(); };
  }, []);

  useEffect(() => {
    if (params.id) {
      // Use a timeout to avoid blocking or tracking accidental clicks
      const timer = setTimeout(() => {
        MissionService.trackEvent('view_product', { product_id: params.id })
          .catch(err => console.error('Mission track error:', err));
        const productId = Number(params.id)
        if (Number.isFinite(productId)) {
          /*
           * 這裡原本還會呼叫 RPC track_hot_tags_product_view。
           * 那支函式定義在 migration 157，但 STG／PROD 都查不到（後來被拿掉、
           * migration 沒跟上），所以每次開商品頁都白吃一個 404 ——
           * 錯誤被 .then 的兩個 undefined 吞掉，畫面沒事所以一直沒人發現。
           * 熱門標籤功能已經不在了，直接移除呼叫（2026-08-19）。
           * product_view_events 表還留著，沒有人讀，要清另外處理。
           */
          // Behavioral event tracking for personalization
          import('@/lib/trackEvent').then(({ trackEvent }) => {
            trackEvent('product_view', {
              productId,
              series: (product as any)?.series ?? undefined,
            });
          });
          // 這一趟看過的：回首頁下一刷馬上偏向同系列／同類型（lib/feed/session.ts）
          noteInteraction({ id: productId, series: (product as any)?.series ?? null, type: (product as any)?.type ?? null, price: (product as any)?.price ?? null }, 'view');
        }
      }, 2000); // 2 seconds delay to count as a "view"
      return () => clearTimeout(timer);
    }
  }, [params.id]);

  useEffect(() => {
    const updateIsMobile = () => {
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth < 768);
    };
    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    return () => {
      window.removeEventListener('resize', updateIsMobile);
    };
  }, []);

  // 手機撕紙回導後，從 sessionStorage 讀取結果並顯示恭喜彈窗
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ggb_tear_results');
      if (raw) {
        sessionStorage.removeItem('ggb_tear_results');
        const results = JSON.parse(raw) as Prize[];
        if (results.length > 0) setTearGachaResults(results);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const baseWidth = 375;

    const updateScale = () => {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth;
      if (w >= 1024) {
        const colW = Math.floor((Math.min(w, 1280) - 40) * 4 / 12);
        setCardScale(colW / baseWidth);
      } else {
        setCardScale(Math.min(w, 560) / baseWidth);
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  // Fire product_view once when product data loads
  useEffect(() => {
    if (!product) return;
    trackEvent('product_view', {
      productId: product.id,
      series: (product as any)?.series ?? undefined,
      meta: {
        product_type: product.type,
        product_name: product.name,
      },
    });
  }, [product?.id]);

  useEffect(() => {
    if (!user || !product) return;

    const checkFollowStatus = async () => {
      const { count } = await supabase
        .from('product_follows')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('product_id', product.id);
      
      setIsFollowed(!!count);
    };

    checkFollowStatus();
  }, [user, product, supabase]);

  const handleFollowToggle = async () => {
    // 原本是直接 router.push('/login')：沒說為什麼被丟走，登入完也回不到這個商品
    if (!requireLogin('登入後就可以收藏這個商品，開賣時會通知你')) return;
    // requireLogin 回 true 就代表有登入，但 TypeScript 推不出來，補一次縮小型別
    if (!user || !product) return;

    const newStatus = !isFollowed;
    setIsFollowed(newStatus);

    try {
      if (newStatus) {
        const { error } = await supabase
          .from('product_follows')
          .insert({ user_id: user.id, product_id: product.id });
        if (error) throw error;
        showToast('已加入關注清單', 'success');
      } else {
        const { error } = await supabase
          .from('product_follows')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', product.id);
        if (error) throw error;
        showToast('已取消關注', 'success');
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      setIsFollowed(!newStatus);
      showToast('操作失敗，請稍後再試', 'error');
    }
  };

  const handleShowResults = async () => {
    setShowResultModal(true);
    if (product) {
      trackEvent('winning_records_view', { productId: product.id });
    }
    if (drawResults.length > 0 || !product) return;

    setIsLoadingResults(true);
    try {
      /*
       * 整檔的開獎結果要走 `get_ticket_seal`，不能直接查 `draw_records`。
       *
       * `draw_records` 的 RLS 是「只看得到自己的」（`auth.uid() = user_id`），
       * 而且**濾掉的部分不會報錯**，所以直接查會安安靜靜只回自己抽過的那幾支 ——
       * 皮克敏那一檔（298 籤）實測只顯示 30+1 張，玩家會以為整檔只賣了 30 支。
       *
       * `get_ticket_seal` 是 SECURITY DEFINER，而且本來就管好了公平性：
       * 還在賣的時候只給承諾值（整張表這時給出去等於公開答案），
       * 賣完或封檔才回完整的籤號→賞等對照。跟 /fairness/[id] 同一個資料源，
       * 兩頁不會各說各話。
       */
      const { data: seal } = await supabase.rpc('get_ticket_seal', { p_product_id: product.id });

      let rows: {
        ticket_number: number; prize_level: string; prize_name: string;
        prize_image_url: string; is_last_one: boolean;
      }[] = [];

      const sealText: string | undefined = seal?.revealed ? seal?.seal_text : undefined;
      if (sealText) {
        // seal_text 是「籤號:賞等」逐行，前面幾行是 header（product/tickets/salt）
        rows = sealText
          .split('\n')
          .map((line: string) => line.match(/^(\d+):(.+)$/))
          .filter((m: RegExpMatchArray | null): m is RegExpMatchArray => m !== null)
          .map((m: RegExpMatchArray) => ({
            ticket_number: Number(m[1]),
            prize_level: m[2].trim(),
            prize_name: m[2].trim(),   // 這張表只有賞等，格子上也只顯示賞等
            prize_image_url: '',
            is_last_one: false,
          }));
      }

      // 沒有封存表的舊商品（migration 之前上架的）退回原本的作法，
      // 至少還看得到自己抽過的部分，不要整張空白
      if (rows.length === 0) {
        const { data, error } = await supabase
          .from('draw_records')
          .select('ticket_number, prize_level, prize_name, prize_image_url, is_last_one')
          .eq('product_id', product.id)
          .order('ticket_number', { ascending: true });
        if (error) throw error;
        rows = (data || []) as typeof rows;
      }
      const hasLastOneRow = rows.some(
        r => r.is_last_one || r.prize_level.includes('Last One') || r.prize_level.includes('LAST ONE') || r.prize_level.includes('最後賞') || r.ticket_number === 0
      );
      if (!hasLastOneRow) {
        const { data: prizeRows } = await supabase
          .from('product_prizes')
          .select('level, name, image_url, remaining')
          .eq('product_id', product.id);
        const normalRemaining = (prizeRows || [])
          .filter(p => !(p.level?.toLowerCase?.().includes('last one') || p.level?.includes?.('最後賞')))
          .reduce((sum, p) => sum + (p.remaining || 0), 0);
        if (normalRemaining === 0) {
          const loPrize = (prizeRows || []).find(p => p.level?.toLowerCase?.().includes('last one') || p.level?.includes?.('最後賞'));
          if (loPrize) {
            rows = [
              ...rows, 
              {
                ticket_number: 0,
                prize_level: loPrize.level || 'Last One',
                prize_name: loPrize.name || '最後賞',
                prize_image_url: loPrize.image_url || '',
                is_last_one: true
              }
            ];
          }
        }
      }

      const sortedData = (rows || []).sort((a, b) => {
        const isALastOne = a.is_last_one || a.prize_level.includes('Last One') || a.prize_level.includes('LAST ONE') || a.prize_level.includes('最後賞') || a.ticket_number === 0;
        const isBLastOne = b.is_last_one || b.prize_level.includes('Last One') || b.prize_level.includes('LAST ONE') || b.prize_level.includes('最後賞') || b.ticket_number === 0;
        
        if (isALastOne && !isBLastOne) return 1;
        if (!isALastOne && isBLastOne) return -1;
        return (a.ticket_number || 0) - (b.ticket_number || 0);
      });

      setDrawResults(sortedData);
    } catch (error) {
      console.error('Error fetching results:', error);
      showToast('無法載入抽獎結果', 'error');
    } finally {
      setIsLoadingResults(false);
    }
  };

  /*
   * 舊的「抽籤販售」販售模式（sale_mode='lottery'）已移除（老闆 2026-08-31）。
   * 那是掛在一番賞／抽卡／自製賞底下的 0 元抽、中籤才付款，已由獨立的登記制
   * 「抽籤販售」取代（lottery_events / lottery_entries，走 /lottery 自己的頁）。
   * 這頁不再有免費抽籤的分支。
   */
  const handleDrawClick = () => {
    if (product?.type === 'ichiban') {
      if (!user) {
        router.push('/login');
        return;
      }
      if (isMobile) {
        router.push(`/item/${params.id}/select`);
      } else {
        setIsTicketTrial(false);
        setIsTicketModalOpen(true);
      }
      return;
    }

    setIsPurchaseModalOpen(true);
  };

  const handleChangePack = () => {
    const newStyles = getRandomPackStyles();
    const currentIdx = packCarouselRef.current?.getActiveIndex() ?? 0;
    setPackStyles(newStyles);
    setActivePackStyle(newStyles[currentIdx]);
  };

  /** 試玩用的假中獎：挑全商品最高賞當誘餌（不扣款、不寫 DB） */
  const makeTrialPrize = (): Prize | null => {
    if (!product) return null;

    const scoreLevel = (levelRaw: string) => {
      const level = String(levelRaw || '').trim()
      if (level.includes('A賞') || level === 'A') return 1000
      if (level.includes('SSR')) return 1000
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

    /*
     * 最後賞不列入試玩結果（老闆指定）。它在真抽裡是「抽完最後一張才觸發」的獎，
     * 試試看就跳出最後賞很怪 —— 玩家會以為隨便抽就有。挑大賞（A賞）就好。
     */
    const pool = prizes.filter(
      p => !(p as { is_last_one?: boolean }).is_last_one
        && !/最後賞|last\s*one/i.test(String(p.level || '')),
    )
    const best = pool.length > 0
      ? pool.reduce((acc, cur) => {
          const accScore = scoreLevel(acc.level || '')
          const curScore = scoreLevel(cur.level || '')
          if (curScore !== accScore) return curScore > accScore ? cur : acc
          if (cur.image_url && !acc.image_url) return cur
          return acc
        }, pool[0])
      : null

    const rarity: Prize['rarity'] = String(best?.level || 'SSR')
    return {
      id: `trial-${best?.id ?? rarity}`,
      name: String(best?.name || rarity),
      rarity,
      image_url: best?.image_url || asset('/images/card/00001.webp'),
      grade: rarity,
      is_last_one: false,
    }
  };

  /** 抽卡的試試看：開卡包影片 */
  const handleTrialCard = () => {
    const trialPrize = makeTrialPrize();
    if (!product || !trialPrize) return;
    trackEvent('draw_trial', { productId: product.id });

    /*
     * 試玩要開「一整包」，不是一張（老闆回報：試試看只跑出 1/1）。
     * 組法：前面填一般卡、最後一張放 makeTrialPrize 挑出的大賞 ——
     * 演出的收尾光環吃的是最後一張，壓軸擺前面就白做了。
     */
    const perPack = Math.max(1, Number((product as any).cards_per_pack) || 1);
    if (perPack >= 2) {
      /*
       * 一包最多只有一張大賞（老闆 2026-08-19）。
       * 墊檔的那幾張要把大賞等級排除，否則會像先前那樣一包跑出五張 A賞 ——
       * 真實卡包不會這樣，而且演出的紫色閃電是給「唯一那張」用的。
       */
      const isBigLevel = (lv: unknown) =>
        /A賞|SSR|超稀有/i.test(String(lv ?? ''));
      const pool = prizes.filter(
        p => !(p as { is_last_one?: boolean }).is_last_one
          && !/最後賞|last\s*one/i.test(String(p.level || ''))
          && !isBigLevel(p.level),
      );
      const filler = Array.from({ length: perPack - 1 }, (_, i) => {
        const pick = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
        return {
          id: `trial-${i}`,
          name: pick?.name ?? '卡片',
          rarity: String(pick?.level ?? ''),
          grade: String(pick?.level ?? ''),
          image_url: pick?.image_url ?? undefined,
        } as Prize;
      });
      setWonPrizes([...filler, trialPrize]);
    } else {
      setWonPrizes([trialPrize]);
    }
    setIsVideoOpen(true);
  };

  /**
   * 一番賞／自製賞的試試看：直接進該模組自己的演出，一律單抽。
   *
   * 一番賞 → 跳過選籤，直接進撕紙（沉浸式主題就是沉浸式撕紙畫面）；
   * 自製賞 → 直接播開獎演出。兩者都不扣代幣、不寫紀錄。
   */
  const handleTrialPlay = () => {
    if (!product) return;
    trackEvent('draw_trial', { productId: product.id });

    if (product.type === 'ichiban') {
      if (isMobile) {
        router.push(`/item/${params.id}/select?trial=1`);
      } else {
        setIsTicketTrial(true);
        setIsTicketModalOpen(true);
      }
      return;
    }

    const trialPrize = makeTrialPrize();
    if (!trialPrize) return;
    setWonPrizes([trialPrize]);
    setIsGachaOpen(true);
  };

  const handlePurchaseConfirm = async (quantity: number, options?: { usePoints: boolean, couponId?: string }) => {
    if (!product || !user) return;

    if (product.status === 'ended' || product.remaining === 0) {
      setIsPurchaseModalOpen(false);
      showToast('商品已完抽', 'info');
      return;
    }

    setIsProcessing(true);

    // For non-card types, open GachaMachine immediately so user sees animation right away
    const isCardType = product.type === 'card';
    if (!isCardType) {
      setIsPurchaseModalOpen(false);
      setWonPrizes([]);
      setIsGachaLoading(true);
      setCustomTearIndex(0);
      setCustomTearSession(n => n + 1);
      setIsGachaOpen(true);
    }

    try {

      const drawRes = await fetch('/api/gacha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          count: quantity,
          usePoints: options?.usePoints || false,
          couponId: options?.couponId || null,
        }),
      });
      if (!drawRes.ok) {
        const err = await drawRes.json().catch(() => ({}));
        throw new Error(err.error || '購買失敗，請稍後再試');
      }
      const drawJson = await drawRes.json();
      const data = drawJson.prizes;

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('購買失敗，商品可能已售完或剩餘數量不足');
      }

      interface PlayGachaResult {
        name: string;
        grade: string;
        image_url: string;
        ticket_number?: number;
        is_last_one?: boolean;
      }

      const rawResults = data as unknown as PlayGachaResult[];
      const results = rawResults.map((item, index) => ({
        id: item.ticket_number !== undefined ? String(item.ticket_number) : `${product.id}-${index}`,
        name: item.name,
        rarity: item.grade,
        image_url: item.image_url,
        grade: item.grade,
        is_last_one: item.is_last_one,
        ticket_number: item.ticket_number
      }));

      console.log('[GA] event: purchase', { 
        transaction_id: rawResults[0]?.ticket_number,
        value: product.price * quantity,
        currency: 'G',
        items: results.map(r => ({ item_id: r.id, item_name: r.name, item_category: r.grade }))
      });

      setWonPrizes(results);
      if (isCardType) {
        setIsPurchaseModalOpen(false);
      }
      setIsGachaLoading(false);
      if (refreshProfile) {
        refreshProfile();
      }

      // Track draw_single / draw_multi
      if (quantity === 1) {
        trackEvent('draw_single', {
          productId: product.id,
          series: (product as any)?.series ?? undefined,
          meta: {
            cost_tokens: product.price,
            cost_type: options?.usePoints ? 'points' : 'tokens',
          },
        });
      } else {
        trackEvent('draw_multi', {
          productId: product.id,
          series: (product as any)?.series ?? undefined,
          meta: {
            count: quantity,
            cost_tokens: product.price * quantity,
            cost_type: options?.usePoints ? 'points' : 'tokens',
          },
        });
      }
      trackEvent('draw', {
        productId: product.id,
        series: (product as any)?.series ?? undefined,
        meta: { count: quantity },
      });

      // 任務追蹤由 /api/gacha route 統一處理（避免重複計算）

      if (isCardType) {
        setIsVideoOpen(true);
      }
      // For non-card: GachaMachine already opened above; auto-spin fires via useEffect in GachaMachine
      
    } catch (error: unknown) {
      console.error('Purchase error:', error);
      let errorMessage = '購買失敗';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Try to extract message from common error objects
        const errObj = error as { message?: string; error_description?: string; details?: string };
        errorMessage = errObj.message || errObj.error_description || errObj.details || JSON.stringify(error);
      }
      
      if (errorMessage && /insufficient.*balance/i.test(errorMessage)) {
        trackEvent('insufficient_balance', {
          productId: product.id,
          meta: {
            required: product.price * quantity,
            available: options?.usePoints ? (user?.points ?? 0) : (user?.tokens ?? 0),
          },
        });
      }
      // If machine was opened in advance, close it on error
      if (!isCardType) {
        setIsGachaOpen(false);
        setIsGachaLoading(false);
      }
      showToast(errorMessage || '購買失敗，請稍後再試', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGachaComplete = () => {
    router.push(`/profile?tab=warehouse&product_id=${params.id}`);
  };

  const handleBattleEffectComplete = () => {
    setIsGachaOpen(false);
    setIsPrizeModalOpen(true);
    if (product && wonPrizes.length > 0) {
      wonPrizes.forEach(prize => {
        trackEvent('prize_reveal', {
          productId: product.id,
          meta: { prize_level: prize.grade || prize.rarity, prize_name: prize.name },
        });
      });
    }
  };

  const handleGachaContinue = () => {
    setIsGachaOpen(false);
    setWonPrizes([]);
    fetchData();
  };

  const handleCardContinue = () => {
    setIsVideoOpen(false);
    setWonPrizes([]);
    fetchData();
  };


  const handleVideoEnd = () => {
    setIsVideoOpen(false);
    if (wonPrizes.length > 0) {
      setIsPrizeModalOpen(true);
      if (product) {
        wonPrizes.forEach(prize => {
          trackEvent('prize_reveal', {
            productId: product.id,
            meta: { prize_level: prize.grade || prize.rarity, prize_name: prize.name },
          });
        });
      }
    }
  };

  const handleVideoError = () => {
    setIsVideoOpen(false);
    if (wonPrizes.length > 0) {
      setIsPrizeModalOpen(true);
      if (product) {
        wonPrizes.forEach(prize => {
          trackEvent('prize_reveal', {
            productId: product.id,
            meta: { prize_level: prize.grade || prize.rarity, prize_name: prize.name },
          });
        });
      }
    }
  };

  const battleResults: BattleCardItem[] = useMemo(
    () =>
      wonPrizes.map(prize => {
        const raw = (prize.grade || prize.rarity || '').toUpperCase();
        const rarity: BattleCardItem['rarity'] =
          raw === 'SSR' || raw.includes('SSR')
            ? 'SSR'
            : raw === 'SR' || raw.includes('SR')
              ? 'SR'
              : raw === 'R' || raw.includes('R')
                ? 'R'
                : 'N';

        let cardFrontImage = asset('/images/card/00004.webp');
        if (rarity === 'SSR') cardFrontImage = asset('/images/card/00001.webp');
        else if (rarity === 'SR') cardFrontImage = asset('/images/card/00002.webp');
        else if (rarity === 'R') cardFrontImage = asset('/images/card/00003.webp');

        return {
          id: prize.id,
          rarity,
          cardFrontImage,
        };
      }),
    [wonPrizes]
  );

  const fetchData = useCallback(async () => {
    try {
      const productId = parseInt(params.id as string);
      if (isNaN(productId)) return;

      /*
       * 主資料（商品＋廠商名＋分類＋品項）走 lib/queries/product 的 fetchProductDetail：
       * 先套快取、再背景更新（lib/swr.ts）。ProductCard 在 touchstart 就用同一個 key 預取，
       * 所以從列表點進來時通常已經有資料、畫面直接出來（老闆 2026-08-22 頁面加載優化 ③⑤）。
       * 直連 Supabase、不走 CDN：庫存／剩餘數要即時。
       */
      const { data } = await swrLoad(
        queryClient,
        productKey(productId),
        () => fetchProductDetail(supabase, productId),
        (d) => {
          if (d.product.type === 'blindbox') return;
          setProduct(d.product);
          setSupplierName(d.supplierName);
          setProductCategories(d.categories);
          setPrizes(d.prizes);
        },
      );

      if (data.product.type === 'blindbox') {
        router.replace(`/blindbox/${productId}`);
        return;
      }

      // 猜你喜歡：先看「跟眼前這件像不像」，再看玩家口味（見 lib/recommendations）
      fetchRecommendations(supabase, data.product).then(setRecommendations);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [params.id, router, supabase, queryClient, setProduct, setPrizes, setRecommendations, setIsLoading]);

  useEffect(() => {
    let isMounted = true;
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        setIsLoading(false);
        showToast('連線逾時，請重新整理頁面', 'error');
      }
    }, 8000);

    fetchData().finally(() => {
      clearTimeout(timeoutId);
    });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [params.id, fetchData, showToast]);

  // Non-gacha types don't have a machine image gate — mark ready as soon as DB loads
  useEffect(() => {
    if (!isLoading && product && product.type !== 'gacha') {
      setIsMachineReady(true);
    }
  }, [isLoading, product]);

  /* 設定查太久也要放行（離線、RLS 擋住、Supabase 慢）。
     沒有這道保險，商品頁會永遠停在載入動畫 */
  useEffect(() => {
    const t = setTimeout(() => setModuleSettingsLoaded(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // 3s fallback in case machine image never fires onLoaded
  useEffect(() => {
    if (!isLoading && !isMachineReady) {
      const t = setTimeout(() => setIsMachineReady(true), 3000);
      return () => clearTimeout(t);
    }
  }, [isLoading, isMachineReady]);

  useEffect(() => {
    const loadModuleSettings = () => {
      supabase.from('module_settings').select('product_type, machine_theme').then(({ data }) => {
        if (data) {
          const map: Record<string, MachineTheme> = {};
          for (const row of data) map[row.product_type] = row.machine_theme as MachineTheme;
          setModuleSettings(map);
        }
        // 查失敗也要放行，否則整頁會停在載入畫面 —— 那比看到 fallback 機台更糟
        setModuleSettingsLoaded(true);
      });
    };
    loadModuleSettings();

    const channel = supabase
      .channel('module_settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'module_settings' }, loadModuleSettings)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  useEffect(() => {
    if (!params.id) return;
    const channel = supabase
      .channel(`product_machine_theme_${params.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products', filter: `id=eq.${params.id}` },
        (payload) => {
          const newTheme = (payload.new as any).machine_theme ?? null;
          setProduct(prev => prev ? { ...prev, machine_theme: newTheme } : prev);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, params.id]);


  useEffect(() => {
    const productId = parseInt(params.id as string);
    if (isNaN(productId)) return;


    const channel = supabase
      .channel(`product-${productId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'products',
          filter: `id=eq.${productId}`,
        },
        (payload) => {
          const newProduct = payload.new as Database['public']['Tables']['products']['Row'];
          setProduct((prev) => (prev ? { ...prev, ...newProduct } : null));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'product_prizes',
          filter: `product_id=eq.${productId}`,
        },
        (payload) => {
          const newPrize = payload.new as Database['public']['Tables']['product_prizes']['Row'];
          
          setPrizes((prev) => {
            const currentPrize = prev.find(p => p.id === newPrize.id);
            
            if (currentPrize && newPrize.remaining < currentPrize.remaining) {
              setTimeout(() => {
                showToast(
                  <span>{newPrize.name} 被抽走了！剩餘 {newPrize.remaining} 個</span>,
                  'info'
                );
              }, 0);
            }

            return prev.map((prize) =>
              prize.id === newPrize.id ? { ...prize, ...newPrize } : prize
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [params.id, supabase, showToast]);

  useEffect(() => {
    if (!isVideoOpen) return;
    const el = openingVideoRef.current;
    if (!el) return;
    try {
      el.currentTime = 0;
      el.play().catch(() => undefined);
    } catch { /* ignore */ }
  }, [isVideoOpen]);

  // Handle back button click
  // const handleBackClick = () => {
  //   // Always redirect to home page
  //   router.push('/');
  // };

  if (isLoading) {
    return <ProductLoadingScreen />;
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-4">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-neutral-50 mb-2">找不到商品</h1>
        <p className="text-neutral-500 dark:text-neutral-400 font-bold mb-6">您查看的商品可能已經下架或不存在。</p>
        <Link href="/">
          <Button size="lg">返回首頁</Button>
        </Link>
      </div>
    );
  }

  /*
   * 類別關閉時的畫面。
   *
   * 關類別只是讓分類頁籤消失，商品頁本身還在 —— 書籤、分享出去的網址、
   * 搜尋引擎快照都還進得來。不擋的話玩家會看到一個看起來完全正常、
   * 按下去卻抽不動的機台（DB 的 trigger 會擋，但那時已經走到掏錢那一步了）。
   *
   * 跟維護中分開講：關閉是平台不做這個類別了，講「已下架」讓玩家死心；
   * 維護中是暫時停一下，那個不走這條路，繼續往下渲染整個商品頁。
   */
  if (isCategoryClosedForPlay) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6 text-center">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-neutral-50 mb-2">商品關閉中</h1>
        <p className="max-w-xs text-neutral-500 dark:text-neutral-400 font-bold mb-6 leading-relaxed">
          這個商品目前沒有開放。已經抽到的獎品都還在你的倉庫裡。
        </p>
        <div className="flex gap-3">
          <Link href="/warehouse">
            <Button size="lg" variant="secondary">看我的倉庫</Button>
          </Link>
          <Link href="/">
            <Button size="lg">返回首頁</Button>
          </Link>
        </div>
      </div>
    );
  }


  const validPrizes = prizes.filter(p => 
    p.level !== 'Last One' && 
    p.level !== 'LAST ONE' && 
    !p.level.includes('最後賞')
  );
  
  const totalRemaining =
    typeof product.remaining === 'number'
      ? product.remaining
      : (prizes.length > 0
          ? validPrizes.reduce((acc, prize) => acc + (prize.remaining || 0), 0)
          : 0);

  /* 庫存與價格對玩家一律以「包」為單位呈現 —— 張數是內部的籤位數，
     玩家買的是包，看到「剩餘 1030」會以為還能抽一千次 */
  /*
   * 抽卡不再分「單抽／卡包」（老闆 2026-09-01）—— 全部都是「開一包卡」，
   * 差別只有一包裝幾張（1／3／5／10）。每包 1 張就是一包裡只有一張，
   * 不是另一種模式：抽獎引擎的整包分支代進 N=1 本來就等於原本的單抽分支。
   *
   * 所以下面所有文案一律用「包」。N = 1 時包數等於張數，數字看起來一樣，
   * 只有「每包 N 張」那一行會收起來（寫「每包 1 張」很囉唆）。
   */
  const cardsPerPack = Math.max(1, Number((product as any).cards_per_pack) || 1);
  const packsRemaining = Math.floor((totalRemaining ?? 0) / cardsPerPack);
  /* 卡包外觀：後台明講的欄位，不是靠「有沒有上傳圖」去猜（migration 666） */
  const useCustomPack = (product as any).pack_style === 'custom';
  /*
   * 演出裡要撕／要開的那個卡包正面。
   *
   * **一定要跟商品頁架上那個是同一個** —— 玩家看著一個卡包按下去，
   * 撕開的卻是另一張圖會很錯亂。migration 666 之前撞不到這個問題：
   * 撕開封口只有卡包模式能用，而卡包模式的輪播本來就吃商品自己的圖。
   * 現在三種演出都能配上內建五款，兩邊就必須共用同一條判斷。
   *
   * 選內建時用 activePackStyle —— 那是玩家**當下滑到的**那一款，
   * 不是隨便挑一款；他撕開的就是他剛剛看到的那一個。
   */
  const builtinPackFace = asset(`/images/card/pack/${activePackStyle}01.webp`);
  const packFaceImage = useCustomPack
    ? ((product as any).pack_front_image_url || product.image_url || builtinPackFace)
    : builtinPackFace;

  const totalItems =
    typeof product.total_count === 'number'
      ? product.total_count
      : (prizes.length > 0
          ? validPrizes.reduce((acc, prize) => acc + (prize.total || 0), 0)
          : 0);


  // 驗證頁不擋未登入。對外宣稱「公開可驗證」，卻要先註冊才看得到對照表，
  // 那就不是公開的了。登入只影響「你抽到的」那一段能不能顯示。
  const isSoldOut =
    (typeof totalRemaining === 'number' && totalRemaining <= 0) || product.status === 'ended';

  if (product.type === 'gacha') {
    /*
     * ⚠️ **主題還沒定就不要渲染機台**（老闆 2026-09-01）。
     *
     * 商品自己沒設主題時，主題要等 module_settings 查回來。舊版直接退回
     * `gacha_classic` 先畫，於是玩家會先看到那台的主圖（`gacha/main.webp`），
     * 設定一到又整個換掉。而且第一台的圖載完就會觸發 onMachineReady、
     * 把載入畫面收掉 —— 光把內容藏起來沒有用，得根本不要掛它，
     * 否則換主題時第二台又要重載一次圖，會閃第二次。
     */
    const themeResolved = !!(product as any).machine_theme || moduleSettingsLoaded;
    const gachaMachineTheme = (product as any).machine_theme || moduleSettings['gacha'] || 'gacha_classic'
    const gachaReady = themeResolved && isMachineReady;
    return (
      <>
        {!gachaReady && <ProductLoadingScreen />}
        <div style={!gachaReady ? { visibility: 'hidden', position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' } : undefined}>
          {themeResolved && (
            <GachaProductDetail product={product} prizes={prizes} machineTheme={gachaMachineTheme} onMachineReady={() => setIsMachineReady(true)} />
          )}
        </div>
      </>
    );
  }

  // Handle back button click
  // const handleBackClick = () => {
  //   // Always redirect to home page
  //   router.push('/');
  // };

  /*
   * 品項總覽（老闆 2026-09-03 最終版）：全部維持表格列（小縮圖＋賞等＋名稱＋剩餘/總數）。
   * 同一天試過 A賞／A+B賞改成倉庫那種大圖格子，老闆看了不要 —— 三個一排、只有兩件時
   * 會空一個白格在那邊。標題列拿掉了，表頭那格寫「品項總覽」就是這塊的名字。
   * 最後賞不在表裡，它有自己的金色卡片。抽卡／一番賞／自製賞三種共用同一份。
   */
  const renderPrizeTable = () => (
    <>
      <div className="overflow-x-auto relative custom-scrollbar">
        <table className="w-full text-left">
          <thead className="bg-neutral-50/50 dark:bg-neutral-800/50 text-[13px] sm:text-sm font-black text-neutral-400 dark:text-neutral-500 border-b border-neutral-50 dark:border-neutral-800">
            <tr>
              <th className="px-2 sm:px-6 py-2 sm:py-3 uppercase tracking-widest">品項總覽</th>
              <th
                className={cn(
                  "px-2 sm:px-6 py-2 sm:py-3 text-right uppercase tracking-widest w-[96px] sm:w-[128px] whitespace-nowrap",
                  "sticky right-0 z-20 bg-neutral-50/90 dark:bg-neutral-900/90 backdrop-blur-sm"
                )}
              >
                剩餘 / 總數
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
            {prizes.filter(p => !isLastOneLevel(p.level)).map((prize, index) => (
              <tr 
                key={index} 
                className={cn(
                  "hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors group cursor-pointer",
                  prize.remaining === 0 && "opacity-50"
                )}
                onClick={() => setViewingIndex(prizes.indexOf(prize))}
              >
                <td className="px-2 sm:px-6 py-2 sm:py-3.5">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 flex-shrink-0 relative overflow-hidden">
                      <Image src={prize.image_url || asset('/images/item_defaulet.webp')} alt={prize.name} fill className="object-cover" unoptimized />
                    </div>
                    {/* 賞等擺名稱左邊（老闆指定）：一番賞／抽卡／自製賞
                        的重點是「這是幾賞」，名稱反而是次要資訊 */}
                    <GradeBadge grade={prize.level} size="sm" />
                    <div className="font-black text-neutral-900 dark:text-neutral-50 text-[13px] sm:text-sm leading-tight tracking-tight whitespace-nowrap">
                      {prize.name}
                    </div>
                  </div>
                </td>
                <td
                  className={cn(
                    "px-2 sm:px-6 py-2 sm:py-3.5 text-right w-[96px] sm:w-[128px] whitespace-nowrap align-middle",
                    "sticky right-0 z-10 bg-white dark:bg-neutral-900",
                    "group-hover:bg-neutral-50/80 dark:group-hover:bg-neutral-800/80"
                  )}
                >
                  <span className="font-black text-sm sm:text-base tracking-tighter text-neutral-900 dark:text-neutral-50">
                    {prize.remaining.toLocaleString()}<span className="text-neutral-200 dark:text-neutral-700 mx-1">/</span>{prize.total.toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  if (product.type === 'card') {
    const cardThemeForMachine = (product as any).machine_theme
      || moduleSettings['card'];
    const renderCardMachine = () => (
      <div
        className="relative overflow-hidden"
        style={{ width: 375, transform: `scale(${cardScale})`, transformOrigin: 'top center' }}
      >
        <div>
          <div
            className="relative w-full"
            style={{
              aspectRatio: '750/932',
              /*
               * 卡包輪播會整片蓋住這一區（它自己畫海景），這裡只是它還沒接手前的底。
               * 用同一支函式算，所以載入那一瞬間的顏色就是接手後的顏色，不會閃。
               * 只在 render 時算一次就夠 —— 上面那層蓋住之後這個顏色不會再被看到。
               */
              background: skyGradientCss(skyProgressNow()),
            }}
          >
            {/* 閃電＝快速模式（略過撕包＋SKIP 一次跳到最後），位置在機台區左上角。
                只掛在 card_peel：`card_pack` 走的是 CardDrawAnimation，那支沒有撕包步驟
                也沒有 SKIP，先前把它一起列進條件，玩家按了會轉金但完全沒作用。 */}
            {cardThemeForMachine === 'card_peel' && (
              <button
                type="button"
                onClick={toggleSkipPackIntro}
                aria-pressed={skipPackIntro}
                title={skipPackIntro
                  ? '快速模式：開（略過撕包，SKIP 一次跳到最後一張）'
                  : '快速模式：關（要撕包，SKIP 逐包停在壓軸）'}
                /* 尺寸與質感對齊右上角的靜音鈕：漸層＋內緣高光＋外投影，
                   按下時往下沉一格。開啟時整顆轉成金色，一眼看得出狀態 */
                className="absolute flex h-[38px] w-[38px] items-center justify-center rounded-full transition-all active:translate-y-[1px] active:scale-95"
                /* 與右上角靜音鈕共用同一組立體樣式（行內寫，tailwind 的多重 box-shadow
                   arbitrary class 解析不出來）。開啟時整顆轉金色，一眼看得出狀態 */
                style={{
                  left: 12, top: 12, zIndex: 25,
                  color: skipPackIntro ? '#4a3200' : '#fff',
                  /* 金色版與演出裡那顆共用同一份（SoundToggle 匯出），
                     不再各寫一份漸層 —— 改一邊就對不起來 */
                  ...(skipPackIntro ? RAISED_STYLE_GOLD : RAISED_STYLE),
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden
                     className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">
                  <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
                </svg>
              </button>
            )}

            <button
              type="button"
              className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center px-3 rounded-full text-center"
              style={{ top: 430, height: 20, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 20 }}
              onClick={() => setIsCardImageMode(prev => !prev)}
            >
              <span className="font-medium" style={{ color: '#FFFFFF', fontSize: 12 }}>
                點擊顯示圖片
              </span>
            </button>

            {/* 商品圖：點膠囊開、點圖或再點膠囊關（老闆指定）。167 放大三成 → 217 */}
            <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 42, width: 217, height: 217, zIndex: 20 }}>
              {product.id && (
                <div
                  className="absolute inset-0 flex items-center justify-center cursor-pointer"
                  style={{ opacity: isCardImageMode ? 1 : 0, pointerEvents: isCardImageMode ? 'auto' : 'none', transition: 'opacity 200ms ease-out' }}
                >
                  {/* 雙指可放大／拖移看細節，放開彈回；單指點一下才收起 */}
                  <PinchZoomImage
                    src={product.image_url || asset(`/images/item/${product.id.toString().padStart(5, '0')}.jpg`)}
                    alt={product.name}
                    className="w-full h-full border border-white/20"
                    onTap={() => setIsCardImageMode(false)}
                  />
                </div>
              )}
            </div>

            {/* 卡包輪播：貼機台頂端，讓輪播自己的容器決定垂直位置（老闆實測）。
                先前加 h-1/2 想「在上半部裡居中」，反而把它推得更高 ——
                輪播內層有自己的 perspective 容器，外面再夾一層高度只會打架 */}
            <div className="absolute left-1/2 top-0 -translate-x-1/2 flex items-center justify-center" style={{ width: 375, zIndex: 10 }}>
              <div className="relative w-full flex items-center justify-center">
                <PackShowcase3D
                  ref={packCarouselRef}
                  packStyles={packStyles}
                  onActiveStyleChange={handleActiveStyleChange}
                  height={Math.round(375 * 932 / 750)}
                  /* 卡包樣式選「自訂」才用這一檔商品自己的正／背面，選「預設」就是內建
                     五款輪流（migration 666 之前是看「是不是卡包模式」）。
                     卡包正面是獨立欄位（migration 592）；沒設才退回商品主圖 ——
                     商品主圖是列表／小卡用的，構圖跟直式卡包不一定合，不該綁在一起 */
                  frontImage={useCustomPack ? ((product as any).pack_front_image_url || product.image_url || undefined) : undefined}
                  backImage={useCustomPack ? ((product as any).pack_back_image_url || undefined) : undefined}
                />
              </div>
            </div>

            {/* 機台上不畫按鈕（老闆指定）—— 換一批／立即開包／試試看
                改走頁面底部固定操作欄，跟盒玩 blindbox_mode5、轉蛋 gacha_mode5 一致 */}

            {isSoldOut && (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center" style={{ bottom: '0%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10 }}>
                <div className="mt-16 inline-flex h-8 items-center px-4 rounded-full bg-black/90 shadow-lg">
                  <span className="text-[14px] font-black tracking-widest text-yellow-300">該商品已完抽</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );

    const cardRightContent = (
      <div className="space-y-2 sm:space-y-5">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              {/* 「品項總覽」標題列拿掉（老闆 2026-09-03），名字改寫在表頭那格。
                  轉蛋／盒玩的 GachaCollectionList 那份維持 */}
              
              {renderPrizeTable()}

              <div className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-4 bg-accent-red/5 dark:bg-accent-red/10 border-t-2 border-neutral-50 dark:border-neutral-800">
                <span className="font-black text-accent-red text-sm sm:text-base tracking-widest uppercase">
                  合計
                </span>
                <span className="text-lg sm:text-2xl font-black tracking-tighter whitespace-nowrap">
                  <span className="font-black text-accent-red">
                    {totalRemaining.toLocaleString()}
                  </span>
                  <span className="text-accent-red/30 mx-1">/</span>
                  <span className="font-black text-neutral-700 dark:text-neutral-400">
                    {totalItems.toLocaleString()}
                  </span>
                </span>
              </div>
            </div>

            {prizes.find(p => p.level === 'Last One' || p.level === 'LAST ONE' || p.level.includes('最後賞')) && (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-1">
                {(() => {
                  const lastOnePrize = prizes.find(p => p.level === 'Last One' || p.level === 'LAST ONE' || p.level.includes('最後賞'));
                  if (!lastOnePrize) return null;
                  const lastOneImage =
                    lastOnePrize.image_url && !lastOnePrize.image_url.startsWith('blob:')
                      ? lastOnePrize.image_url
                      : asset('/images/item_defaulet.webp');
                  
                  return (
                    <button
                      type="button"
                      className="w-full text-left bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-neutral-900 dark:text-neutral-100 shadow-xl relative overflow-hidden group border border-yellow-200/60 dark:border-yellow-700/40"
                      onClick={() => setViewingIndex(prizes.indexOf(lastOnePrize))}
                    >
                      <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/20 dark:bg-yellow-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none transition-opacity opacity-50 group-hover:opacity-100" />
                      
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/60 dark:bg-white/10 rounded-xl flex-shrink-0 relative overflow-hidden border border-yellow-200/60 dark:border-white/10">
                          <Image 
                            src={lastOneImage}
                            alt={lastOnePrize.name}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-110"
                            unoptimized
                          />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                             <span className="px-2 py-0.5 bg-yellow-400 text-neutral-900 text-[10px] font-black rounded tracking-wider shadow-lg shadow-yellow-400/30 font-[Chiron_GoRound_TC]">
                               最後賞
                             </span>
                          </div>
                          <h3 className="text-base sm:text-lg font-black text-neutral-900 dark:text-neutral-50 leading-tight mb-1 truncate">
                            {lastOnePrize.name}
                          </h3>
                          <p className="text-[10px] sm:text-xs text-yellow-800/80 dark:text-yellow-300/80 font-bold">
                            購買最後一張籤即可獲得此獎項
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })()}
              </div>
            )}

            <FairnessPanel
              productId={product.id}
              commitment={(product as any).txid_hash ?? null}
              isSealed={!!(product as any).sealed_at}
              isSoldOut={isSoldOut}
            />
            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="px-3 sm:px-6 py-2 sm:py-4 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30">
                <h3 className="font-black text-neutral-900 dark:text-neutral-50 text-base sm:text-xl tracking-tight">商品資訊</h3>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {/* 促銷列：有進行中的方案才出現，放第一列、紅色膠囊（全類別跟轉蛋頁同一套） */}
                {promo && (
                  <div className="flex justify-between items-center text-sm py-2 sm:py-3 px-3 sm:px-6">
                    <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">促銷</span>
                    <span className="inline-flex items-center rounded-full bg-accent-red/10 px-2.5 py-0.5 text-[13px] font-black text-accent-red">
                      {promo.name || promo.badgeText}
                    </span>
                  </div>
                )}
                {[
                  { label: '類別', value: ({ ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋', card: '抽卡', custom: '自製賞' } as Record<string, string>)[product.type] || product.type },
                  { label: '廠商', value: supplierName || '-' },
                  { label: '代理商', value: product.distributor || '-' },
                  { label: '條碼', value: (product as any).barcode || '-' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center text-sm py-2 sm:py-3 px-3 sm:px-6">
                    <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">{label}</span>
                    <span className="text-neutral-900 dark:text-neutral-50 font-black">{value}</span>
                  </div>
                ))}

                {/* 分類清單 */}
                <div className="flex justify-between items-center text-sm py-2 sm:py-3 px-3 sm:px-6">
                  <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">分類</span>
                  {productCategories.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {productCategories.map(cat => (
                        <button key={cat.id} type="button"
                          onClick={() => {
                            sessionStorage.setItem('gachago:home_state', JSON.stringify({ activePrimaryTab: `menu:${cat.id}` }))
                            sessionStorage.setItem('gachago:home_restore', '1')
                            router.push('/')
                          }}
                          className="px-3 py-0.5 rounded-full text-xs font-bold border border-primary/40 text-primary bg-primary/5 hover:bg-primary/15 transition-colors">
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-neutral-900 dark:text-neutral-50 font-black">-</span>
                  )}
                </div>
              </div>

              <div className="px-3 sm:px-6 py-3 sm:py-5">
                <p className="text-[13px] sm:text-sm font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">
                  注意事項
                </p>
                <ol className="space-y-1 list-decimal list-inside">
                  {((t => t === 'ichiban' ? [
                    '一番賞為固定賞項隨機出獎，依抽到的賞別為主，無法指定特定賞別。',
                    '抽出後即確認結果，不可退款或更換款式。',
                    '實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。',
                    '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
                    '商品圖片僅供參考，實物以實際配送為準。',
                    '本平台保留對所有活動及商品之最終解釋權。',
                  ] : t === 'card' ? [
                    '抽卡商品均為隨機出卡，抽到什麼出什麼。',
                    '抽出後即確認結果，不可退款或更換款式。',
                    '卡片由廠商備貨配送，配送時間約 3–7 個工作日。',
                    '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
                    '商品圖片僅供參考，實物以實際配送為準。',
                    '本平台保留對所有活動及商品之最終解釋權。',
                  ] : t === 'blindbox' ? [
                    '盒玩商品均為隨機出獎，抽到什麼出什麼。',
                    '抽出後即確認結果，不可退款或更換款式。',
                    '實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。',
                    '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
                    '商品圖片僅供參考，實物以實際配送為準。',
                    '本平台保留對所有活動及商品之最終解釋權。',
                  ] : [
                    '自製賞商品均為隨機出獎，抽到什麼出什麼。',
                    '抽出後即確認結果，不可退款或更換款式。',
                    '實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。',
                    '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
                    '商品圖片僅供參考，實物以實際配送為準。',
                    '本平台保留對所有活動及商品之最終解釋權。',
                  ])(product.type as string)).map((item, i) => (
                    <li key={i} className="text-[12px] sm:text-[13px] text-neutral-400 dark:text-neutral-500 font-bold leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="pt-2 sm:pt-8">
              <div className="flex items-center justify-between mb-2 sm:mb-8 px-1">
                <h2 className="text-base sm:text-2xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">猜你喜歡</h2>
                <Link href="/search" className="flex items-center gap-0.5 text-[13px] sm:text-sm font-bold text-primary hover:text-primary/80">更多<ChevronRight className="w-4 h-4" /></Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-5">
                {recommendations.map((item) => (
                  <ProductCard 
                    key={item.id} 
                    id={item.id}
                    name={item.name}
                    image={item.image_url || ''}
                    price={item.price}
                    remaining={item.remaining}
                    total={item.total_count}
                    cardsPerPack={(item as any).cards_per_pack}
                    isHot={item.is_hot || false}
                    category={item.category || ''}
                    type={item.type}
                    status={item.status}
                  />
                ))}
              </div>
            </div>
          </div>
    );

    return (
      <>
      {/* 素材沒到就先放載入動畫，跟轉蛋同一套處理，避免半成品先攤在玩家眼前 */}
      {!cardAssetsReady && <ProductLoadingScreen />}
      <div
        className="min-h-screen bg-neutral-50 dark:bg-neutral-950"
        style={!cardAssetsReady ? { visibility: 'hidden', position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' } : undefined}
      >
        {/* Mobile < 1024px；pt 同上，要含警語列高度 */}
        <div
          className="block lg:hidden overflow-x-hidden pb-32"
          style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
        >
          <div
            className="w-full flex justify-center"
            style={{ marginBottom: Math.round(375 * (932 / 750) * (cardScale - 1)) }}
          >
            {renderCardMachine()}
          </div>
          <div className="max-w-[560px] mx-auto px-2 pb-2 mt-2">
            {cardRightContent}
          </div>
        </div>

        {/* Desktop ≥ 1024px */}
        <div className="hidden lg:block pb-12">
          <div className="max-w-7xl mx-auto px-2 pt-20 pb-6">
            <div className="grid grid-cols-12 gap-6 items-start">
              <div className="col-span-4 sticky top-20">
                <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                  <div
                    className="w-full overflow-hidden flex justify-center"
                    style={{ height: Math.round(cardScale * 375 * 932 / 750) }}
                  >
                    {renderCardMachine()}
                  </div>
                  <div className="p-5 space-y-3">
                    <h1 className="text-lg font-black text-neutral-900 dark:text-neutral-50 leading-tight tracking-tight break-all">
                      <span className="inline-block align-middle mr-2">
                        <ProductBadge type="card" className="h-5 px-1.5 text-[10px]" />
                      </span>
                      <span className="align-middle">{product.name}</span>
                    </h1>
                    <div className="flex items-end justify-between gap-2 pb-4 border-b border-neutral-50 dark:border-neutral-800">
                      <div className="flex items-baseline gap-2">
                        <Image src={asset("/images/gcoin.webp")} alt="G Coin" width={20} height={20} className="w-5 h-5 object-contain" />
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-4xl font-black text-accent-red font-amount tracking-tighter leading-none">{product.price.toLocaleString()}</span>
                          <span className="text-sm text-neutral-400 font-black uppercase tracking-widest">/ 包</span>
                        </div>
                      </div>
                      {typeof totalRemaining === 'number' && (
                        <div className="text-right shrink-0">
                          <div className="text-[11px] text-neutral-400 font-bold">剩餘</div>
                          <div className="text-xl font-black text-neutral-900 dark:text-white font-amount leading-none">
                            {packsRemaining.toLocaleString()}
                            <span className="ml-0.5 text-xs font-bold text-neutral-400">包</span>
                          </div>
                          {cardsPerPack >= 2 && <div className="text-[10px] text-neutral-400">每包 {cardsPerPack} 張</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-span-8">
                {cardRightContent}
              </div>
            </div>
          </div>
        </div>

        <PrizeDetailSheet
          prize={viewingPrize}
          onClose={() => setViewingIndex(null)}
          onPrev={prizes.length > 1 ? () => stepPrize(-1) : undefined}
          onNext={prizes.length > 1 ? () => stepPrize(1) : undefined}
          sealed={FAIR_ENGINE_TYPES.includes(product.type)}
          /* 抽卡的品項就是卡片，圖區塊一律用 360° 立體展示（老闆原型 card-showcase）。
             migration 666 之前只有卡包模式才開 —— 那是綁錯東西，跟一包幾張無關 */
          showcase3d
          showcaseBackImage={(product as any).card_back_image_url}
        />

        {(() => {
          // 全站預設只有一組（migration 666 合併，模式概念已拿掉）
          const cardTheme = (product as any).machine_theme || moduleSettings['card'];
          if (cardTheme === 'card_peel') {
            // 全畫面直開，不套彈窗 —— 原型的根容器本身就是 fixed inset-0，
            // 再包一層 modal 會變成「畫面裡的一個小框」，跟蓄力開卡包的體感不一致（老闆指定）
            if (!isVideoOpen || wonPrizes.length === 0) return null;
            /* 稀有度 → 原型的三層光環：blue 稀有 / purple 史詩 / gold 傳說。
               最後一張決定整包的收尾光環，所以取整包裡最高的那一級 */
            /*
             * 卡包模式只有兩種特效（老闆 2026-08-19）：
             *   紫 = A賞／SSR／最後賞  →  最後一張翻牌前會打閃電（九格素材）
             *   藍 = B賞、C賞以下      →  只有柔光，不打閃
             * 要把 B賞 也算紫的話，把下面那行加上 raw.includes('B賞') 就好。
             */
            const tierOf = (p: Prize): 'blue' | 'purple' => {
              const raw = `${p.grade ?? ''}${p.rarity ?? ''}`.toUpperCase();
              if (raw.includes('SSR') || raw.includes('超稀有') || raw.includes('A賞') || p.is_last_one) return 'purple';
              return 'blue';
            };
            const rank = { blue: 0, purple: 1 };
            /*
             * **逐包**排序與逐包算等級（老闆 2026-08-19）。
             *
             * 先前是把整筆購買當成一疊排序：買十包時所有大賞會被排到最後面，
             * 前九包的收尾全是平的，看起來就像「第 91 張才開始有特效」。
             * 真實卡包是每一包最後一張才是壓軸，所以要切成一包一包各自處理。
             *
             * 只動「顯示順序」，籤號與獎項本身不變 —— 公平性驗證看的是籤號，不受影響。
             */
            const packs: Prize[][] = [];
            for (let i = 0; i < wonPrizes.length; i += cardsPerPack) {
              packs.push(wonPrizes.slice(i, i + cardsPerPack));
            }
            // 每包內部由低到高排，該包最好的那張落在該包的最後一張
            const orderedPacks = packs.map(pack =>
              [...pack].sort((a, b) => rank[tierOf(a)] - rank[tierOf(b)]));
            const ordered = orderedPacks.flat();
            // 每包一個特效等級：包裡有大賞就紫，否則藍
            const packTiers = orderedPacks.map(pack =>
              pack.reduce<'blue' | 'purple'>(
                (best, p) => (rank[tierOf(p)] > rank[best] ? tierOf(p) : best), 'blue'));
            return (
              /* 疊在頁面之上：原型的 stage 是 fixed inset-0 但沒有 z-index，
                 直接渲染會被底部操作欄（z-40）、警語列、頁首壓在上面 ——
                 畫面看起來就是卡包被切一半、還能按「立即開包」。
                 這層只負責疊層，不是彈窗：仍然是滿版無邊框，與過場影片同一個 z-[2100] */
              <div className="fixed inset-0 z-[2100]">
              <GgbPackRip
                packImage={packFaceImage}
                cardBack={(product as any).card_back_image_url || asset('/images/card/back.webp')}
                cards={ordered.map(p => p.image_url || asset('/images/card/00004.webp'))}
                prizeTier={packTiers[0] ?? 'blue'}
                prizeTiers={packTiers}
                soundDefault={!isVideoMuted}
                /* 快速模式：略過撕包＋快進時不演飛牌（SKIP 是直接結束整場，不歸它管）。
                   演出裡也有同一顆閃電，在那邊切了要寫回這裡的偏好，兩處才是同一個狀態 */
                fast={skipPackIntro}
                onFastChange={setSkipPackIntroPref}
                cardsPerPack={cardsPerPack}
                title={product.name}
                onFinish={handleVideoEnd}
                onExit={handleVideoEnd}
              />
              </div>
            );
          }
          if (cardTheme === 'card_pack') {
            return (
              <CardDrawAnimation
                isOpen={isVideoOpen}
                prizes={wonPrizes}
                packImage={packFaceImage}
                onGoToWarehouse={handleVideoEnd}
                onContinue={handleCardContinue}
              />
            );
          }
          // card_video 與未設定皆走過場影片：播完 handleVideoEnd 會關影片並開恭喜彈窗
          return isVideoOpen ? (
            <div className="fixed inset-0 z-[2100] bg-black pointer-events-auto flex items-center justify-center">
              <div className="relative w-full h-full max-w-[560px] bg-black shadow-2xl">
                <video
                  ref={openingVideoRef}
                  src={openingVideoSrc}
                  className="w-full h-full object-cover"
                  preload="auto"
                  muted={isVideoMuted}
                  playsInline
                  onEnded={handleVideoEnd}
                  onError={handleVideoError}
                />
                <SoundToggle safeTop className="absolute top-4 right-4 z-10" />
                <button
                  type="button"
                  className="absolute bottom-4 right-4 z-10 px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em]"
                  onClick={handleVideoEnd}
                >
                  SKIP
                </button>
              </div>
            </div>
          ) : null;
        })()}

        <GachaResultModal
          isOpen={isPrizeModalOpen}
          onClose={() => {
            setIsPrizeModalOpen(false);
            setWonPrizes([]);
            fetchData();
          }}
          results={wonPrizes}
        />

        {showResultModal && (
          <PrizeResultModal
            isOpen={showResultModal}
            onClose={() => setShowResultModal(false)}
            isLoading={isLoadingResults}
            results={drawResults.map(r => ({
              grade: r.prize_level,
              name: r.prize_name,
              isOpened: true,
              image_url: r.prize_image_url || '',
              is_last_one: r.is_last_one || r.prize_level.includes('Last One') || r.prize_level.includes('LAST ONE') || r.prize_level.includes('最後賞') || (r.ticket_number === 0),
              ticket_number: r.ticket_number || 0
            }))}
            skipRevealAnimation={true}
          />
        )}

        {product && (
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
        )}
        {/* 底部固定操作欄 —— 機台上不再畫按鈕（老闆指定）。
            版型與配色照盒玩 blindbox_mode5：左側單抽金額，右側三顆 */}
        <div data-testid="bottom-action-bar" className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-100 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-modal backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/90">
          <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4">
            <div className="flex h-full shrink-0 flex-col justify-center pl-1">
              <span className="mb-0.5 text-[13px] font-black uppercase tracking-widest leading-none text-neutral-400">
                單包
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
              {/* 自訂卡包沒有「換一批」：整檔只有一種樣式，換了畫面不會有任何變化 */}
              {!useCustomPack && (
                <button
                  onClick={handleChangePack}
                  disabled={isSoldOut}
                  className="h-[44px] shrink-0 rounded-xl bg-neutral-200 px-3 text-sm font-black text-neutral-700 transition-colors hover:bg-neutral-300 disabled:opacity-50"
                >
                  換一批
                </button>
              )}
              <button
                onClick={isSoldOut ? handleShowResults : handleDrawClick}
                className="h-full flex-1 whitespace-nowrap rounded-xl bg-accent-red text-base font-black text-white shadow-lg shadow-accent-red/30 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isSoldOut ? '查看結果' : '立即開包'}
              </button>
              <button
                onClick={handleTrialCard}
                disabled={isSoldOut}
                className="h-[44px] shrink-0 rounded-xl bg-purple-600 px-3 text-sm font-black text-white shadow-lg shadow-purple-600/30 transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                試試看
              </button>
            </div>
          </div>
        </div>

        {FAIR_ENGINE_TYPES.includes(product.type) && (
          <ViewerPill productId={product.id} />
        )}
      </div>
      </>
    );
  }

  return (
    <div
      className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-32"
      style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
    >
      <div className="max-w-7xl mx-auto px-2 py-2 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-6 items-start">
          <div className="lg:col-span-4 lg:sticky lg:top-20">
            <div className="bg-white dark:bg-neutral-900 rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-800">
                <div className="w-full h-full flex items-center justify-center text-white/20 group-hover:scale-105 transition-transform duration-500">
                  <Image
                    src={product.image_url || asset(`/images/item/${product.id.toString().padStart(5, '0')}.jpg`)}
                    alt={product.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                
                {((typeof totalRemaining === 'number' && totalRemaining <= 0) || product.status === 'ended') && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
                    <Image 
                      src={asset("/images/sale.svg")} 
                      alt="完抽" 
                      width={120}
                      height={120}
                      className="w-28 h-auto transform scale-110 drop-shadow-xl"
                      unoptimized
                    />
                  </div>
                )}
                
                <div className="absolute top-0 right-0 z-10 flex flex-col items-end pointer-events-none">
                  {product.is_hot && (
                    <div className="h-6 px-2 inline-flex items-center rounded-tr-lg rounded-bl-lg bg-primary text-white text-[11px] font-black border border-white/10 leading-none transform origin-top-right scale-150">
                      熱門
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-3 sm:p-6 space-y-2 sm:space-y-5">
                <h1 className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-neutral-50 leading-tight tracking-tight break-all">
                  {product.type && (
                    <span
                      className={cn(
                        "inline-block align-middle mr-2",
                        product.type === 'ichiban' && "sm:mt-1"
                      )}
                    >
                      <ProductBadge type={product.type as 'ichiban' | 'blindbox' | 'gacha' | 'custom'} className="h-5 px-1.5 text-[10px]" />
                    </span>
                  )}
                  <span className="align-middle">
                    {product.name}
                  </span>
                </h1>
                {product.is_preorder && (
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-yellow-50 text-yellow-700 border border-yellow-200">
                      <span className="text-[11px] font-black">預購商品</span>
                      <span className="text-[11px] font-bold">
                        預計可配送日 {product.preorder_available_at ? new Date(product.preorder_available_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '待公布'}
                      </span>
                    </span>
                  </div>
                )}
                
                <div className="hidden lg:flex items-end justify-between gap-2 pb-5 border-b border-neutral-50 dark:border-neutral-800">
                  <div className="flex items-baseline gap-2">
                    <Image
                      src={asset("/images/gcoin.webp")}
                      alt="G Coin"
                      width={20}
                      height={20}
                      className="w-5 h-5 object-contain"
                    />
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-black text-accent-red font-amount tracking-tighter leading-none">{product.price.toLocaleString()}</span>
                      <span className="text-sm text-neutral-400 font-black uppercase tracking-widest">/ 抽</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-2 sm:space-y-5">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              {/* 「品項總覽」標題列拿掉（老闆 2026-09-03），名字改寫在表頭那格。
                  轉蛋／盒玩的 GachaCollectionList 那份維持 */}
              
              {renderPrizeTable()}

              <div className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-4 bg-accent-red/5 dark:bg-accent-red/10 border-t-2 border-neutral-50 dark:border-neutral-800">
                <span className="font-black text-accent-red text-sm sm:text-base tracking-widest uppercase">
                  合計
                </span>
                <span className="text-lg sm:text-2xl font-black tracking-tighter whitespace-nowrap">
                  <span className="font-black text-accent-red">
                    {totalRemaining.toLocaleString()}
                  </span>
                  <span className="text-accent-red/30 mx-1">/</span>
                  <span className="font-black text-neutral-700 dark:text-neutral-400">
                    {totalItems.toLocaleString()}
                  </span>
                </span>
              </div>
            </div>

            {prizes.find(p => p.level === 'Last One' || p.level === 'LAST ONE' || p.level.includes('最後賞')) && (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-1">
                {(() => {
                  const lastOnePrize = prizes.find(p => p.level === 'Last One' || p.level === 'LAST ONE' || p.level.includes('最後賞'));
                  if (!lastOnePrize) return null;
                  const lastOneImage =
                    lastOnePrize.image_url && !lastOnePrize.image_url.startsWith('blob:')
                      ? lastOnePrize.image_url
                      : asset('/images/item_defaulet.webp');
                  
                  return (
                    <button
                      type="button"
                      className="w-full text-left bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-neutral-900 dark:text-neutral-100 shadow-xl relative overflow-hidden group border border-yellow-200/60 dark:border-yellow-700/40"
                      onClick={() => setViewingIndex(prizes.indexOf(lastOnePrize))}
                    >
                      <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/20 dark:bg-yellow-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none transition-opacity opacity-50 group-hover:opacity-100" />
                      
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/60 dark:bg-white/10 rounded-xl flex-shrink-0 relative overflow-hidden border border-yellow-200/60 dark:border-white/10">
                          <Image 
                            src={lastOneImage}
                            alt={lastOnePrize.name}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-110"
                            unoptimized
                          />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                             <span className="px-2 py-0.5 bg-yellow-400 text-neutral-900 text-[10px] font-black rounded tracking-wider shadow-lg shadow-yellow-400/30 font-[Chiron_GoRound_TC]">
                               最後賞
                             </span>
                          </div>
                          <h3 className="text-base sm:text-lg font-black text-neutral-900 dark:text-neutral-50 leading-tight mb-1 truncate">
                            {lastOnePrize.name}
                          </h3>
                          <p className="text-[10px] sm:text-xs text-yellow-800/80 dark:text-yellow-300/80 font-bold">
                            購買最後一張籤即可獲得此獎項
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })()}
              </div>
            )}

            <FairnessPanel
              productId={product.id}
              commitment={(product as any).txid_hash ?? null}
              isSealed={!!(product as any).sealed_at}
              isSoldOut={isSoldOut}
            />
            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="px-3 sm:px-6 py-2 sm:py-4 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30">
                <h3 className="font-black text-neutral-900 dark:text-neutral-50 text-base sm:text-xl tracking-tight">商品資訊</h3>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {/* 促銷列：有進行中的方案才出現，放第一列、紅色膠囊（全類別跟轉蛋頁同一套） */}
                {promo && (
                  <div className="flex justify-between items-center text-sm py-2 sm:py-3 px-3 sm:px-6">
                    <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">促銷</span>
                    <span className="inline-flex items-center rounded-full bg-accent-red/10 px-2.5 py-0.5 text-[13px] font-black text-accent-red">
                      {promo.name || promo.badgeText}
                    </span>
                  </div>
                )}
                {[
                  { label: '類別', value: ({ ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋', card: '抽卡', custom: '自製賞' } as Record<string, string>)[product.type] || product.type },
                  { label: '廠商', value: supplierName || '-' },
                  { label: '代理商', value: product.distributor || '-' },
                  { label: '條碼', value: (product as any).barcode || '-' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center text-sm py-2 sm:py-3 px-3 sm:px-6">
                    <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">{label}</span>
                    <span className="text-neutral-900 dark:text-neutral-50 font-black">{value}</span>
                  </div>
                ))}

                {/* 分類清單 */}
                <div className="flex justify-between items-center text-sm py-2 sm:py-3 px-3 sm:px-6">
                  <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">分類</span>
                  {productCategories.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {productCategories.map(cat => (
                        <button key={cat.id} type="button"
                          onClick={() => {
                            sessionStorage.setItem('gachago:home_state', JSON.stringify({ activePrimaryTab: `menu:${cat.id}` }))
                            sessionStorage.setItem('gachago:home_restore', '1')
                            router.push('/')
                          }}
                          className="px-3 py-0.5 rounded-full text-xs font-bold border border-primary/40 text-primary bg-primary/5 hover:bg-primary/15 transition-colors">
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-neutral-900 dark:text-neutral-50 font-black">-</span>
                  )}
                </div>
              </div>

              <div className="px-3 sm:px-6 py-3 sm:py-5">
                <p className="text-[13px] sm:text-sm font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">
                  注意事項
                </p>
                <ol className="space-y-1 list-decimal list-inside">
                  {((t => t === 'ichiban' ? [
                    '一番賞為固定賞項隨機出獎，依抽到的賞別為主，無法指定特定賞別。',
                    '抽出後即確認結果，不可退款或更換款式。',
                    '實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。',
                    '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
                    '商品圖片僅供參考，實物以實際配送為準。',
                    '本平台保留對所有活動及商品之最終解釋權。',
                  ] : t === 'card' ? [
                    '抽卡商品均為隨機出卡，抽到什麼出什麼。',
                    '抽出後即確認結果，不可退款或更換款式。',
                    '卡片由廠商備貨配送，配送時間約 3–7 個工作日。',
                    '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
                    '商品圖片僅供參考，實物以實際配送為準。',
                    '本平台保留對所有活動及商品之最終解釋權。',
                  ] : t === 'blindbox' ? [
                    '盒玩商品均為隨機出獎，抽到什麼出什麼。',
                    '抽出後即確認結果，不可退款或更換款式。',
                    '實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。',
                    '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
                    '商品圖片僅供參考，實物以實際配送為準。',
                    '本平台保留對所有活動及商品之最終解釋權。',
                  ] : [
                    '自製賞商品均為隨機出獎，抽到什麼出什麼。',
                    '抽出後即確認結果，不可退款或更換款式。',
                    '實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。',
                    '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
                    '商品圖片僅供參考，實物以實際配送為準。',
                    '本平台保留對所有活動及商品之最終解釋權。',
                  ])(product.type as string)).map((item, i) => (
                    <li key={i} className="text-[12px] sm:text-[13px] text-neutral-400 dark:text-neutral-500 font-bold leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="pt-2 sm:pt-8">
              <div className="flex items-center justify-between mb-2 sm:mb-8 px-1">
                <h2 className="text-base sm:text-2xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">猜你喜歡</h2>
                <Link href="/search" className="flex items-center gap-0.5 text-[13px] sm:text-sm font-bold text-primary hover:text-primary/80">更多<ChevronRight className="w-4 h-4" /></Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-5">
                {recommendations.map((item) => (
                  <ProductCard 
                    key={item.id} 
                    id={item.id}
                    name={item.name}
                    image={item.image_url || ''}
                    price={item.price}
                    remaining={item.remaining}
                    total={item.total_count}
                    cardsPerPack={(item as any).cards_per_pack}
                    isHot={item.is_hot || false}
                    category={item.category || ''}
                    type={item.type}
                    status={item.status}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <PrizeDetailSheet
          prize={viewingPrize}
          onClose={() => setViewingIndex(null)}
          onPrev={prizes.length > 1 ? () => stepPrize(-1) : undefined}
          onNext={prizes.length > 1 ? () => stepPrize(1) : undefined}
          sealed={FAIR_ENGINE_TYPES.includes(product.type)}
          /* 抽卡的品項就是卡片，圖區塊一律用 360° 立體展示（老闆原型 card-showcase）。
             migration 666 之前只有卡包模式才開 —— 那是綁錯東西，跟一包幾張無關 */
          showcase3d
          showcaseBackImage={(product as any).card_back_image_url}
        />

        {/* 底部固定操作欄（手機、電腦都顯示）—— 版型與配色照抽卡／盒玩 blindbox_mode5：
            左側單抽金額，右側「立即抽獎」＋「試試看」。電腦端原本把按鈕畫在左側商品卡裡，
            老闆指定改成跟抽卡一樣走底部導航 */}
        <div data-testid="bottom-action-bar" className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-100 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-modal backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/90">
          <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4">
            <div className="flex h-full shrink-0 flex-col justify-center pl-1">
              <span className="mb-0.5 text-[13px] font-black uppercase tracking-widest leading-none text-neutral-400">
                單包
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
                onClick={totalRemaining === 0 ? handleShowResults : handleDrawClick}
                className={cn(
                  "h-full flex-1 whitespace-nowrap rounded-xl text-base font-black shadow-lg transition-all active:scale-[0.98]",
                  totalRemaining === 0
                    ? "bg-neutral-900 text-white shadow-neutral-900/20 hover:bg-neutral-800 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
                    : "bg-accent-red text-white shadow-accent-red/30"
                )}
              >
                {totalRemaining === 0
                  ? '查看結果'
                  : product.type === 'ichiban'
                    ? '立即抽獎'
                    : '立即轉蛋'}
              </button>
              {/* 試試看：一律單抽的免費試玩，走該商品模組自己的演出 */}
              {(product.type === 'ichiban' || product.type === 'custom') && (
                <button
                  onClick={handleTrialPlay}
                  disabled={totalRemaining === 0}
                  className="h-[44px] shrink-0 rounded-xl bg-purple-600 px-3 text-sm font-black text-white shadow-lg shadow-purple-600/30 transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  試試看
                </button>
              )}
            </div>
          </div>
        </div>

        {showResultModal && (
          <PrizeResultModal
            isOpen={showResultModal}
            onClose={() => setShowResultModal(false)}
            isLoading={isLoadingResults}
            results={drawResults.map(r => ({
              grade: r.prize_level,
              name: r.prize_name,
              isOpened: true,
              image_url: r.prize_image_url || '',
              is_last_one: r.is_last_one || r.prize_level.includes('Last One') || r.prize_level.includes('LAST ONE') || r.prize_level.includes('最後賞') || (r.ticket_number === 0),
              ticket_number: r.ticket_number || 0
            }))}
            skipRevealAnimation={true}
          />
        )}

        {product && (
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
        )}

        {(() => {
          const effectiveTheme = (product as any).machine_theme || moduleSettings[product.type];

          /*
           * 自製過場影片：播老闆在後台為這一檔上傳的影片，播完彈中獎結果。
           *
           * 其他模組的過場影片都是寫死的靜態檔（video1／card／blindbox_op.mp4），
           * 每一檔商品長得一模一樣；這款是唯一由 DB 帶網址的。
           * 沒上傳影片就不走這條 —— 落回下面的 GachaBattleEffect 播內建的，
           * 而不是開一個黑畫面。
           */
          const introVideo = (product as any).intro_video_url as string | undefined;
          if (effectiveTheme === 'custom_video' && introVideo) {
            return isGachaOpen ? (
              <div className="fixed inset-0 z-[2100] bg-black pointer-events-auto flex items-center justify-center">
                <div className="relative w-full h-full max-w-[560px] bg-black shadow-2xl">
                  <video
                    src={introVideo}
                    /* 滿版高度、左右裁掉沒關係（老闆 2026-09-02）——
                       過場影片的重點在畫面中央，上下留黑邊比左右被切難看得多。
                       跟抽卡的 card_video 同一個做法 */
                    className="w-full h-full object-cover"
                    autoPlay
                    preload="auto"
                    muted={isVideoMuted}
                    playsInline
                    onEnded={handleBattleEffectComplete}
                    /* 影片壞掉／格式不支援時不能把玩家鎖在黑畫面裡，
                       直接當作播完，該給的獎照樣彈出來 */
                    onError={handleBattleEffectComplete}
                  />
                  <SoundToggle safeTop className="absolute top-4 right-4 z-10" />
                  <button
                    type="button"
                    className="absolute bottom-4 right-4 z-10 px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em]"
                    onClick={handleBattleEffectComplete}
                  >
                    SKIP
                  </button>
                </div>
              </div>
            ) : null;
          }

          /*
           * 自製賞的沉浸撕紙：一番賞那套 FigmaTearScene 原封不動搬過來，逐張撕。
           *
           * 一番賞走的是 TicketSelectionFlow（要先選籤號，撕紙掛在那條流程裡），
           * 自製賞沒有選籤畫面、買完直接開演出，所以撕紙要接在這裡而不是那支元件。
           * 外層那兩層容器（黑底置中＋393:844 letterbox）跟 TicketSelectionFlow
           * 完全一致 —— 撕紙的座標是照 393 寬算的，換一個容器整張券就會歪掉。
           */
          if (effectiveTheme === 'custom_tear' && wonPrizes.length > 0) {
            if (!isGachaOpen) return null;
            const idx = Math.min(customTearIndex, wonPrizes.length - 1);
            const cur = wonPrizes[idx] as Prize & { is_last_one?: boolean };
            const isLastCard = idx >= wonPrizes.length - 1;
            const letter = cur?.is_last_one
              ? 'LAST'
              : String(cur?.grade ?? 'F').replace('賞', '').trim().toUpperCase();
            return (
              <div className="fixed inset-0 z-[3000] bg-black flex items-center justify-center">
                <div
                  className="relative overflow-hidden w-screen md:w-[min(100vw,_calc(100dvh_*_393_/_844))]"
                  style={{ height: '100dvh' }}
                >
                  <FigmaTearScene
                    key={`${customTearSession}-${idx}`}
                    prizeTierLetter={letter}
                    initialDone={false}
                    isLast={isLastCard}
                    onNext={() => setCustomTearIndex(idx + 1)}
                    onOpenAll={handleBattleEffectComplete}
                    onBack={handleBattleEffectComplete}
                  />
                </div>
              </div>
            );
          }

          // custom 型別永遠走 GachaBattleEffect（combo 影片互動），不走 GachaThemeRenderer
          if (product.type !== 'custom' && (effectiveTheme === 'ichiban_grid' || effectiveTheme === 'custom_grid' || effectiveTheme === 'card_pack')) {
            return (
              <GachaThemeRenderer
                theme={effectiveTheme || 'gacha_classic'}
                isOpen={isGachaOpen}
                prizes={wonPrizes}
                isLoading={isGachaLoading}
                onGoToWarehouse={handleGachaComplete}
                onContinue={handleGachaContinue}
              />
            );
          }
          return (
            <GachaBattleEffect
              isOpen={isGachaOpen}
              pullResults={battleResults}
              onComplete={handleBattleEffectComplete}
              productType={product.type}
            />
          );
        })()}

        <GachaResultModal
          isOpen={isPrizeModalOpen}
          onClose={() => {
            setIsPrizeModalOpen(false);
            setWonPrizes([]);
            fetchData();
          }}
          results={wonPrizes}
        />

        {/* 一番賞撕紙完成後的恭喜彈窗（手機/桌機都在這裡顯示） */}
        {tearGachaResults.length > 0 && (
          <GachaResultModal
            isOpen={true}
            onClose={() => {
              setTearGachaResults([]);
              fetchData();
            }}
            results={tearGachaResults}
          />
        )}

        {/* 其他型別統一使用戰鬥演出 */}

        {isTicketModalOpen && (
          <div className="fixed inset-0 z-[2100] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { setIsTicketModalOpen(false); setIsTicketTrial(false); }}
            />
            <div className="relative z-[2101] w-full max-w-[640px] max-h-[90vh] px-4">
              <TicketSelectionFlow
                isModal
                trial={isTicketTrial}
                onClose={() => { setIsTicketModalOpen(false); setIsTicketTrial(false); }}
                onRefreshProduct={fetchData}
                onTearFinish={(results) => {
                  setIsTicketModalOpen(false);
                  setIsTicketTrial(false);
                  setTearGachaResults(results as Prize[]);
                }}
              />
            </div>
          </div>
        )}

        {/* 分享彈窗 */}
        {isShareModalOpen && (
          <div className="fixed inset-0 z-[2200] flex items-end sm:items-center justify-center">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsShareModalOpen(false)}
            />
            <div className="relative z-[2201] w-full max-w-sm mx-4 mb-6 sm:mb-0 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-5 pt-5 pb-2">
                <h3 className="text-[15px] font-bold text-neutral-800 dark:text-white">分享這個商品</h3>
                <p className="text-[12px] text-neutral-400 mt-0.5 truncate">{product?.name}</p>
              </div>
              <div className="grid grid-cols-4 gap-3 px-5 py-4">
                {/* 複製連結 */}
                <button
                  onClick={handleCopyLink}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                    shareCopied
                      ? "bg-accent-emerald/15 dark:bg-accent-emerald/15"
                      : "bg-neutral-100 dark:bg-neutral-800 group-hover:bg-primary/10"
                  )}>
                    {shareCopied
                      ? <svg className="w-5 h-5 text-accent-emerald" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      : <svg className="w-5 h-5 text-neutral-500 dark:text-neutral-300 group-hover:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    }
                  </div>
                  <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{shareCopied ? '已複製' : '複製連結'}</span>
                </button>
                {/* LINE */}
                <a
                  href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(window.location.href)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#06C755] flex items-center justify-center group-hover:opacity-90 transition-opacity">
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
                  </div>
                  <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">LINE</span>
                </a>
                {/* Facebook */}
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#1877F2] flex items-center justify-center group-hover:opacity-90 transition-opacity">
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </div>
                  <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Facebook</span>
                </a>
                {/* X (Twitter) */}
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(product?.name || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-black dark:bg-neutral-700 flex items-center justify-center group-hover:opacity-90 transition-opacity">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.213 5.567zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </div>
                  <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">X</span>
                </a>
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[14px] font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {FAIR_ENGINE_TYPES.includes(product.type) && (
          <ViewerPill productId={product.id} />
        )}
    </div>
  );
}
