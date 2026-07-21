'use client';

import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ProductBadge, { ProductType } from '@/components/ui/ProductBadge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import ProductCard from '@/components/ProductCard';
import { AlertTriangle, X, Minus, Plus, MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';

export const dynamic = 'force-dynamic';

type SaleListing = {
  id: string;
  seller: { id: string; name: string; avatar: string };
  createdAt: string;
  price: number;
  status: string;
  note: string;
  images: string[];
  title: string;
  items: Array<{ name: string; series: string; grade: string; image: string; quantity: number; price?: number }>;
  product: { name: string; series: string; grade: string; image: string; type?: ProductType };
};

export default function SellDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showToast } = useToast();
  const { flags } = useFeatureFlags();
  const escrowEnabled = Boolean(flags.sell_escrow);

  const [listing, setListing] = useState<SaleListing | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<SaleListing[]>([]);
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [viewingImage, setViewingImage] = useState<{ src: string; alt: string } | null>(null);
  const tapRef = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false });
  const [reloadSeq, setReloadSeq] = useState(0);
  const [isSkuOpen, setIsSkuOpen] = useState(false);
  const [selectedPrizeIndex, setSelectedPrizeIndex] = useState(0);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'private' | 'escrow'>('transfer');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const lastViewPingRef = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    const listingIdNum = Number(id);
    if (!Number.isFinite(listingIdNum)) return;
    const now = Date.now();
    const prev = lastViewPingRef.current;
    if (prev && prev.id === id && now - prev.at < 800) return;
    lastViewPingRef.current = { id, at: now };

    const supabase = createClient();
    let sessionId: string | null = null;
    try {
      const key = 'gachago:session_id';
      sessionId = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      if (!sessionId) {
        sessionId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${now}-${Math.random().toString(16).slice(2)}`;
        localStorage.setItem(key, sessionId);
      }
    } catch {
      sessionId = null;
    }

    void supabase.rpc('increment_sell_listing_view', { p_listing_id: listingIdNum, p_session_id: sessionId });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data: row, error } = await supabase
          .from('sell_listings')
          .select(
            `
              id,
              seller_id,
              price,
              status,
              created_at,
              title,
              note,
              images,
              items
            `
          )
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        if (!row?.id) {
          if (!cancelled) setListing(null);
          return;
        }

        const sellerId = String((row as any)?.seller_id || '');
        let sellerName = 'user';
        let sellerAvatar = '/images/avatar.png';
        if (sellerId) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: [sellerId] });
          if (!displayError && Array.isArray(displays) && displays[0]) {
            const d = displays[0] as any;
            sellerName = String(d?.name || 'user');
            sellerAvatar = String(d?.avatar_url || '/images/avatar.png');
          }
        }

        const createdAtRaw = String((row as any)?.created_at || '');
        const createdAt = createdAtRaw ? createdAtRaw.slice(0, 10) : '';

        const type = undefined;
        const rawNote = String((row as any)?.note || '').trim();
        const rawTitle = String((row as any)?.title || '').trim();
        const rawImages = (row as any)?.images ?? (row as any)?.image_urls ?? (row as any)?.imageUrls ?? null;
        const imageCandidates: string[] = Array.isArray(rawImages)
          ? rawImages.map((x: any) => String(x || '').trim()).filter(Boolean)
          : [];

        const rawItems = (row as any)?.items ?? [];
        const items = Array.isArray(rawItems)
          ? rawItems.map((x: any) => ({
              name: String(x?.name || '').trim(),
              series: String(x?.series || '').trim(),
              grade: String(x?.grade || '').trim(),
              image: String(x?.image || '').trim(),
              quantity: Math.max(1, Math.round(Number(x?.quantity ?? 1) || 1)),
            }))
          : [];

        const primaryImage = imageCandidates[0] || String(items[0]?.image || '').trim() || '/images/item.png';
        const imagesFromItems = items.map((x) => x.image).filter(Boolean);
        const images = (imageCandidates.length > 0 ? imageCandidates : imagesFromItems.length > 0 ? imagesFromItems : [primaryImage]).filter(Boolean);

        const mapped: SaleListing = {
          id: String((row as any)?.id || ''),
          seller: { id: sellerId, name: sellerName, avatar: sellerAvatar },
          createdAt,
          price: typeof (row as any)?.price === 'number' ? (row as any).price : Number((row as any)?.price || 0),
          status: String((row as any)?.status || 'active'),
          note: rawNote,
          images,
          title: rawTitle,
          items,
          product: {
            name: rawTitle || (items[0]?.name ? String(items[0]?.name) : '販售商品'),
            grade: items[0]?.grade ? String(items[0]?.grade) : '',
            series: items[0]?.series ? String(items[0]?.series) : '',
            image: primaryImage,
            type,
          },
        };

        if (cancelled) return;
        setListing(mapped);
      } catch (e) {
        console.error('Failed to load sell listing:', e);
        if (!cancelled) setListing(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [id, reloadSeq]);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const width = el.clientWidth || 1;
        const idx = Math.round(el.scrollLeft / width);
        setActiveImageIndex((prev) => (prev === idx ? prev : idx));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
    };
  }, [listing?.images.length]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!listing?.id) return;
      setIsRecommendationsLoading(true);
      try {
        const supabase = createClient();
        const currentId = Number.isFinite(Number(listing.id)) ? Number(listing.id) : listing.id;
        const { data: rows, error } = await supabase
          .from('sell_listings')
          .select(
            `
              id,
              seller_id,
              price,
              status,
              created_at,
              title,
              note,
              images,
              items
            `
          )
          .eq('status', 'active')
          .neq('id', currentId as any)
          .order('created_at', { ascending: false })
          .limit(8);

        if (error) throw error;
        const list = Array.isArray(rows) ? rows : [];

        const sellerIds = Array.from(new Set(list.map((r: any) => String(r?.seller_id || '')).filter(Boolean)));
        const displayById = new Map<string, { name: string; avatar_url: string }>();
        if (sellerIds.length > 0) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: sellerIds });
          if (!displayError) {
            for (const d of Array.isArray(displays) ? displays : []) {
              const uid = String((d as any)?.id || '');
              if (!uid) continue;
              displayById.set(uid, { name: String((d as any)?.name || 'user'), avatar_url: String((d as any)?.avatar_url || '/images/avatar.png') });
            }
          }
        }

        const mapped = list.map((r: any): SaleListing => {
          const sellerId = String(r?.seller_id || '');
          const display = displayById.get(sellerId) || { name: 'user', avatar_url: '/images/avatar.png' };
          const createdAtRaw = String(r?.created_at || '');
          const createdAt = createdAtRaw ? createdAtRaw.slice(0, 10) : '';
          const type = undefined;
          const rawNote = String(r?.note || '').trim();
          const rawTitle = String(r?.title || '').trim();
          const rawImages = r?.images ?? r?.image_urls ?? r?.imageUrls ?? null;
          const imageCandidates: string[] = Array.isArray(rawImages)
            ? rawImages.map((x: any) => String(x || '').trim()).filter(Boolean)
            : [];
          const rawItems = r?.items ?? [];
          const items = Array.isArray(rawItems)
            ? rawItems.map((x: any) => ({
                name: String(x?.name || '').trim(),
                series: String(x?.series || '').trim(),
                grade: String(x?.grade || '').trim(),
                image: String(x?.image || '').trim(),
                quantity: Math.max(1, Math.round(Number(x?.quantity ?? 1) || 1)),
              }))
            : [];
          const primaryImage = imageCandidates[0] || String(items[0]?.image || '').trim() || '/images/item.png';
          const imagesFromItems = items.map((x) => x.image).filter(Boolean);
          const images = (imageCandidates.length > 0 ? imageCandidates : imagesFromItems.length > 0 ? imagesFromItems : [primaryImage]).filter(Boolean);

          return {
            id: String(r?.id || ''),
            seller: { id: sellerId, name: display.name, avatar: display.avatar_url },
            createdAt,
            price: typeof r?.price === 'number' ? r.price : Number(r?.price || 0),
            status: String(r?.status || 'active'),
            note: rawNote,
            images,
            title: rawTitle,
            items,
            product: {
              name: rawTitle || (items[0]?.name ? String(items[0]?.name) : '販售商品'),
              grade: items[0]?.grade ? String(items[0]?.grade) : '',
              series: items[0]?.series ? String(items[0]?.series) : '',
              image: primaryImage,
              type,
            },
          };
        });

        if (cancelled) return;
        setRecommendations(mapped.filter((x) => x.id && x.id !== listing.id));
      } catch (e) {
        console.error('Failed to load sell recommendations:', e);
        if (!cancelled) setRecommendations([]);
      } finally {
        if (!cancelled) setIsRecommendationsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [listing?.id]);

  const pageTitle = useMemo(() => {
    if (!listing) return '販售';
    return listing.title || listing.product.name || '販售';
  }, [listing]);

  const prizes = useMemo(() => {
    if (!listing) return [];
    if (Array.isArray(listing.items) && listing.items.length > 0) {
      return listing.items.map((it, idx) => ({
        level: String(it.grade || '').trim() || '商品',
        name: String(it.name || '').trim() || '未知卡片',
        total: Math.max(0, Math.round(Number(it.quantity) || 0)),
        remaining: listing.status === 'active' ? Math.max(0, Math.round(Number(it.quantity) || 0)) : 0,
        image_url: String(it.image || '').trim() || listing.product.image,
        unit_price: Math.max(0, Math.round(Number((it as any)?.price ?? listing.price) || 0)),
        _idx: idx,
      }));
    }
    return [
      {
        level: listing.product.grade || '商品',
        name: listing.product.name || '未知卡片',
        total: 1,
        remaining: listing.status === 'active' ? 1 : 0,
        image_url: listing.product.image,
        unit_price: Math.max(0, Math.round(Number(listing.price) || 0)),
        _idx: 0,
      },
    ];
  }, [listing]);

  const minUnitPrice = useMemo(() => {
    if (!listing) return 0;
    const prices = prizes.map((p: any) => Math.max(0, Number(p?.unit_price) || 0)).filter((n) => n > 0);
    if (prices.length === 0) return Math.max(0, Number(listing.price) || 0);
    return Math.min(...prices);
  }, [listing, prizes]);

  const totalRemaining = useMemo(() => prizes.reduce((acc, p) => acc + (Number(p.remaining) || 0), 0), [prizes]);
  const totalItems = useMemo(() => prizes.reduce((acc, p) => acc + (Number(p.total) || 0), 0), [prizes]);
  const hasValidItems = useMemo(() => (Array.isArray(listing?.items) ? listing!.items.length > 0 : false), [listing?.items]);
  const isSoldOut = useMemo(() => totalRemaining <= 0 || listing?.status !== 'active' || !hasValidItems, [hasValidItems, listing?.status, totalRemaining]);
  const selectedPrize = useMemo(() => prizes[selectedPrizeIndex] || prizes[0] || null, [prizes, selectedPrizeIndex]);
  const selectedUnitPrice = useMemo(() => Math.max(0, Number((selectedPrize as any)?.unit_price) || 0), [selectedPrize]);
  const selectedTotalPrice = useMemo(() => Math.max(0, selectedUnitPrice) * Math.max(1, selectedQuantity), [selectedQuantity, selectedUnitPrice]);

  useEffect(() => {
    setSelectedPrizeIndex((prev) => {
      if (prizes.length === 0) return 0;
      if (prev < 0) return 0;
      if (prev >= prizes.length) return 0;
      return prev;
    });
  }, [prizes.length]);

  useEffect(() => {
    const max = selectedPrize ? Math.max(1, Number(selectedPrize.remaining) || 1) : 1;
    setSelectedQuantity((prev) => Math.min(Math.max(1, prev), max));
  }, [selectedPrize?.remaining]);

  const openSku = () => {
    if (isSoldOut) return;
    if (!hasValidItems) {
      showToast('商品未設定規格，無法下單', 'plain');
      return;
    }
    setIsSkuOpen(true);
  };

  const purchase = async () => {
    if (isAuthLoading) return;
    if (!user?.id) {
      router.push('/login');
      return;
    }
    if (!listing?.id) return;
    if (!hasValidItems) {
      showToast('商品未設定規格，無法下單', 'plain');
      return;
    }
    if (!selectedPrize) return;
    const listingIdNum = Number(listing.id);
    if (!Number.isFinite(listingIdNum)) {
      showToast('購買失敗', 'plain');
      return;
    }
    setIsPurchasing(true);
    try {
      const supabase = createClient();
      const methodForOrder = escrowEnabled ? 'escrow' : paymentMethod;
      const { data, error } = await supabase.rpc('create_sell_order', {
        p_listing_id: listingIdNum,
        p_item_index: selectedPrizeIndex,
        p_quantity: selectedQuantity,
        p_payment_method: methodForOrder,
      });
      if (error) throw error;
      const ok = Boolean((data as any)?.success);
      if (!ok) {
        const msg = String((data as any)?.message || '下單失敗');
        if (msg === 'invalid_payment_method' && escrowEnabled) {
          showToast('販售金流尚未初始化，請到後台「功能開關」頁刷新一次再試', 'plain');
        } else {
          showToast(msg, 'plain');
        }
        return;
      }
      const orderId = String((data as any)?.order_id || '');
      showToast('已建立訂單', 'plain');
      if (!ok) return;
      setIsSkuOpen(false);
      if (escrowEnabled && orderId) router.push(`/sell-orders/${encodeURIComponent(orderId)}`);
      else if (orderId) router.push(`/sell-orders/${orderId}`);
      else setReloadSeq((s) => s + 1);
    } catch (e) {
      console.error('Failed to purchase listing item:', e);
      showToast('下單失敗', 'plain');
    } finally {
      setIsPurchasing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pt-14 pb-24 flex items-center justify-center">
        <div className="text-[13px] font-black text-neutral-400">載入中</div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pt-14 pb-24 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-[13px] font-black text-neutral-400">找不到此販售商品</div>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[13px] font-black"
          >
            返回首頁
          </button>
        </div>
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
                <div
                  ref={carouselRef}
                  className="absolute inset-0 overflow-x-auto overflow-y-hidden flex snap-x snap-mandatory scrollbar-hide"
                  onPointerDown={(e) => {
                    tapRef.current = { x: e.clientX, y: e.clientY, moved: false };
                  }}
                  onPointerMove={(e) => {
                    const dx = Math.abs(e.clientX - tapRef.current.x);
                    const dy = Math.abs(e.clientY - tapRef.current.y);
                    if (dx > 10 || dy > 10) tapRef.current.moved = true;
                  }}
                  onPointerUp={() => {
                    if (tapRef.current.moved) return;
                    const src = listing.images[activeImageIndex] || listing.product.image;
                    if (!src) return;
                    setViewingImage({ src, alt: listing.product.name });
                  }}
                >
                  {listing.images.map((src, idx) => (
                    <div key={`${src}-${idx}`} className="relative w-full h-full flex-shrink-0 snap-center">
                      <Image src={src} alt={listing.product.name} fill className="object-cover" unoptimized />
                    </div>
                  ))}
                </div>

                {listing.images.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5">
                    {listing.images.map((_, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          idx === activeImageIndex ? "w-6 bg-white/95" : "w-1.5 bg-white/60"
                        )}
                      />
                    ))}
                  </div>
                )}

                {isSoldOut && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
                    <Image
                      src="/images/sale.svg"
                      alt="完售"
                      width={120}
                      height={120}
                      className="w-28 h-auto transform scale-110 drop-shadow-xl"
                      unoptimized
                    />
                  </div>
                )}
              </div>

              <div className="p-3 sm:p-6 space-y-2 sm:space-y-5">
                <h1 className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-neutral-50 leading-tight tracking-tight break-all">
                  {listing.product.type && (
                    <span className="inline-block align-middle mr-2">
                      <ProductBadge type={listing.product.type} />
                    </span>
                  )}
                  <span className="align-middle">{pageTitle}</span>
                </h1>

                <div className="hidden lg:flex items-end justify-between gap-2 pb-5 border-b border-neutral-50 dark:border-neutral-800">
                  <div className="flex items-baseline gap-2">
                    <Image src="/images/gcoin.png" alt="G Coin" width={20} height={20} className="w-5 h-5 object-contain" />
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-black text-accent-red font-amount tracking-tighter leading-none">
                        {Math.round(minUnitPrice).toLocaleString()}
                      </span>
                      <span className="text-[13px] font-black text-neutral-400 dark:text-neutral-500">起</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 hidden lg:block">
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      size="lg"
                      variant="secondary"
                      className="h-[44px] px-4 text-base font-black rounded-xl"
                      onClick={() => {
                        if (isAuthLoading) return;
                        if (!user?.id) {
                          router.push(`/login?redirect=${encodeURIComponent(`/sell/${listing.id}`)}`);
                          return;
                        }
                        if (typeof window !== 'undefined') {
                          sessionStorage.setItem(`messages:title:sell:${listing.id}--${listing.seller.id}`, `@${listing.seller.name}`);
                          sessionStorage.setItem(`messages:avatar:sell:${listing.id}--${listing.seller.id}`, listing.seller.avatar || '/images/avatar.png');
                        }
                        router.push(`/messages/sell:${listing.id}--${listing.seller.id}`);
                      }}
                    >
                      <MessageCircle className="w-5 h-5 stroke-[2]" />
                      私聊
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      className={cn(
                        "flex-1 h-[44px] text-lg font-black rounded-xl shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                        isSoldOut ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-neutral-900/20" : "shadow-accent-red/20"
                      )}
                      variant={isSoldOut ? "secondary" : "danger"}
                      onClick={openSku}
                      disabled={isSoldOut}
                    >
                      {isSoldOut ? '已售出' : '立即購買'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-2 sm:space-y-5">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="p-2 sm:p-4 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30">
                <h2 className="text-sm sm:text-lg font-black text-neutral-900 dark:text-neutral-50 tracking-tight uppercase tracking-wider">
                  總覽
                </h2>
              </div>

              <table className="w-full text-left table-fixed">
                <thead className="bg-neutral-50/50 dark:bg-neutral-800/50 text-[13px] sm:text-sm font-black text-neutral-400 dark:text-neutral-500 border-b border-neutral-50 dark:border-neutral-800">
                  <tr>
                    <th className="px-2 sm:px-6 py-2 sm:py-3 uppercase tracking-widest">名稱</th>
                    <th className="px-2 sm:px-6 py-2 sm:py-3 text-right uppercase tracking-widest w-[72px] sm:w-[96px] whitespace-nowrap">
                      數量
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                  {prizes.map((prize, index) => (
                    <tr
                      key={index}
                      onClick={() => {
                        const src = String(prize.image_url || listing.product.image || '');
                        if (!src) return;
                        setViewingImage({ src, alt: prize.name });
                      }}
                      className={cn(
                        "hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer",
                        prize.remaining === 0 && "opacity-50"
                      )}
                    >
                      <td className="px-2 sm:px-6 py-2 sm:py-3.5">
                        <div className="font-black text-neutral-900 dark:text-neutral-50 text-[13px] sm:text-sm leading-tight tracking-tight break-all">
                          {prize.name}
                        </div>
                      </td>
                      <td className="px-2 sm:px-6 py-2 sm:py-3.5 text-right w-[72px] sm:w-[96px] whitespace-nowrap align-middle">
                        <span className="font-black text-sm sm:text-base tracking-tighter text-neutral-900 dark:text-neutral-50">
                          {Number(prize.total).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-4 bg-accent-red/5 dark:bg-accent-red/10 border-t-2 border-neutral-50 dark:border-neutral-800">
                <span className="font-black text-accent-red text-sm sm:text-base tracking-widest uppercase">合計</span>
                <span className="text-lg sm:text-2xl font-black tracking-tighter whitespace-nowrap">
                  <span className="font-black text-accent-red">{totalItems.toLocaleString()}</span>
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 sm:p-6 space-y-3 sm:space-y-6">
              <h3 className="font-black text-neutral-900 dark:text-neutral-50 text-base sm:text-xl tracking-tight border-b border-neutral-50 dark:border-neutral-800 pb-3 sm:pb-5">
                商品資訊
              </h3>
              <button
                type="button"
                onClick={openSku}
                className="w-full flex items-center justify-between gap-3 py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800"
              >
                <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px] sm:text-[13px]">
                  規格
                </span>
                <span className="text-neutral-900 dark:text-neutral-50 font-black text-[13px] sm:text-[13px] flex items-center gap-2 min-w-0">
                  <span className="truncate">{selectedPrize?.name || '請選擇'}</span>
                  <span className="text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
                    {selectedPrize ? `數量 ${Math.max(0, Number(selectedPrize.remaining) || 0).toLocaleString()}` : ''}
                  </span>
                </span>
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 sm:gap-y-5 gap-x-12">
                <div className="flex justify-between items-center text-sm py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px] sm:text-[13px]">
                    系列
                  </span>
                  <span className={cn("text-neutral-900 dark:text-neutral-50 font-black text-right", !listing.product.series && "text-neutral-400 dark:text-neutral-500")}>
                    {listing.product.series || '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px] sm:text-[13px]">
                    等級
                  </span>
                  <span className="text-neutral-900 dark:text-neutral-50 font-black">{listing.product.grade || '—'}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px] sm:text-[13px]">
                    賣家
                  </span>
                  <span className="text-neutral-900 dark:text-neutral-50 font-black">@{listing.seller.name}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px] sm:text-[13px]">
                    上架日期
                  </span>
                  <span className="text-neutral-900 dark:text-neutral-50 font-black">{listing.createdAt || '—'}</span>
                </div>
              </div>

              <div className="pt-3 sm:pt-6 mt-3 sm:mt-6 border-t border-neutral-50 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/50 -mx-3 sm:-mx-6 px-3 sm:px-6 pb-3 sm:pb-6 rounded-b-[24px] sm:rounded-b-[32px]">
                <h4 className="text-[13px] sm:text-[13px] font-black text-neutral-900 dark:text-neutral-50 mb-2 sm:mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-yellow fill-current" />
                  賣家說明
                </h4>
                <ul className="text-[13px] sm:text-sm text-neutral-500 dark:text-neutral-400 space-y-2 sm:space-y-3.5 font-bold">
                  {(listing.note ? listing.note.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : ['上架者尚未填寫說明']).map((line, idx) => (
                    <li key={idx} className="flex gap-2 sm:gap-3">
                      <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-accent-red mt-1.5 shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-2 sm:pt-8">
              <div className="flex items-center justify-between mb-2 sm:mb-8 px-1">
                <h2 className="text-base sm:text-2xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">猜你喜歡</h2>
                <Link href="/search" className="text-[13px] sm:text-sm font-black text-primary hover:text-primary/80 uppercase tracking-widest">查看更多</Link>
              </div>
              {isRecommendationsLoading ? (
                <div className="py-10 text-center text-[13px] font-black text-neutral-400">載入中</div>
              ) : recommendations.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-5">
                  {recommendations.map((r) => (
                    <ProductCard
                      key={r.id}
                      id={r.id}
                      name={r.product.name}
                      image={r.product.image || ''}
                      price={(() => {
                        const prices = Array.isArray(r.items)
                          ? r.items.map((x: any) => Number((x as any)?.price || 0)).filter((n: number) => Number.isFinite(n) && n > 0)
                          : [];
                        return prices.length > 0 ? Math.min(...prices) : r.price;
                      })()}
                      remaining={r.status === 'active' ? 1 : 0}
                      total={1}
                      type={r.product.type}
                      status={r.status === 'active' ? 'active' : 'ended'}
                      hrefOverride={`/sell/${r.id}`}
                      unitLabel=""
                      showRemainingText={false}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-[13px] font-black text-neutral-400">目前沒有其他販售商品</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {viewingImage && (
        <div
          className="fixed inset-0 z-[2200] bg-black/80 flex items-center justify-center"
          onClick={() => setViewingImage(null)}
        >
          <div
            className="relative w-[80vw] max-w-sm max-h-[80vh] flex flex-col items-center justify-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-white text-base font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)] text-center px-3">
              {viewingImage.alt}
            </div>
            <Image
              src={viewingImage.src}
              alt={viewingImage.alt}
              width={800}
              height={800}
              className="max-w-full max-h-full object-contain rounded-2xl"
              unoptimized
            />
          </div>
        </div>
      )}

      {isSkuOpen && (
        <div className="fixed inset-0 z-[2300] bg-black/40" onClick={() => setIsSkuOpen(false)}>
          <div
            className="absolute left-0 right-0 bottom-0 bg-white dark:bg-neutral-900 rounded-t-2xl border-t border-neutral-100 dark:border-neutral-800 shadow-modal px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-h-[74vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[16px] font-black text-neutral-900 dark:text-white">選擇卡片</div>
              <button
                type="button"
                onClick={() => setIsSkuOpen(false)}
                className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-200 grid place-items-center active:scale-95 transition-transform"
                aria-label="關閉"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {prizes.map((p, idx) => {
                const active = idx === selectedPrizeIndex;
                return (
                  <button
                    key={`${p.name}-${idx}`}
                    type="button"
                    onClick={() => {
                      setSelectedPrizeIndex(idx);
                      setSelectedQuantity(1);
                    }}
                    className={cn(
                      "w-full text-left rounded-xl px-3 py-2 flex items-center gap-3 active:scale-[0.99] transition-transform",
                      active
                        ? "border border-[#EE4D2D] bg-[#EE4D2D]/5"
                        : "bg-neutral-50 dark:bg-neutral-800/60"
                    )}
                  >
                    <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                      <Image src={String((p as any)?.image_url || listing.product.image)} alt={String(p.name || '')} fill className="object-cover" unoptimized />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-black text-neutral-900 dark:text-white truncate leading-[1.35]">
                        {p.name}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {!escrowEnabled && (
              <div className="mt-3 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13px] font-black text-neutral-500 dark:text-neutral-400">交易方式</div>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="h-9 px-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-[13px] font-black text-neutral-900 dark:text-white border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="transfer">轉帳</option>
                    <option value="private">私下交易</option>
                  </select>
                </div>
              </div>
            )}

            <div className="mt-3 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-black text-neutral-500 dark:text-neutral-400">購買數量</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedQuantity((q) => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-200 grid place-items-center active:scale-95 transition-transform disabled:opacity-50"
                    disabled={selectedQuantity <= 1}
                    aria-label="減少"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="min-w-12 text-center text-[16px] font-black font-amount text-neutral-900 dark:text-white">
                    {selectedQuantity}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const max = selectedPrize ? Math.max(1, Number(selectedPrize.remaining) || 1) : 1;
                      setSelectedQuantity((q) => Math.min(max, q + 1));
                    }}
                    className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-200 grid place-items-center active:scale-95 transition-transform disabled:opacity-50"
                    disabled={selectedPrize ? selectedQuantity >= Math.max(1, Number(selectedPrize.remaining) || 1) : true}
                    aria-label="增加"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Image src="/images/gcoin.png" alt="G Coin" width={18} height={18} className="w-[18px] h-[18px] object-contain" />
                <div className="text-[22px] font-black font-amount text-[#EE4D2D] tracking-tight">
                  {Math.round(selectedTotalPrice).toLocaleString()}
                </div>
              </div>
              <Button
                type="button"
                className="flex-1 h-[44px] text-base font-black rounded-xl"
                variant="danger"
                onClick={purchase}
                disabled={isPurchasing || isSoldOut || !selectedPrize}
              >
                {isPurchasing ? '處理中…' : escrowEnabled ? '去付款' : '確認下單'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-neutral-100 dark:border-neutral-800 h-auto min-h-16 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 flex items-center lg:hidden z-50 shadow-modal">
        <div className="flex items-center gap-4 w-full pb-2">
          <div className="flex flex-col items-start justify-center">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4">
                <Image src="/images/gcoin.png" alt="G Coin" width={16} height={16} className="w-full h-full object-contain" />
              </div>
              <span className="text-[24px] leading-none font-black font-amount text-[#EE4D2D] tracking-tight">
                {Math.round(minUnitPrice).toLocaleString()}
              </span>
              <span className="text-[12px] font-black text-neutral-400 dark:text-neutral-500 ml-0.5">起</span>
            </div>
            <div className="text-[11px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mt-1">
              最低價
            </div>
          </div>

          <Button
            type="button"
            size="lg"
            className={cn(
              "flex-1 h-[44px] text-base font-black rounded-xl shadow-xl transition-all active:scale-[0.95] flex items-center justify-center gap-2",
              isSoldOut ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-neutral-900/20" : "shadow-accent-red/20"
            )}
            variant={isSoldOut ? "secondary" : "danger"}
            onClick={openSku}
            disabled={isSoldOut}
          >
            {isSoldOut ? '已售出' : '立即購買'}
          </Button>
        </div>
      </div>

    </div>
  );
}
