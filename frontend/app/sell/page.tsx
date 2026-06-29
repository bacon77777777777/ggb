'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type UserDisplayRow = {
  id: string;
  name: string | null;
  avatar_url: string | null;
};

type SaleListing = {
  id: string;
  seller: { id: string; name: string; avatar: string };
  createdAt: string;
  price: number;
  product: {
    name: string;
    series: string;
    grade: string;
    image: string;
  };
};

const formatTwd = (amount: number) => `NT$${Math.round(amount).toLocaleString()}`;

export default function SellListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryFromUrl = useMemo(() => (searchParams?.get('search') || '').trim(), [searchParams]);
  const [query, setQuery] = useState(queryFromUrl);

  const [listings, setListings] = useState<SaleListing[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = window.setTimeout(() => {
      const trimmed = query.trim();
      const next = new URLSearchParams(searchParams?.toString());
      if (trimmed) next.set('search', trimmed);
      else next.delete('search');
      const qs = next.toString();
      router.replace(qs ? `/sell?${qs}` : '/sell');
    }, 500);
    return () => window.clearTimeout(t);
  }, [query, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (page === 0) setIsLoading(true);
      else setIsFetchingMore(true);
      try {
        const pageSize = 20;
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const supabase = createClient();
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
              images,
              items
            `
          )
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;

        const sellerIds = Array.from(
          new Set((rows || []).map((r: any) => String(r?.seller_id || '')).filter(Boolean))
        );

        const displayById = new Map<string, { name: string; avatar: string }>();
        if (sellerIds.length > 0) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: sellerIds });
          if (!displayError && Array.isArray(displays)) {
            for (const d of displays as unknown as UserDisplayRow[]) {
              const id = String(d?.id || '');
              if (!id) continue;
              displayById.set(id, {
                name: (d.name || 'user').toString(),
                avatar: (d.avatar_url || '/images/avatar.png').toString(),
              });
            }
          }
        }

        const mapped = (rows || []).map((r: any): SaleListing => {
          const sellerId = String(r?.seller_id || '');
          const d = displayById.get(sellerId);
          const title = String(r?.title || '').trim();
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
                price: Number(x?.price || 0),
              }))
            : [];
          const firstItemImage = items.map((x: any) => x.image).filter(Boolean)[0] || '';
          const mainImage = (imageCandidates[0] || firstItemImage || '/images/item.png') as string;
          const itemPrices = items.map((x: any) => Number(x?.price || 0)).filter((n: number) => Number.isFinite(n) && n > 0);
          const minPrice = itemPrices.length > 0 ? Math.min(...itemPrices) : Number(r?.price || 0);
          return {
            id: String(r?.id || ''),
            seller: {
              id: sellerId,
              name: d?.name || 'user',
              avatar: d?.avatar || '/images/avatar.png',
            },
            createdAt: String(r?.created_at || ''),
            price: minPrice,
            product: {
              name: title || (items[0]?.name ? String(items[0].name) : '販售商品'),
              grade: items[0]?.grade ? String(items[0].grade) : '',
              series: items[0]?.series ? String(items[0].series) : '',
              image: mainImage,
            },
          };
        });

        const nextHasMore = mapped.length === pageSize;
        if (cancelled) return;
        setHasMore(nextHasMore);
        setListings((prev) => (page === 0 ? mapped : [...prev, ...mapped]));
      } catch (e) {
        console.error('Failed to load sell listings:', e);
        if (!cancelled && page === 0) setListings([]);
        if (!cancelled) setHasMore(false);
      } finally {
        if (cancelled) return;
        setIsLoading(false);
        setIsFetchingMore(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey]);

  useEffect(() => {
    if (!hasMore) return;
    if (isLoading) return;
    if (isFetchingMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setPage((p) => p + 1);
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, isFetchingMore, isLoading]);

  const filteredListings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) => {
      if (l.seller.name.toLowerCase().includes(q)) return true;
      if (l.product.name.toLowerCase().includes(q)) return true;
      if (l.product.series.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [listings, query]);

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-24 transition-colors">
      <div className="fixed top-0 left-0 right-0 z-[100] bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 md:hidden">
        <div className="max-w-7xl mx-auto px-2 relative">
          <div className="flex items-center gap-3 h-[57px]">
            <div className="text-[18px] font-black text-neutral-900 dark:text-white">販售</div>
            <form
              className="flex-1 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋販售"
                  className={cn(
                    "w-full h-9 rounded-full pl-9 pr-9 text-[13px] font-black",
                    "bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white",
                    "border border-neutral-100 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  )}
                />
                {!!query.trim() && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPage(0);
                  setHasMore(true);
                  setListings([]);
                  setReloadKey((k) => k + 1);
                }}
                className="w-9 h-9 rounded-full grid place-items-center bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 text-neutral-500 active:scale-95 transition-transform"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="pt-[57px] md:pt-6 max-w-7xl mx-auto px-2">
        <div className="hidden md:flex items-center gap-3 mb-4">
          <div className="text-[22px] font-black text-neutral-900 dark:text-white">販售</div>
          <form className="flex-1 flex items-center gap-2" onSubmit={(e) => e.preventDefault()}>
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋販售"
                className={cn(
                  "w-full h-10 rounded-full pl-10 pr-10 text-[13px] font-black",
                  "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white",
                  "border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
                )}
              />
              {!!query.trim() && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setPage(0);
                setHasMore(true);
                setListings([]);
                setReloadKey((k) => k + 1);
              }}
              className="h-10 px-3 rounded-full grid place-items-center bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 active:scale-95 transition-transform"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
          {isLoading && listings.length === 0 ? (
            <div className="py-20 text-center text-[13px] font-black text-neutral-400">載入中</div>
          ) : filteredListings.length > 0 ? (
            filteredListings.map((l) => (
              <div
                key={l.id}
                className="text-left bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]"
              >
                <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                      <Image src={l.seller.avatar} alt={l.seller.name} fill className="object-cover" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-black text-neutral-900 dark:text-white truncate">@{l.seller.name}</div>
                    </div>
                  </div>
                  <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">
                    {l.createdAt ? new Date(l.createdAt).toLocaleDateString('zh-TW') : ''}
                  </div>
                </div>

                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="relative w-[64px] shrink-0 aspect-[5/7] rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                    <Image src={l.product.image} alt={l.product.name} fill className="object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-black text-neutral-900 dark:text-white truncate">{l.product.name}</div>
                    <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500 truncate">
                      {[l.product.series, l.product.grade].filter(Boolean).join(' · ')}
                    </div>
                    <div className="mt-2 text-[15px] font-black text-primary">{formatTwd(l.price)}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-20 text-center text-[13px] font-black text-neutral-400">目前沒有販售</div>
          )}
        </div>

        {hasMore && (
          <div ref={sentinelRef} className="py-8 text-center text-[12px] font-black text-neutral-400">
            {isFetchingMore ? '載入中' : '載入更多'}
          </div>
        )}
      </div>

    </div>
  );
}
