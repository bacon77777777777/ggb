'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Image from 'next/image';
import { Loader2, Volume2, VolumeX } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { sanitizeImageUrl } from '@/lib/image-utils';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { ImageButton } from '@/components/ui/ImageButton';
import { GachaCollectionList } from '@/components/shop/GachaCollectionList';
import { GachaResultModal } from '@/components/shop/GachaResultModal';
import { PurchaseConfirmationModal } from '@/components/shop/PurchaseConfirmationModal';
import type { Prize as GachaPrize } from '@/components/GachaMachine';
import { useToast } from '@/components/ui/Toast';

type ProductRow = Database['public']['Tables']['products']['Row'];
type PrizeRow = Database['public']['Tables']['product_prizes']['Row'];

export default function BlindboxDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const [supabase] = useState(() => createClient());
  const { showToast } = useToast();

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
  const bgVideos = useMemo(() => ['/videos/bg.mp4'], []);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const openingVideoRef = useRef<HTMLVideoElement | null>(null);
  // const [isMediaReady, setIsMediaReady] = useState(false);
  const [isEggBoxImageMode, setIsEggBoxImageMode] = useState(false);

  const isSoldOut = !!product && (product.status === 'ended' || product.remaining === 0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sources = [...bgVideos, '/videos/blindbox_op.mp4'];
    let loadedCount = 0;
    const onOneLoaded = () => {
      loadedCount += 1;
      if (loadedCount >= sources.length) {
        // setIsMediaReady(true);
      }
    };

    const videos: HTMLVideoElement[] = sources.map((src) => {
      const video = document.createElement('video');
      video.src = src;
      video.preload = 'auto';
      video.oncanplaythrough = onOneLoaded;
      video.onerror = onOneLoaded;
      video.load();
      return video;
    });

    const timeoutId = window.setTimeout(() => {
      // setIsMediaReady((prev) => prev || loadedCount > 0);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
      videos.forEach((video) => {
        video.oncanplaythrough = null;
        video.onerror = null;
      });
    };
  }, [bgVideos]);

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

        const { data: productData, error: productError } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .neq('status', 'pending')
          .single();

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

        const { data: prizesData, error: prizesError } = await supabase
          .from('product_prizes')
          .select('*')
          .eq('product_id', productId)
          .order('level', { ascending: true });

        if (prizesError) throw prizesError;
        setPrizes(prizesData || []);
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
    const maxWidth = 560;

    const updateScale = () => {
      if (typeof window === 'undefined') return;
      const width = Math.min(window.innerWidth, maxWidth);
      setScale(width / baseWidth);
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

  const enableBackgroundAudio = () => {
    const el = bgVideoRef.current;
    if (!el) return;
    try {
      el.muted = false;
      el.volume = 1;
      el.play().catch(() => undefined);
    } catch {
    }
  };

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
          grade: sample.level || '',
          image_url: sample.image_url || undefined,
          ticket_number: undefined,
          is_last_one: false,
        },
      ]);
    }

    setVideoMode('trial');
    setIsVideoOpen(true);
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
      // Refresh latest remaining before purchasing to avoid stale state
      let latestRemaining = product.remaining ?? 0;
      try {
        const { data: latest } = await supabase
          .from('products')
          .select('remaining, status')
          .eq('id', product.id)
          .single();
        if (latest) {
          latestRemaining = latest.remaining ?? latestRemaining;
          setProduct((prev) => (prev ? { ...prev, ...latest } as ProductRow : prev));
          if (latest.status === 'ended' || latestRemaining <= 0) {
            setIsPurchaseModalOpen(false);
            showToast('商品已完抽', 'info');
            setIsProcessing(false);
            return;
          }
        }
      } catch {
        // ignore refresh failure and proceed with local value
      }

      // Clamp quantity with the refreshed remaining
      const clampedQty = Math.min(Math.max(1, quantity), Math.max(1, latestRemaining));
      if (clampedQty < quantity) {
        showToast(`剩餘數量不足，已調整為 ${clampedQty} 抽`, 'info');
      }

      // const maxByRemaining = typeof product.remaining === 'number' ? product.remaining : 0;
      const { data, error } = await supabase.rpc('play_gacha_locked', {
        p_product_id: product.id,
        p_count: clampedQty,
        p_use_points: options.usePoints,
        p_coupon_id: options.couponId || null
      });

      if (error) throw error;

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
      // Refresh user profile to update points/tokens balance immediately
      if (refreshProfile) {
        refreshProfile();
      }
      setVideoMode('purchase');
      setIsVideoOpen(true);
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

  const handlePrizeClose = async () => {
    setIsPrizeModalOpen(false);
    try {
      if (product?.id) {
        const { data } = await supabase
          .from('products')
          .select('*')
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="flex flex-col items-center gap-4 text-white">
          <Loader2 className="w-12 h-12 animate-spin text-white" />
          <p className="text-white font-bold tracking-widest text-lg animate-pulse">
            資源下載中...
          </p>
        </div>
      </div>
    );
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

  return (
    <div
      className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-32 md:pb-12 pt-14 md:pt-0 overflow-x-hidden"
      style={{
        backgroundImage: "url('/images/gacha/bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#000000',
      }}
    >
      <div className="w-full flex justify-center">
        <div
          className="relative"
          style={{
            width: 375,
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          <div className="bg-neutral-950 shadow-card border border-neutral-900 overflow-hidden">
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

              <div
                className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center px-4 rounded-full hidden md:flex"
                style={{
                  top: 40,
                  height: 24,
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  maxWidth: 320,
                  zIndex: 20,
                  pointerEvents: 'none',
                  opacity: isEggBoxImageMode ? 0 : 1,
                  transition: 'opacity 200ms ease-out',
                }}
              >
                <span
                  className="font-black text-center truncate"
                  style={{
                    color: '#FFFF30',
                    fontSize: 16,
                  }}
                >
                  {product.name}
                </span>
              </div>

              <button
                type="button"
                className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center px-3 rounded-full text-center"
                style={{
                  top: 340,
                  height: 20,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  zIndex: 20,
                }}
                onClick={() => setIsEggBoxImageMode((prev) => !prev)}
              >
                <span
                  className="font-medium"
                  style={{
                    color: '#FFFFFF',
                    fontSize: 12,
                  }}
                >
                  點擊顯示圖片
                </span>
              </button>

              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  top: 42,
                  width: 167,
                  height: 167,
                  zIndex: 20,
                }}
              >
                <div className="relative w-full h-full">
                  <div
                    className="absolute inset-0"
                    style={{
                      opacity: isEggBoxImageMode ? 0 : 1,
                      pointerEvents: 'none',
                      transition: 'opacity 200ms ease-out',
                    }}
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
                        src={sanitizeImageUrl(product.image_url) ?? `/images/item/${product.id.toString().padStart(5, '0')}.jpg`}
                        alt={product.name}
                        width={167}
                        height={167}
                        className="w-full h-full object-cover rounded-2xl border border-white/20 shadow-lg shadow-black/40"
                      />
                    </div>
                  )}
                </div>
              </div>

              <ImageButton
                src="/images/gacha/btn2.png"
                alt="換一盒"
                text="換一盒"
                className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                textClassName="text-base md:text-lg"
                style={{
                  left: '5.33%',
                  top: '84.5%',
                  width: '25.06%',
                  height: '11.2%',
                  zIndex: 20,
                }}
                onClick={handleChangeBox}
              />

              <ImageButton
                src="/images/gacha/btn1.png"
                alt="立即開盒"
                text="立即開盒"
                className="absolute"
                textClassName="text-base md:text-lg"
                style={{
                  left: '31.73%',
                  top: '84.5%',
                  width: '36.53%',
                  height: '11.2%',
                  zIndex: 20,
                }}
                onClick={handlePlay}
              />

              <ImageButton
                src="/images/gacha/btn2.png"
                alt="試試看"
                text="試試看"
                className="absolute"
                textClassName="text-base md:text-lg"
                style={{
                  left: '69.6%',
                  top: '84.5%',
                  width: '25.06%',
                  height: '11.2%',
                  zIndex: 20,
                }}
                onClick={handleTrial}
              />
            </div>

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

          <div className="w-full">
            <GachaCollectionList
              productId={product.id}
              prizes={prizes}
              refreshKey={collectionRefreshKey}
            />
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
              src="/images/gacha_bg.png"
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
              src="/videos/blindbox_op.mp4"
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
                    if (!next) {
                      el.play().catch(() => undefined);
                    }
                  }
                  return next;
                });
              }}
            >
              {isVideoMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
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
        />
      )}
    </div>
  );
}
