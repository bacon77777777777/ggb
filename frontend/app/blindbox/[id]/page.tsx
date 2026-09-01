'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Image from 'next/image';
import { Volume2, VolumeX } from 'lucide-react';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { sanitizeImageUrl } from '@/lib/image-utils';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { ImageButton } from '@/components/ui/ImageButton';
import { GachaCollectionList } from '@/components/shop/GachaCollectionList';
import PinchZoomImage from '@/components/ui/PinchZoomImage';
import { SoundToggle } from '@/components/ui/SoundToggle';
import { isSoundMuted, subscribeSoundMuted } from '@/lib/soundPrefs';
import { GachaResultModal } from '@/components/shop/GachaResultModal';
import ProductBadge from '@/components/ui/ProductBadge';
import { PurchaseConfirmationModal } from '@/components/shop/PurchaseConfirmationModal';
import { BlindboxMachineMode2 } from '@/components/shop/BlindboxMachineMode2';
import { BlindboxMachineMode3 } from '@/components/shop/BlindboxMachineMode3';
import dynamic from 'next/dynamic';
import { BlindboxMachineMode4 } from '@/components/shop/BlindboxMachineMode4';
// three.js + matter.js 只有這台用得到，動態載入避免拖累其他機台的首屏
const BlindboxMachineMode5 = dynamic(
  () => import('@/components/shop/BlindboxMachineMode5').then(m => m.BlindboxMachineMode5),
  { ssr: false },
);
import type { Prize as GachaPrize } from '@/components/GachaMachine';
import { useToast } from '@/components/ui/Toast';
import { PRODUCT_PUBLIC_COLUMNS, PRIZE_PUBLIC_COLUMNS } from '@/lib/productColumns'
import { asset } from '@/lib/asset';
import ViewerPill from '@/components/product/ViewerPill';

type ProductRow = Database['public']['Tables']['products']['Row'];
type PrizeRow = Database['public']['Tables']['product_prizes']['Row'];

/** 貨架販賣機類主題：由機台元件自己演出，不走過場影片 */
const VENDING_THEMES = ['blindbox_mode2', 'blindbox_mode3', 'blindbox_mode4', 'blindbox_mode5'];
const isVendingTheme = (theme: unknown) => VENDING_THEMES.includes(theme as string);

