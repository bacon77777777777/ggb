'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Share2, Heart, ShieldCheck, Info, Trophy, FileCheck, AlertTriangle, Loader2, Volume2, VolumeX, Check } from 'lucide-react';
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
import { TicketSelectionFlow } from '@/components/shop/TicketSelectionFlow';
import { GachaBattleEffect, CardItem as BattleCardItem } from '@/components/card/GachaBattleEffect';
import CardDrawAnimation from '@/components/card/CardDrawAnimation';
import CardFlipDirect from '@/components/card/CardFlipDirect';
import { ProductPackViewer3D } from '@/components/card/ProductPackViewer3D';
import { ImageButton } from '@/components/ui/ImageButton';
import { useAlert } from '@/components/ui/AlertDialog';
import { GachaProductDetail } from '@/components/shop/GachaProductDetail';
import { GachaResultModal } from '@/components/shop/GachaResultModal';
import { MissionService } from '@/services/mission';

function getRandomPackStyles(): string[] {
  return Array.from({ length: 9 }, () =>
    String(Math.floor(Math.random() * 5) + 1).padStart(2, '0')
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
                <div className="relative">
                  <ProductPackViewer3D
                    packImage={`/images/card/pack/${packStyles[index] ?? '01'}a.png`}
                    backImage={`/images/card/pack/${packStyles[index] ?? '01'}b.png`}
                    interactive={isActive}
                    showSSRGlare={false}
                  />
                  {!isCenter && (
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        WebkitMaskImage: "url('/images/card/mask.svg')",
                        maskImage: "url('/images/card/mask.svg')",
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
  const { showToast } = useToast();
  const { showAlert } = useAlert();
  const [supabase] = useState(() => createClient());

  const [product, setProduct] = useState<Database['public']['Tables']['products']['Row'] | null>(null);
  const [prizes, setPrizes] = useState<Database['public']['Tables']['product_prizes']['Row'][]>([]);
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [moduleSettings, setModuleSettings] = useState<Record<string, MachineTheme>>({});

  const [isFollowed, setIsFollowed] = useState(false);
  const [isGachaLoading, setIsGachaLoading] = useState(false);
  const [viewingPrize, setViewingPrize] = useState<{ name: string; image_url?: string; level: string; total: number; remaining: number } | null>(null);
  const [recommendations, setRecommendations] = useState<Database['public']['Tables']['products']['Row'][]>([]);
  
  // Purchase Flow State
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isGachaOpen, setIsGachaOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wonPrizes, setWonPrizes] = useState<Prize[]>([]);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
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
  const packCarouselRef = useRef<PackSelectionCarouselHandle | null>(null);
  const firstPackStyles = useRef<string[]>(getRandomPackStyles());
  const [packStyles, setPackStyles] = useState<string[]>(firstPackStyles.current);
  const [activePackStyle, setActivePackStyle] = useState<string>(firstPackStyles.current[0]);
  const handleActiveStyleChange = useCallback((styleId: string) => {
    setActivePackStyle(styleId);
  }, []);
  const openingVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const [isPrizeModalOpen, setIsPrizeModalOpen] = useState(false);
  const [tearGachaResults, setTearGachaResults] = useState<Prize[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const openingVideoSrc = product?.type === 'card' ? '/videos/card.mp4' : '/videos/blindbox_op.mp4';

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
          supabase.rpc('track_hot_tags_product_view', { p_product_id: productId }).then(
            () => undefined,
            () => undefined
          );
          // Behavioral event tracking for personalization
          import('@/lib/trackEvent').then(({ trackEvent }) => {
            trackEvent('product_view', {
              productId,
              series: (product as any)?.series ?? undefined,
            });
          });
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
    const maxWidth = 560;

    const updateScale = () => {
      if (typeof window === 'undefined') return;
      const width = Math.min(window.innerWidth, maxWidth);
      setCardScale(width / baseWidth);
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
    if (!user || !product) {
      router.push('/login');
      return;
    }

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
      const { data, error } = await supabase
        .from('draw_records')
        .select('ticket_number, prize_level, prize_name, prize_image_url, is_last_one')
        .eq('product_id', product.id)
        .order('ticket_number', { ascending: true });

      if (error) throw error;
      
      let rows = data || [];
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

  const handleDrawClick = () => {
    if (product?.type === 'ichiban') {
      if (!user) {
        router.push('/login');
        return;
      }
      if (isMobile) {
        router.push(`/item/${params.id}/select`);
      } else {
        setIsTicketModalOpen(true);
      }
      return;
    }

    console.log('[GA] event: begin_checkout', { items: [{ item_id: product?.id, item_name: product?.name }] });
    setIsPurchaseModalOpen(true);
  };

  const handleChangePack = () => {
    const newStyles = getRandomPackStyles();
    const currentIdx = packCarouselRef.current?.getActiveIndex() ?? 0;
    setPackStyles(newStyles);
    setActivePackStyle(newStyles[currentIdx]);
  };

  const handleTrialCard = () => {
    if (!product) return;

    trackEvent('draw_trial', { productId: product.id });

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

    const best = prizes.length > 0
      ? prizes.reduce((acc, cur) => {
          const accScore = scoreLevel(acc.level || '')
          const curScore = scoreLevel(cur.level || '')
          if (curScore !== accScore) return curScore > accScore ? cur : acc
          if (cur.image_url && !acc.image_url) return cur
          return acc
        }, prizes[0])
      : null

    const rarity: Prize['rarity'] = String(best?.level || 'SSR')
    const trialPrize: Prize = {
      id: `trial-${best?.id ?? rarity}`,
      name: String(best?.name || rarity),
      rarity,
      image_url: best?.image_url || '/images/card/00001.png',
      grade: rarity,
      is_last_one: false,
    }

    setWonPrizes([trialPrize]);
    setIsVideoMuted(false);
    setIsVideoOpen(true);
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
      setIsGachaOpen(true);
    }

    try {
      console.log('[GA] event: purchase_attempt', { item_id: product.id, quantity });

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
      const data = (await drawRes.json()).prizes;

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
        setIsVideoMuted(false);
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
      
      console.log('[GA] event: purchase_error', { error: errorMessage });
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
    setIsVideoMuted(false);
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
    setIsVideoMuted(false);
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

        let cardFrontImage = '/images/card/00004.png';
        if (rarity === 'SSR') cardFrontImage = '/images/card/00001.png';
        else if (rarity === 'SR') cardFrontImage = '/images/card/00002.png';
        else if (rarity === 'R') cardFrontImage = '/images/card/00003.png';

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

      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .neq('status', 'pending')
        .single();
      
      if (productError) throw productError;

      if (productData?.type === 'blindbox') {
        router.replace(`/blindbox/${productId}`);
        return;
      }

      setProduct(productData);

      if (productData?.supplier_id) {
        const { data: supData } = await supabase
          .from('suppliers')
          .select('name')
          .eq('id', productData.supplier_id)
          .single();
        setSupplierName(supData?.name ?? null);
      } else {
        setSupplierName(null);
      }

      const { data: prizesData, error: prizesError } = await supabase
        .from('product_prizes')
        .select('*')
        .eq('product_id', productId)
        .order('level', { ascending: true });
      
      if (prizesError) throw prizesError;
      setPrizes(prizesData || []);

      const { data: recData } = await supabase
        .from('products')
        .select('*')
        .neq('id', productId)
        .eq('status', 'active')
        .limit(4);
      
      if (recData) setRecommendations(recData);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [params.id, router, supabase, setProduct, setPrizes, setRecommendations, setIsLoading]);

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

  useEffect(() => {
    const loadModuleSettings = () => {
      supabase.from('module_settings').select('product_type, machine_theme').then(({ data }) => {
        if (!data) return;
        const map: Record<string, MachineTheme> = {};
        for (const row of data) map[row.product_type] = row.machine_theme as MachineTheme;
        setModuleSettings(map);
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

    console.log('Setting up realtime subscription for product:', productId);

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
                  <span className="flex items-center gap-2">
                    <span className="bg-accent-red text-white text-[10px] px-1.5 py-0.5 rounded font-black">{newPrize.level}賞</span>
                    <span>被抽走了！剩餘 {newPrize.remaining} 個</span>
                  </span>,
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        {/* Remove duplicated loading indicator */}
        <div className="flex flex-col items-center gap-3 text-neutral-500 dark:text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs font-black tracking-widest">載入商品中...</span>
        </div>
      </div>
    );
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

  const totalItems =
    typeof product.total_count === 'number'
      ? product.total_count
      : (prizes.length > 0
          ? validPrizes.reduce((acc, prize) => acc + (prize.total || 0), 0)
          : 0);

  const fairnessHref = `/fairness/${product.id}`;
  const isSoldOut =
    (typeof totalRemaining === 'number' && totalRemaining <= 0) || product.status === 'ended';

  const handleGoToFairness = () => {
    if (!isAuthenticated) {
      showAlert({
        title: '提示',
        message: '請先登入會員',
        type: 'info',
        confirmText: '前往登入',
        onConfirm: () => router.push(`/login?redirect=${encodeURIComponent(fairnessHref)}`),
      });
      return;
    }
    router.push(fairnessHref);
  };

  if (product.type === 'gacha') {
    const gachaMachineTheme = (product as any).machine_theme || moduleSettings['gacha'] || 'gacha_classic'
    return <GachaProductDetail product={product} prizes={prizes} machineTheme={gachaMachineTheme} />;
  }

  // Handle back button click
  // const handleBackClick = () => {
  //   // Always redirect to home page
  //   router.push('/');
  // };

  if (product.type === 'card') {
    const baseCardWidth = 375
    const baseCardHeight = baseCardWidth * (932 / 750)
    const scaleSpacerHeight = Math.max(0, (cardScale - 1) * baseCardHeight)

    return (
      <div
        className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-32 md:pb-12 pt-14 md:pt-0 overflow-x-hidden"
        style={{
          backgroundImage: isMobile ? undefined : "url('/images/card/pcbg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="w-full flex justify-center">
          <div
            className="relative overflow-hidden"
            style={{
              width: 375,
              transform: `scale(${cardScale})`,
              transformOrigin: 'top center',
            }}
          >
            <div>
              <div
                className="relative w-full"
                style={{
                  aspectRatio: '750/932',
                  backgroundImage: "url('/images/card/bg.png')",
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
              >
              {!isCardImageMode && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center justify-center px-4 rounded-full"
                  style={{
                    top: 40,
                    height: 24,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    maxWidth: 320,
                    zIndex: 20,
                    pointerEvents: 'none',
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
              )}

                <button
                  type="button"
                  className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center px-3 rounded-full text-center"
                  style={{
                    top: 340,
                    height: 20,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    zIndex: 20,
                  }}
                  onClick={() => setIsCardImageMode(prev => !prev)}
                >
                  <span
                    className="font-medium"
                    style={{
                      color: '#FFFFFF',
                      fontSize: 12,
                    }}
                  >
                    點擊卡包顯示圖片
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
                        opacity: isCardImageMode ? 0 : 1,
                        pointerEvents: 'none',
                        transition: 'opacity 200ms ease-out',
                      }}
                    />
                    {product.id && (
                      <div
                        className="absolute inset-0 flex items-center justify-center cursor-pointer"
                        style={{
                          opacity: isCardImageMode ? 1 : 0,
                          pointerEvents: isCardImageMode ? 'auto' : 'none',
                          transition: 'opacity 200ms ease-out',
                        }}
                        onClick={() => setIsCardImageMode(false)}
                      >
                        <Image
                          src={product.image_url || `/images/item/${product.id.toString().padStart(5, '0')}.jpg`}
                          alt={product.name}
                          width={167}
                          height={167}
                          className="w-full h-full object-cover rounded-2xl border border-white/20 shadow-lg shadow-black/40"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
                  style={{
                    width: 375,
                    zIndex: 10,
                  }}
                >
                  <div
                    className="relative w-full flex items-center justify-center"
                    style={{ bottom: isMobile ? '40px' : '35px' }}
                  >
                    <PackSelectionCarousel
                      cardScale={cardScale}
                      ref={packCarouselRef}
                      packStyles={packStyles}
                      onActiveStyleChange={handleActiveStyleChange}
                    />
                  </div>
                </div>

                <ImageButton
                  src="/images/gacha/btn2.png"
                  alt="換一批"
                  text="換一批"
                  className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                  textClassName="text-base md:text-lg"
                  style={{
                    left: '5.33%',
                    top: '84.5%',
                    width: '25.06%',
                    height: '11.2%',
                    zIndex: 20,
                  }}
                  onClick={handleChangePack}
                />

                <ImageButton
                  src="/images/gacha/btn1.png"
                  alt="立即開包"
                  text={isSoldOut ? '查看結果' : '立即開包'}
                  className="absolute"
                  textClassName="text-base md:text-lg"
                  style={{
                    left: '31.73%',
                    top: '84.5%',
                    width: '36.53%',
                    height: '11.2%',
                    zIndex: 20,
                  }}
                  onClick={isSoldOut ? handleShowResults : handleDrawClick}
                />

                <ImageButton
                  src="/images/gacha/btn2.png"
                  alt="試試看"
                  text="試試看"
                  className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                  textClassName="text-base md:text-lg"
                  style={{
                    left: '69.6%',
                    top: '84.5%',
                    width: '25.06%',
                    height: '11.2%',
                    zIndex: 20,
                  }}
                  onClick={isSoldOut ? undefined : handleTrialCard}
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
            </div>
          </div>
        </div>

        {scaleSpacerHeight > 0 && (
          <div
            aria-hidden="true"
            style={{
              height: Math.ceil(scaleSpacerHeight),
            }}
          />
        )}

        <div className="max-w-7xl mx-auto px-2 py-2 sm:py-6">
          <div className="space-y-2 sm:space-y-5">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="p-2 sm:p-4 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30">
                <h2 className="text-sm sm:text-lg font-black text-neutral-900 dark:text-neutral-50 tracking-tight uppercase tracking-wider">店家配率表</h2>
              </div>
              
              <div className="overflow-x-auto relative custom-scrollbar">
                <table className="w-full min-w-[480px] text-left">
                  <thead className="bg-neutral-50/50 dark:bg-neutral-800/50 text-[13px] sm:text-sm font-black text-neutral-400 dark:text-neutral-500 border-b border-neutral-50 dark:border-neutral-800">
                    <tr>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 uppercase tracking-widest">獎項名稱</th>
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
                    {prizes.filter(p => p.level !== 'Last One' && p.level !== 'LAST ONE' && !p.level.includes('最後賞')).map((prize, index) => (
                      <tr 
                        key={index} 
                        className={cn(
                          "hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors group cursor-pointer",
                          prize.remaining === 0 && "opacity-50"
                        )}
                        onClick={() => setViewingPrize({
                          name: prize.name,
                          image_url: prize.image_url || undefined,
                          level: prize.level,
                          total: prize.total,
                          remaining: prize.remaining
                        })}
                      >
                        <td className="px-2 sm:px-6 py-2 sm:py-3.5">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <span className="text-[13px] text-primary font-black uppercase tracking-widest bg-primary/5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg border border-primary/10 whitespace-nowrap">
                              {prize.level}
                            </span>
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
                      : '/images/item.png';
                  
                  return (
                    <button
                      type="button"
                      className="w-full text-left bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-neutral-900 dark:text-neutral-100 shadow-xl relative overflow-hidden group border border-yellow-200/60 dark:border-yellow-700/40"
                      onClick={() =>
                        setViewingPrize({
                          name: lastOnePrize.name,
                          image_url: lastOnePrize.image_url || undefined,
                          level: lastOnePrize.level,
                          total: lastOnePrize.total,
                          remaining: lastOnePrize.remaining,
                        })
                      }
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

            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 sm:p-6 space-y-3 sm:space-y-6">
              <div className="flex items-center gap-3 sm:gap-4 border-b border-neutral-50 dark:border-neutral-800 pb-3 sm:pb-5">
                <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-accent-emerald/10 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 sm:w-7 sm:h-7 text-accent-emerald stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-base sm:text-xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">公平性驗證</h2>
                  <p className="text-[13px] sm:text-sm text-neutral-400 dark:text-neutral-500 font-black uppercase tracking-widest mt-0.5">確保抽獎過程的透明與公正</p>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/10 rounded-2xl p-3 sm:p-5 space-y-3 sm:space-y-4">
                <div className="flex items-center gap-2 text-primary font-black text-[13px] sm:text-sm uppercase tracking-widest">
                  <Info className="w-3.5 h-3.5 stroke-[3]" />
                  公平性驗證機制
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <p className="text-[13px] sm:text-sm text-neutral-500 dark:text-neutral-400 font-bold leading-relaxed">
                    每次抽獎會記錄隨機種子 Seed、籤號與對應的 TXID Hash。完抽後會公開 Seed，任何人都可以在公平性驗證頁輸入 Seed 與籤號，重算隨機值與 TXID Hash 來確認結果無法事後被修改。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5 pt-1 sm:pt-2">
                <div className="space-y-1.5 sm:space-y-2.5">
                  <div className="text-[13px] sm:text-sm font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5" /> 隨機種子 (TXID)
                  </div>
                  <CopyableTruncatedField
                    value={(totalRemaining === 0 && product.seed) ? (product.seed as string) : ''}
                    placeholder="完抽後公布"
                    fieldClassName={cn(
                      (totalRemaining === 0 && product.seed) ? '' : 'text-neutral-400 dark:text-neutral-500 tracking-widest'
                    )}
                  />
                </div>

                <div className="space-y-1.5 sm:space-y-2.5">
                  <div className="text-[13px] sm:text-sm font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                    <FileCheck className="w-3.5 h-3.5" /> 哈希值 (TXID Hash)
                  </div>
                  <CopyableTruncatedField
                    value={product.txid_hash || ''}
                    placeholder="尚未生成，請稍後再試"
                  />
                </div>
              </div>

              {isSoldOut && (
                <button
                  type="button"
                  onClick={handleGoToFairness}
                  className="w-full flex items-center justify-center px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-primary text-white text-[13px] sm:text-sm font-black shadow-sm hover:bg-primary/90 transition-colors"
                >
                  前往公平性驗證頁
                </button>
              )}
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 sm:p-6 space-y-3 sm:space-y-6">
              <h3 className="font-black text-neutral-900 dark:text-neutral-50 text-base sm:text-xl tracking-tight border-b border-neutral-50 dark:border-neutral-800 pb-3 sm:pb-5">商品資訊</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 sm:gap-y-5 gap-x-12">
                {[
                  { label: '類別', value: ({ ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋', card: '抽卡', custom: '自製賞' } as Record<string, string>)[product.type] || product.type },
                  { label: '廠商', value: supplierName || '-' },
                  { label: '代理商', value: product.distributor || '-' },
                  { label: '條碼', value: (product as any).barcode || '-' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center text-sm py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
                    <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px] sm:text-[13px]">{label}</span>
                    <span className="text-neutral-900 dark:text-neutral-50 font-black">{value}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 sm:pt-6 mt-3 sm:mt-6 border-t border-neutral-50 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/50 -mx-3 sm:-mx-6 px-3 sm:px-6 pb-3 sm:pb-6 rounded-b-[24px] sm:rounded-b-[32px]">
                <h4 className="text-[13px] sm:text-[13px] font-black text-neutral-900 dark:text-neutral-50 mb-2 sm:mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-yellow fill-current" />
                  抽獎注意事項
                </h4>
                <ul className="text-[13px] sm:text-sm text-neutral-500 dark:text-neutral-400 space-y-2 sm:space-y-3.5 font-bold">
                  <li className="flex gap-2 sm:gap-3">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-accent-red mt-1.5 shrink-0" />
                    <span>每抽價格為 <div className="inline-flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-accent-yellow shadow-sm mx-0.5 sm:mx-1"><Image src="/images/gcoin.png" alt="G" width={10} height={10} className="object-contain w-2.5 h-2.5 sm:w-3 sm:h-3" /></div> <span className="text-neutral-900 dark:text-neutral-50 font-black font-amount text-sm sm:text-base leading-none">{product.price.toLocaleString()}</span>，抽獎結果隨機產生。</span>
                  </li>
                  <li className="flex gap-2 sm:gap-3">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-accent-red mt-1.5 shrink-0" />
                    <span>所有獎項均為正版授權商品，請放心抽選。</span>
                  </li>
                  <li className="flex gap-2 sm:gap-3">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-accent-red mt-1.5 shrink-0" />
                    <span>商品庫庫存會即時更新，售完為止。</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-2 sm:pt-8">
              <div className="flex items-center justify-between mb-2 sm:mb-8 px-1">
                <h2 className="text-base sm:text-2xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">猜你喜歡</h2>
                <Link href="/" className="text-[13px] sm:text-sm font-black text-primary hover:text-primary/80 uppercase tracking-widest">查看更多</Link>
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

        {viewingPrize && (
          <div
            className="fixed inset-0 z-[2200] bg-black/80 flex items-center justify-center"
            onClick={() => setViewingPrize(null)}
          >
            <div
              className="relative w-[80vw] max-w-sm max-h-[80vh] flex flex-col items-center justify-center gap-3"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-white text-base font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)] text-center px-3">
                {viewingPrize.name}
              </div>
              <Image
                src={viewingPrize.image_url || '/images/item.png'}
                alt={viewingPrize.name}
                width={800}
                height={800}
                className="max-w-full max-h-full object-contain rounded-2xl"
                unoptimized
              />
            </div>
          </div>
        )}

        {(() => {
          const cardTheme = (product as any).machine_theme || moduleSettings['card'];
          if (cardTheme === 'card_pack') {
            return (
              <CardDrawAnimation
                isOpen={isVideoOpen}
                prizes={wonPrizes}
                packImage={`/images/card/pack/${activePackStyle}a.png`}
                onGoToWarehouse={handleVideoEnd}
                onContinue={handleCardContinue}
              />
            );
          }
          if (cardTheme === 'card_flip') {
            return (
              <CardFlipDirect
                isOpen={isVideoOpen}
                prizes={wonPrizes}
                onGoToWarehouse={handleVideoEnd}
                onContinue={handleCardContinue}
              />
            );
          }
          // 預設：播放影片
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-32 md:pb-12 pt-14 md:pt-0">
      <div className="max-w-7xl mx-auto px-2 py-2 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-6 items-start">
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <div className="bg-white dark:bg-neutral-900 rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-800">
                <div className="w-full h-full flex items-center justify-center text-white/20 group-hover:scale-105 transition-transform duration-500">
                  <Image
                    src={product.image_url || `/images/item/${product.id.toString().padStart(5, '0')}.jpg`}
                    alt={product.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                
                {((typeof totalRemaining === 'number' && totalRemaining <= 0) || product.status === 'ended') && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
                    <Image 
                      src="/images/sale.svg" 
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
                    <div className="h-6 px-2 inline-flex items-center rounded-tr-lg rounded-bl-lg bg-[#EE4D2D] text-white text-[11px] font-black border border-white/10 leading-none transform origin-top-right scale-150">
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
                      <ProductBadge type={product.type as 'ichiban' | 'blindbox' | 'gacha' | 'custom'} />
                    </span>
                  )}
                  <span className="align-middle">
                    {product.name}
                  </span>
                </h1>
                {product.is_preorder && (
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-200">
                      <span className="text-[11px] font-black">預購商品</span>
                      <span className="text-[11px] font-bold">
                        預計可配送日 {product.preorder_available_at ? new Date(product.preorder_available_at).toLocaleDateString() : '待公布'}
                      </span>
                    </span>
                  </div>
                )}
                
                <div className="hidden lg:flex items-end justify-between gap-2 pb-5 border-b border-neutral-50 dark:border-neutral-800">
                  <div className="flex items-baseline gap-2">
                    <Image
                      src="/images/gcoin.png"
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
                  <div className="text-sm font-black text-neutral-500 leading-none mb-1 text-right">
                    優惠前：<span className="line-through font-amount">{Math.round(product.price * 1.2).toLocaleString()}</span>
                  </div>
                </div>

                <div className="pt-2 hidden lg:block">
                  <div className="flex items-center gap-3">
          <Button 
                      onClick={totalRemaining === 0 ? handleShowResults : handleDrawClick}
                      size="lg"
                      className={cn(
                        "flex-1 h-[44px] text-lg font-black rounded-xl shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                        totalRemaining === 0 
                          ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-neutral-900/20"
                          : "shadow-accent-red/20"
                      )}
                      variant={totalRemaining === 0 ? "secondary" : "danger"}
                      disabled={false}
                    >
                      {totalRemaining === 0
                        ? '查看結果'
                        : product.type === 'ichiban'
                          ? '立即抽獎'
                          : '立即轉蛋'}
                    </Button>

                    <button
                      onClick={handleShare}
                      className={cn(
                        "w-[44px] h-[44px] border rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-95",
                        shareCopied
                          ? "bg-green-50 border-green-400 text-green-500 dark:bg-green-900/20 dark:border-green-600"
                          : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:text-primary hover:border-primary/50"
                      )}
                    >
                      {shareCopied ? <Check className="w-5 h-5 stroke-[2.5]" /> : <Share2 className="w-5 h-5 stroke-[2.5]" />}
                    </button>
                    
                    <button 
                      onClick={handleFollowToggle}
                      className={cn(
                        "w-[44px] h-[44px] rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-95 border",
                        isFollowed 
                          ? "bg-accent-red text-white border-accent-red shadow-accent-red/20" 
                          : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:text-accent-red hover:border-accent-red/50"
                      )}
                    >
                      <Heart className={cn("w-5 h-5 stroke-[2.5]", isFollowed && "fill-current")} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-2 sm:space-y-5">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="p-2 sm:p-4 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30">
                <h2 className="text-sm sm:text-lg font-black text-neutral-900 dark:text-neutral-50 tracking-tight uppercase tracking-wider">店家配率表</h2>
              </div>
              
              <div className="overflow-x-auto relative custom-scrollbar">
                <table className="w-full min-w-[480px] text-left">
                  <thead className="bg-neutral-50/50 dark:bg-neutral-800/50 text-[13px] sm:text-sm font-black text-neutral-400 dark:text-neutral-500 border-b border-neutral-50 dark:border-neutral-800">
                    <tr>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 uppercase tracking-widest">獎項名稱</th>
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
                    {prizes.filter(p => p.level !== 'Last One' && p.level !== 'LAST ONE' && !p.level.includes('最後賞')).map((prize, index) => (
                      <tr 
                        key={index} 
                        className={cn(
                          "hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors group cursor-pointer",
                          prize.remaining === 0 && "opacity-50"
                        )}
                        onClick={() => setViewingPrize({
                          name: prize.name,
                          image_url: prize.image_url || undefined,
                          level: prize.level,
                          total: prize.total,
                          remaining: prize.remaining
                        })}
                      >
                        <td className="px-2 sm:px-6 py-2 sm:py-3.5">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <span className="text-[13px] text-primary font-black uppercase tracking-widest bg-primary/5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg border border-primary/10 whitespace-nowrap">
                              {prize.level}
                            </span>
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
                      : '/images/item.png';
                  
                  return (
                    <button
                      type="button"
                      className="w-full text-left bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-neutral-900 dark:text-neutral-100 shadow-xl relative overflow-hidden group border border-yellow-200/60 dark:border-yellow-700/40"
                      onClick={() =>
                        setViewingPrize({
                          name: lastOnePrize.name,
                          image_url: lastOnePrize.image_url || undefined,
                          level: lastOnePrize.level,
                          total: lastOnePrize.total,
                          remaining: lastOnePrize.remaining,
                        })
                      }
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

            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 sm:p-6 space-y-3 sm:space-y-6">
              <div className="flex items-center gap-3 sm:gap-4 border-b border-neutral-50 dark:border-neutral-800 pb-3 sm:pb-5">
                <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-accent-emerald/10 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 sm:w-7 sm:h-7 text-accent-emerald stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-base sm:text-xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">公平性驗證</h2>
                  <p className="text-[13px] sm:text-sm text-neutral-400 dark:text-neutral-500 font-black uppercase tracking-widest mt-0.5">確保抽獎過程的透明與公正</p>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/10 rounded-2xl p-3 sm:p-5 space-y-3 sm:space-y-4">
                <div className="flex items-center gap-2 text-primary font-black text-[13px] sm:text-sm uppercase tracking-widest">
                  <Info className="w-3.5 h-3.5 stroke-[3]" />
                  公平性驗證機制
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <p className="text-[13px] sm:text-sm text-neutral-500 dark:text-neutral-400 font-bold leading-relaxed">
                    每次抽獎會記錄隨機種子 Seed、籤號與對應的 TXID Hash。完抽後會公開 Seed，任何人都可以在公平性驗證頁輸入 Seed 與籤號，重算隨機值與 TXID Hash 來確認結果無法事後被修改。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5 pt-1 sm:pt-2">
                <div className="space-y-1.5 sm:space-y-2.5">
                  <div className="text-[13px] sm:text-sm font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5" /> 隨機種子 (TXID)
                  </div>
                  <CopyableTruncatedField
                    value={(totalRemaining === 0 && product.seed) ? (product.seed as string) : ''}
                    placeholder="完抽後公布"
                    fieldClassName={cn(
                      (totalRemaining === 0 && product.seed) ? '' : 'text-neutral-400 dark:text-neutral-500 tracking-widest'
                    )}
                  />
                </div>

                <div className="space-y-1.5 sm:space-y-2.5">
                  <div className="text-[13px] sm:text-sm font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                    <FileCheck className="w-3.5 h-3.5" /> 哈希值 (TXID Hash)
                  </div>
                  <CopyableTruncatedField
                    value={product.txid_hash || ''}
                    placeholder="尚未生成，請稍後再試"
                  />
                </div>
              </div>

              {isSoldOut && (
                <button
                  type="button"
                  onClick={handleGoToFairness}
                  className="w-full flex items-center justify-center px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-primary text-white text-[13px] sm:text-sm font-black shadow-sm hover:bg-primary/90 transition-colors"
                >
                  前往公平性驗證頁
                </button>
              )}
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 sm:p-6 space-y-3 sm:space-y-6">
              <h3 className="font-black text-neutral-900 dark:text-neutral-50 text-base sm:text-xl tracking-tight border-b border-neutral-50 dark:border-neutral-800 pb-3 sm:pb-5">商品資訊</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 sm:gap-y-5 gap-x-12">
                {[
                  { label: '類別', value: ({ ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋', card: '抽卡', custom: '自製賞' } as Record<string, string>)[product.type] || product.type },
                  { label: '廠商', value: supplierName || '-' },
                  { label: '代理商', value: product.distributor || '-' },
                  { label: '條碼', value: (product as any).barcode || '-' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center text-sm py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
                    <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px] sm:text-[13px]">{label}</span>
                    <span className="text-neutral-900 dark:text-neutral-50 font-black">{value}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 sm:pt-6 mt-3 sm:mt-6 border-t border-neutral-50 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/50 -mx-3 sm:-mx-6 px-3 sm:px-6 pb-3 sm:pb-6 rounded-b-[24px] sm:rounded-b-[32px]">
                <h4 className="text-[13px] sm:text-[13px] font-black text-neutral-900 dark:text-neutral-50 mb-2 sm:mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-yellow fill-current" />
                  抽獎注意事項
                </h4>
                <ul className="text-[13px] sm:text-sm text-neutral-500 dark:text-neutral-400 space-y-2 sm:space-y-3.5 font-bold">
                  <li className="flex gap-2 sm:gap-3">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-accent-red mt-1.5 shrink-0" />
                    <span>每抽價格為 <div className="inline-flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-accent-yellow shadow-sm mx-0.5 sm:mx-1"><Image src="/images/gcoin.png" alt="G" width={10} height={10} className="object-contain w-2.5 h-2.5 sm:w-3 sm:h-3" /></div> <span className="text-neutral-900 dark:text-neutral-50 font-black font-amount text-sm sm:text-base leading-none">{product.price.toLocaleString()}</span>，抽獎結果隨機產生。</span>
                  </li>
                  <li className="flex gap-2 sm:gap-3">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-accent-red mt-1.5 shrink-0" />
                    <span>所有獎項均為正版授權商品，請放心抽選。</span>
                  </li>
                  <li className="flex gap-2 sm:gap-3">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-accent-red mt-1.5 shrink-0" />
                    <span>商品庫庫存會即時更新，售完為止。</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-2 sm:pt-8">
              <div className="flex items-center justify-between mb-2 sm:mb-8 px-1">
                <h2 className="text-base sm:text-2xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">猜你喜歡</h2>
                <Link href="/" className="text-[13px] sm:text-sm font-black text-primary hover:text-primary/80 uppercase tracking-widest">查看更多</Link>
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

        {viewingPrize && (
          <div
            className="fixed inset-0 z-[2200] bg-black/80 flex items-center justify-center"
            onClick={() => setViewingPrize(null)}
          >
            <div
              className="relative w-[80vw] max-w-sm max-h-[80vh] flex flex-col items-center justify-center gap-3"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-white text-base font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)] text-center px-3">
                {viewingPrize.name}
              </div>
              <Image
                src={viewingPrize.image_url || '/images/item.png'}
                alt={viewingPrize.name}
                width={800}
                height={800}
                className="max-w-full max-h-full object-contain rounded-2xl"
                unoptimized
              />
            </div>
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-neutral-100 dark:border-neutral-800 h-auto min-h-16 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 flex items-center lg:hidden z-50 shadow-modal">
          <div className="flex items-center gap-4 w-full pb-2">
            <div className="flex flex-col items-center justify-center pl-2">
              <div className="text-[13px] font-black text-neutral-500 dark:text-neutral-400 leading-none mb-1 whitespace-nowrap">
                優惠前：<span className="line-through font-amount">{Math.round(product.price * 1.2).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center justify-center w-4 h-4 rounded-full bg-accent-yellow shadow-sm">
                  <Image
                    src="/images/gcoin.png"
                    alt="G"
                    width={10}
                    height={10}
                    className="object-contain"
                  />
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[28px] font-black text-accent-red font-amount leading-none tracking-tighter">{product.price.toLocaleString()}</span>
                  <span className="text-sm font-black text-neutral-400 dark:text-neutral-500 leading-none uppercase tracking-widest">/抽</span>
                </div>
              </div>
            </div>
            <Button
              onClick={totalRemaining === 0 ? handleShowResults : handleDrawClick}
              size="lg"
              className={cn(
                "flex-1 h-[44px] text-base font-black rounded-xl shadow-xl transition-all active:scale-[0.95] flex items-center justify-center gap-2",
                totalRemaining === 0
                  ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-neutral-900/20"
                  : "shadow-accent-red/20"
              )}
              variant={totalRemaining === 0 ? "secondary" : "danger"}
              disabled={false}
            >
              {totalRemaining === 0
                ? '查看結果'
                : product.type === 'ichiban'
                  ? '立即抽獎'
                  : '立即轉蛋'}
            </Button>
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
          if (effectiveTheme === 'ichiban_grid' || effectiveTheme === 'custom_grid' || effectiveTheme === 'card_pack' || effectiveTheme === 'card_flip') {
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
              onClick={() => setIsTicketModalOpen(false)}
            />
            <div className="relative z-[2101] w-full max-w-[640px] max-h-[90vh] px-4">
              <TicketSelectionFlow
                isModal
                onClose={() => setIsTicketModalOpen(false)}
                onRefreshProduct={fetchData}
                onTearFinish={(results) => {
                  setIsTicketModalOpen(false);
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
                      ? "bg-emerald-100 dark:bg-emerald-900/40"
                      : "bg-neutral-100 dark:bg-neutral-800 group-hover:bg-primary/10"
                  )}>
                    {shareCopied
                      ? <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
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
    </div>
  );
}