export default function BlindboxDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const [supabase] = useState(() => createClient());
  const { showToast } = useToast();

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  // 全站模組預設：商品沒指定主題時要吃這個（同 item/[id] 的作法）
  const [defaultTheme, setDefaultTheme] = useState<string | null>(null);
  /**
   * 全站預設「查回來了沒」—— 成功或失敗都算查完。
   *
   * 商品沒有自訂主題時，主題要等這一包才知道。舊版在它到之前 `effectiveTheme`
   * 是 null，於是先渲染最後那條影片版、`setIsMachineReady(true)` 又立刻把載入
   * 畫面收掉；設定一到再換成販賣機 —— 玩家會看到閃一下
   *（與轉蛋頁 2026-09-01 修的是同一個毛病）。
   */
  const [defaultThemeLoaded, setDefaultThemeLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMachineReady, setIsMachineReady] = useState(false);
  /** 機台上的商品圖是否展開（預設收起，點膠囊打開，點圖或再點膠囊關） */
  const [isBoxImageMode, setIsBoxImageMode] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [isPrizeModalOpen, setIsPrizeModalOpen] = useState(false);
  const [wonPrizes, setWonPrizes] = useState<
    {
      id: string;
      name: string;
      grade: string;
      image_url?: string;
      ticket_number?: number;
      is_last_one?: boolean;
    }[]
  >([]);
  const [collectionRefreshKey, setCollectionRefreshKey] = useState(0);
  const [videoMode, setVideoMode] = useState<'trial' | 'purchase' | null>(null);
  const [scale, setScale] = useState(1);
  const [bgVariantIndex, setBgVariantIndex] = useState(0);
  // mode2 machine state
  const [mode2State, setMode2State] = useState<'idle' | 'animating'>('idle');
  const [mode2DrawCount, setMode2DrawCount] = useState(0);
  // 立體物理機台的「換一批」：按一次遞增，機台看到變化才動作
  const [restockSignal, setRestockSignal] = useState(0);
  const bgVideos = useMemo(() => [asset('/videos/bg.mp4')], []);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const openingVideoRef = useRef<HTMLVideoElement | null>(null);
  // const [isMediaReady, setIsMediaReady] = useState(false);
  const [isEggBoxImageMode, setIsEggBoxImageMode] = useState(false);

  const isSoldOut = !!product && (product.status === 'ended' || product.remaining === 0);

  /**
   * 開場影片預熱 —— 一定要等機台出現、且瀏覽器閒下來之後才做
   *
   * `blindbox_op.mp4` 有 7 MB，只有玩家真的按下抽獎、那層 overlay mount 之後
   * 才會播。原本這段是在進頁面的第一個 effect 就 `preload='auto'` 硬拉下來，
   * 等於玩家還在等機台顯示的時候，頻寬先被一支他還沒要看的影片吃掉 7 MB
   * —— 那頁量到 8 MB 傳輸量、載入時間忽快忽慢，全是這支影片造成的。
   *
   * 改成掛在 isMachineReady 後面 + requestIdleCallback：機台先出來，影片在
   * 背景慢慢補。玩家從進頁到按下抽獎中間怎麼樣都有好幾秒，來得及。
   *
   * 背景影片 bg.mp4（0.7 MB）不在這裡 —— 它進頁面就要播，由 JSX 自己載。
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !isMachineReady) return;

    let video: HTMLVideoElement | null = null;
    const warm = () => {
      video = document.createElement('video');
      video.src = asset('/videos/blindbox_op.mp4');
      video.preload = 'auto';
      video.load();
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    const handle = ric ? ric(warm, { timeout: 3000 }) : window.setTimeout(warm, 1200);

    return () => {
      if (ric) (window as any).cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
      if (video) { video.removeAttribute('src'); video.load(); }
    };
  }, [isMachineReady]);

  // 實際生效的主題：商品自訂優先，沒設（null / 空字串）才用全站預設
  const effectiveTheme = ((product as any)?.machine_theme || defaultTheme) ?? null;
  /** 主題定了沒。沒定之前不要渲染機台 —— 會先閃一台不對的 */
  const themeResolved = !!(product as any)?.machine_theme || defaultThemeLoaded;

  // 全站模組預設（後台「模組設定」）。商品自己沒設主題時就吃這個 ——
  // 原本本頁只讀 product.machine_theme，導致後台改了全站預設前台完全沒反應。
  useEffect(() => {
    const load = () => {
      supabase
        .from('module_settings')
        .select('product_type, machine_theme')
        .eq('product_type', 'blindbox')
        .maybeSingle()
        .then(({ data }) => {
          if (data) setDefaultTheme((data as any).machine_theme ?? null);
          // 查失敗也要放行，否則整頁會停在載入畫面
          setDefaultThemeLoaded(true);
        });
    };
    load();
    const channel = supabase
      .channel('blindbox_module_settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'module_settings' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  useEffect(() => {
    const el = bgVideoRef.current;
    if (!el) return;
    try {
      el.currentTime = 0;
      el.muted = false;
      el.volume = 1;
      const playPromise = el.play();
      if (playPromise) {
        playPromise.catch(() => {
          el.muted = true;
          el.play().catch(() => undefined);
        });
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const idParam = params.id;
        const productId =
          typeof idParam === 'string' ? parseInt(idParam, 10) : parseInt(Array.isArray(idParam) ? idParam[0] : '', 10);
        if (!productId || Number.isNaN(productId)) {
          setIsLoading(false);
          return;
        }

        // 商品與品項並行查 —— 兩個都只要網址上的 productId，沒有先後依賴。
        // 原本串著跑，白等一趟往返
        const [prodRes, prizesRes] = await Promise.all([
          supabase.from('products').select(PRODUCT_PUBLIC_COLUMNS)
            .eq('id', productId).neq('status', 'pending').single(),
          supabase.from('product_prizes').select(PRIZE_PUBLIC_COLUMNS)
            .eq('product_id', productId).order('level', { ascending: true }),
        ]);

        const { data: productData, error: productError } = prodRes;
        if (productError) throw productError;
        if (!productData) {
          setIsLoading(false);
          return;
        }

        if (productData.type !== 'blindbox') {
          router.replace(`/item/${productId}`);
          return;
        }

        setProduct(productData);

        if (prizesRes.error) throw prizesRes.error;
        setPrizes(prizesRes.data || []);
      } catch (err) {
        console.error('Error loading blindbox product:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [params.id, router, supabase]);

  useEffect(() => {
    const baseWidth = 375;

    const updateScale = () => {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth;
      if (w >= 1024) {
        const colW = Math.floor((Math.min(w, 1280) - 40) * 4 / 12);
        setScale(colW / baseWidth);
      } else {
        setScale(Math.min(w, 560) / baseWidth);
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  const replayBackgroundVideo = () => {
    const el = bgVideoRef.current;
    if (!el) return;
    try {
      el.currentTime = 0;
      el.play().catch(() => undefined);
    } catch {
    }
  };

  // 背景影片預設 muted（瀏覽器 autoplay policy 要求），玩家做出互動後才開聲。
  // 這裡多擋一道靜音偏好，不然按了右上角的靜音鈕、換一批的時候聲音又會回來。
  const enableBackgroundAudio = () => {
    const el = bgVideoRef.current;
    if (!el || isSoundMuted()) return;
    try {
      el.muted = false;
      el.volume = 1;
      el.play().catch(() => undefined);
    } catch {
    }
  };

  // 靜音鈕按下時，正在出聲的背景影片要立刻閉嘴；解除時交還給
  // enableBackgroundAudio（下一次互動才開聲，不在這裡自作主張放出來）
  useEffect(() => subscribeSoundMuted(m => {
    const el = bgVideoRef.current;
    if (el && m) el.muted = true;
  }), []);

  const handlePlay = () => {
    if (!product) return;
    if (isSoldOut) {
      showToast('商品已售完', 'info');
      return;
    }
    setIsPurchaseModalOpen(true);
  };

  const handleChangeBox = () => {
    if (isSoldOut) return;
    enableBackgroundAudio();
    setBgVariantIndex((prev) => (prev + 1) % bgVideos.length);
    replayBackgroundVideo();
  };

  const handleTrial = () => {
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
          grade: sample.level || '',
          image_url: sample.image_url || undefined,
          ticket_number: undefined,
          is_last_one: false,
        },
      ]);
    }

    if (isVendingTheme(effectiveTheme)) {
      setMode2DrawCount(1);
      setMode2State('animating');
    } else {
      setVideoMode('trial');
      setIsVideoOpen(true);
    }
  };

  const handlePurchaseConfirm = async (quantity: number, options: { usePoints: boolean, couponId?: string }) => {
    if (!product || !user) return;

    if (product.status === 'ended' || product.remaining === 0) {
      setIsPurchaseModalOpen(false);
      showToast('商品已完抽', 'info');
      return;
    }

    setIsProcessing(true);
    try {
      // Use local remaining — server validates stock in play_gacha_locked anyway
      const clampedQty = Math.min(Math.max(1, quantity), Math.max(1, product.remaining ?? 1));
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
      const data = (await drawRes.json()).prizes;

      const rawResults = data as unknown as {
        name: string;
        grade: string;
        image_url: string;
        ticket_number?: number;
        is_last_one?: boolean;
      }[];

      let results = rawResults.map((item, index) => ({
        id: item.ticket_number !== undefined ? String(item.ticket_number) : `${product.id}-${index}`,
        name: item.name,
        grade: item.grade,
        image_url: item.image_url,
        ticket_number: item.ticket_number,
        is_last_one: item.is_last_one,
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
      setIsPurchaseModalOpen(false);
      if (refreshProfile) {
        refreshProfile();
      }
      if (isVendingTheme(effectiveTheme)) {
        setMode2DrawCount(results.length);
        setMode2State('animating');
      } else {
        setVideoMode('purchase');
        setIsVideoOpen(true);
      }
    } catch (e: unknown) {
      console.error('Blindbox purchase error:', e);
      let message = '購買失敗，請稍後再試';
      try {
        const err = (e as { code?: string; message?: string }) || {};
        const code = err.code;
        const msg: string | undefined = err.message || (typeof e === 'object' ? JSON.parse(JSON.stringify(e as object))?.message : undefined);
        if (code === 'P0001' || (typeof msg === 'string' && /not enough stock|no prizes left/i.test(msg))) {
          message = '剩餘數量不足或已完抽，請刷新後重試';
        }
      } catch {}
      showToast(message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMode2AnimComplete = () => {
    // Keep mode2State as 'animating' while prize popup is open.
    // setMode2State('idle') is called in handlePrizeClose so the shelf resets only after popup closes.
    if (wonPrizes.length > 0) {
      setIsPrizeModalOpen(true);
      setCollectionRefreshKey((prev) => prev + 1);
    } else {
      setMode2State('idle');
    }
  };

  const handleVideoEnd = () => {
    setIsVideoOpen(false);

    if (wonPrizes.length > 0 && videoMode !== null) {
      setIsPrizeModalOpen(true);
      setCollectionRefreshKey((prev) => prev + 1);
    }

    setVideoMode(null);
    setIsVideoMuted(false);
  };

  const handleVideoError = () => {
    setIsVideoOpen(false);

    if (wonPrizes.length > 0 && videoMode !== null) {
      setIsPrizeModalOpen(true);
      setCollectionRefreshKey((prev) => prev + 1);
    }

    setVideoMode(null);
    setIsVideoMuted(false);
  };

  useEffect(() => {
    if (!isVideoOpen) return;
    const el = openingVideoRef.current;
    if (!el) return;
    try {
      el.currentTime = 0;
      el.play().catch(() => undefined);
    } catch {
    }
  }, [isVideoOpen, videoMode]);

  /* 非販賣機主題沒有 onLoaded 可以等，直接放行 ——
     但**要等主題定了**才算數，否則會拿還沒查到設定時的 null 當「非販賣機」 */
  useEffect(() => {
    if (!isLoading && product && themeResolved) {
      if (!isVendingTheme(effectiveTheme)) {
        setIsMachineReady(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, product, themeResolved, effectiveTheme]);

  /* 設定查太久也要放行（離線、RLS 擋住、Supabase 慢），
     不然商品頁會永遠停在載入動畫 */
  useEffect(() => {
    const t = setTimeout(() => setDefaultThemeLoaded(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isLoading && !isMachineReady) {
      const t = setTimeout(() => setIsMachineReady(true), 3000);
      return () => clearTimeout(t);
    }
  }, [isLoading, isMachineReady]);

  const handlePrizeClose = async () => {
    setIsPrizeModalOpen(false);
    setMode2State('idle');  // resets shelf to full in mode2
    try {
      if (product?.id) {
        const { data } = await supabase
          .from('products')
          .select(PRODUCT_PUBLIC_COLUMNS)
          .eq('id', product.id)
          .single();
        if (data) setProduct(data as ProductRow);
      }
    } catch {}
    replayBackgroundVideo();
  };

  const blindboxResults: GachaPrize[] = wonPrizes.map(p => ({
    id: p.id,
    name: p.name,
    rarity: p.grade,
    image_url: p.image_url,
    grade: p.grade,
    is_last_one: p.is_last_one,
  }));

  if (isLoading) {
    return <ProductLoadingScreen />;
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="text-center space-y-3">
          <p className="text-sm font-black text-neutral-400 uppercase tracking-widest">找不到此盒玩商品</p>
          <Button onClick={() => router.push('/')} size="sm">
            返回商店
          </Button>
        </div>
      </div>
    );
  }

  const renderMachineInner = () => (
    <div
      className="relative"
      style={{ width: 375, transform: `scale(${scale})`, transformOrigin: 'top center' }}
    >
      {/* 主題沒定就先不要掛任何一台 —— 掛錯的那一台不只會閃，
          它載完圖還會觸發 onLoaded 把載入畫面收掉 */}
      <div className="bg-neutral-950 shadow-card border border-neutral-900 overflow-hidden">
        {!themeResolved ? (
          <div className="relative w-full" style={{ aspectRatio: '750/932' }} />
        ) : effectiveTheme === 'blindbox_mode2' ? (
          <div className="relative w-full" style={{ aspectRatio: '750/932' }}>
            <BlindboxMachineMode2
              machineState={mode2State}
              drawCount={mode2DrawCount}
              boxImageUrl={(product as any).box_image_url ?? undefined}
              remaining={product.remaining ?? 10}
              onAnimationComplete={handleMode2AnimComplete}
              onPush={() => {}}
              onPurchase={handlePlay}
              onTrial={handleTrial}
              isSoldOut={isSoldOut}
              onLoaded={() => setIsMachineReady(true)}
            />
          </div>
        ) : effectiveTheme === 'blindbox_mode3' ? (
          <div className="relative w-full" style={{ aspectRatio: '750/932' }}>
            <BlindboxMachineMode3
              machineState={mode2State}
              drawCount={mode2DrawCount}
              boxImageUrl={(product as any).box_image_url ?? undefined}
              remaining={product.remaining ?? 10}
              onAnimationComplete={handleMode2AnimComplete}
              onPush={() => {}}
              onPurchase={handlePlay}
              onTrial={handleTrial}
              isSoldOut={isSoldOut}
              onLoaded={() => setIsMachineReady(true)}
            />
          </div>
        ) : effectiveTheme === 'blindbox_mode5' ? (
          <div className="relative w-full" style={{ aspectRatio: '750/932' }}>
            <BlindboxMachineMode5
              machineState={mode2State}
              drawCount={mode2DrawCount}
              restockSignal={restockSignal}
              boxImageUrl={(product as any).box_image_url ?? undefined}
              remaining={product.remaining ?? 10}
              onAnimationComplete={handleMode2AnimComplete}
              onPush={() => {}}
              onPurchase={handlePlay}
              onTrial={handleTrial}
              isSoldOut={isSoldOut}
              onLoaded={() => setIsMachineReady(true)}
            />

            {/* 商品圖：疊在層板上方（機台的展示區），照抽卡頁的做法 ——
                膠囊切換、點圖也能關。座標是 375 寬的機台框，不是 750 原圖 */}
            {product.id && (
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  top: 112, width: 232, height: 190, zIndex: 20,
                  opacity: isBoxImageMode ? 1 : 0,
                  pointerEvents: isBoxImageMode ? 'auto' : 'none',
                  transition: 'opacity 200ms ease-out',
                }}
              >
                {/* 雙指可放大／拖移看細節，放開彈回；單指點一下才收起 */}
                <PinchZoomImage
                  src={product.image_url || asset(`/images/item/${product.id.toString().padStart(5, '0')}.jpg`)}
                  alt={product.name}
                  className="h-full w-full"
                  onTap={() => setIsBoxImageMode(false)}
                />
              </div>
            )}

            <button
              type="button"
              className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center px-3 rounded-full text-center"
              style={{ top: 300, height: 20, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 21 }}
              onClick={() => setIsBoxImageMode(v => !v)}
            >
              <span className="font-medium" style={{ color: '#FFFFFF', fontSize: 12 }}>
                點擊顯示圖片
              </span>
            </button>
          </div>
        ) : effectiveTheme === 'blindbox_mode4' ? (
          <div className="relative w-full" style={{ aspectRatio: '750/932' }}>
            <BlindboxMachineMode4
              machineState={mode2State}
              drawCount={mode2DrawCount}
              boxImageUrl={(product as any).box_image_url ?? undefined}
              remaining={product.remaining ?? 10}
              onAnimationComplete={handleMode2AnimComplete}
              onPush={() => {}}
              onPurchase={handlePlay}
              onTrial={handleTrial}
              isSoldOut={isSoldOut}
              onLoaded={() => setIsMachineReady(true)}
            />
          </div>
        ) : (
          <div className="relative w-full" style={{ aspectRatio: '750/932' }}>
            <video
              ref={bgVideoRef}
              src={bgVideos[bgVariantIndex]}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              preload="auto"
              muted
              playsInline
            />

            <button
              type="button"
              className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center px-3 rounded-full text-center"
              style={{ top: 340, height: 20, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 20 }}
              onClick={() => setIsEggBoxImageMode((prev) => !prev)}
            >
              <span className="font-medium" style={{ color: '#FFFFFF', fontSize: 12 }}>
                點擊顯示圖片
              </span>
            </button>

            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{ top: 42, width: 167, height: 167, zIndex: 20 }}
            >
              {product.id && (
                <div
                  className="absolute inset-0 flex items-center justify-center cursor-pointer"
                  style={{
                    opacity: isEggBoxImageMode ? 1 : 0,
                    pointerEvents: isEggBoxImageMode ? 'auto' : 'none',
                    transition: 'opacity 200ms ease-out',
                  }}
                >
                  <PinchZoomImage
                    src={sanitizeImageUrl(product.image_url) ?? asset(`/images/item/${product.id.toString().padStart(5, '0')}.jpg`)}
                    alt={product.name}
                    className="w-full h-full rounded-2xl border border-white/20"
                    onTap={() => setIsEggBoxImageMode(false)}
                  />
                </div>
              )}
            </div>

            <ImageButton
              src={asset("/images/gacha/btn2.webp")}
              alt="換一盒"
              text="換一盒"
              className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
              textClassName="text-base md:text-lg"
              style={{ left: '5.33%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
              onClick={handleChangeBox}
            />
            <ImageButton
              src={asset("/images/gacha/btn1.webp")}
              alt="立即開盒"
              text="立即開盒"
              className="absolute"
              textClassName="text-base md:text-lg"
              style={{ left: '31.73%', top: '84.5%', width: '36.53%', height: '11.2%', zIndex: 20 }}
              onClick={handlePlay}
            />
            <ImageButton
              src={asset("/images/gacha/btn2.webp")}
              alt="試試看"
              text="試試看"
              className="absolute"
              textClassName="text-base md:text-lg"
              style={{ left: '69.6%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
              onClick={handleTrial}
            />

            {isSoldOut && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
                style={{ bottom: '0%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10 }}
              >
                <div className="mt-16 inline-flex h-8 items-center px-4 rounded-full bg-black/90 shadow-lg">
                  <span className="text-[14px] font-black tracking-widest text-yellow-300">
                    該商品已完抽
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* 立體物理機台的底部操作欄 —— 版型與配色照一番賞（老闆指定）：
          左側金額，右側三顆；立即開盒用一番賞同款亮紅，另兩顆換色區隔 */}
      {isMachineReady && effectiveTheme === 'blindbox_mode5' && (
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
                onClick={() => { if (!isSoldOut && mode2State === 'idle') setRestockSignal(n => n + 1); }}
                disabled={isSoldOut || mode2State !== 'idle'}
                className="h-[44px] shrink-0 rounded-xl bg-neutral-200 px-3 text-sm font-black text-neutral-700 transition-colors hover:bg-neutral-300 disabled:opacity-50"
              >
                換一批
              </button>
              <button
                onClick={handlePlay}
                disabled={isSoldOut || mode2State !== 'idle'}
                className="h-full flex-1 whitespace-nowrap rounded-xl bg-accent-red text-base font-black text-white shadow-lg shadow-accent-red/30 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                立即開盒
              </button>
              <button
                onClick={handleTrial}
                disabled={isSoldOut || mode2State !== 'idle'}
                className="h-[44px] shrink-0 rounded-xl bg-purple-600 px-3 text-sm font-black text-white shadow-lg shadow-purple-600/30 transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                試試看
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主題還沒定就一起擋著：先渲染的會是錯的那一台，而它載完圖又會把
          載入畫面收掉 —— 光藏內容沒有用（見 themeResolved 的說明） */}
      {!(isMachineReady && themeResolved) && <ProductLoadingScreen />}
      <div
        className="min-h-screen bg-neutral-50 dark:bg-neutral-950"
        style={!(isMachineReady && themeResolved) ? { visibility: 'hidden', position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' } : undefined}
      >
        {/* Mobile < 1024px */}
        <div className="block lg:hidden overflow-x-hidden pb-32 pt-[calc(3.5rem+env(safe-area-inset-top))]">
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
            <GachaCollectionList
              productId={product.id}
              product={product as any}
              prizes={prizes}
              refreshKey={collectionRefreshKey}
            />
          </div>
        </div>

        {/* Desktop ≥ 1024px */}
        <div className="hidden lg:block pb-12">
          <div className="max-w-7xl mx-auto px-2 pt-20 pb-6">
            <div className="grid grid-cols-12 gap-6 items-start">
              <div className="col-span-4 sticky top-20">
                <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                  <div
                    className="relative w-full overflow-hidden flex justify-center"
                    style={{ height: Math.round(scale * 375 * 932 / 750) }}
                  >
                    {renderMachineInner()}
                    <SoundToggle className="absolute top-3 right-3 z-30" />
                  </div>
                  <div className="p-5 space-y-3">
                    <h1 className="text-lg font-black text-neutral-900 dark:text-neutral-50 leading-tight tracking-tight break-all">
                      <span className="inline-block align-middle mr-2">
                        <ProductBadge type="blindbox" className="h-5 px-1.5 text-[10px]" />
                      </span>
                      <span className="align-middle">{product.name}</span>
                    </h1>
                    <div className="flex items-end justify-between gap-2 pb-4 border-b border-neutral-50 dark:border-neutral-800">
                      <div className="flex items-baseline gap-2">
                        <Image src={asset("/images/gcoin.webp")} alt="G Coin" width={20} height={20} className="w-5 h-5 object-contain" />
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
              <div className="col-span-8">
                <GachaCollectionList
                  productId={product.id}
                  product={product as any}
                  prizes={prizes}
                  refreshKey={collectionRefreshKey}
                />
              </div>
            </div>
          </div>
        </div>

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

        {isVideoOpen && (
          <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/90 pointer-events-auto">
            <div className="absolute inset-0 -z-10">
              <Image
                src={asset("/images/gacha_bg.webp")}
                alt=""
                fill
                className="object-cover filter brightness-[0.3] blur-[10px]"
                unoptimized
              />
              <div className="absolute inset-0 bg-black/40" />
            </div>
            <div className="relative w-full max-w-[560px] h-full overflow-hidden shadow-2xl ring-1 ring-white/10 flex flex-col items-center justify-center bg-black">
              <video
                ref={openingVideoRef}
                src={asset("/videos/blindbox_op.mp4")}
                className="w-full h-full object-cover"
                preload="auto"
                muted={isVideoMuted}
                playsInline
                onEnded={handleVideoEnd}
                onError={handleVideoError}
              />
              <button
                type="button"
                className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-black/60 border border-white/30 flex items-center justify-center text-white"
                onClick={() => {
                  setIsVideoMuted((prev) => {
                    const next = !prev;
                    const el = openingVideoRef.current;
                    if (el) {
                      el.muted = next;
                      if (!next) el.play().catch(() => undefined);
                    }
                    return next;
                  });
                }}
              >
                {isVideoMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <button
                type="button"
                className="absolute bottom-4 right-4 z-10 px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em]"
                onClick={handleVideoEnd}
              >
                SKIP
              </button>
            </div>
          </div>
        )}

        {isPrizeModalOpen && (
          <GachaResultModal
            isOpen={isPrizeModalOpen}
            onClose={handlePrizeClose}
            results={blindboxResults}
            hideTicketNumber
          />
        )}

        {/* 「N 人正在看」（老闆 2026-08-31：轉蛋與盒玩也要）。
            只有 blindbox_mode5 有底部操作欄，其他主題的按鈕畫在機台上，
            那時膠囊會自己改貼畫面底 */}
        {product && (
          <ViewerPill productId={product.id} />
        )}
      </div>
    </>
  );
}
