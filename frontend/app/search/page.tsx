'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Search, X, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import ProductCard from '@/components/ProductCard';
import type { Database } from '@/types/database.types';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import Link from 'next/link';
import Image from 'next/image';
import { cn, formatViewCount } from '@/lib/utils';

type ProductRow = Database['public']['Tables']['products']['Row'];

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const { flags } = useFeatureFlags();

  const searchStateKey = 'gachago:search_state';
  const searchRestoreKey = 'gachago:search_restore';
  const returnToKey = 'gachago:return_to';

  type PrimaryTabId = 'all' | 'sell' | 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom';

  type SaleListing = {
    id: string;
    createdAt: string;
    price: number;
    title: string;
    image: string;
    viewCount: number;
  };

  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allProducts, setAllProducts] = useState<ProductRow[]>([]);
  const [sellListings, setSellListings] = useState<SaleListing[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [hotKeywords, setHotKeywords] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const isRestoringRef = useRef(false);
  const restoringScrollRef = useRef<number | null>(null);
  const [activePrimaryTab, setActivePrimaryTab] = useState<PrimaryTabId>('all');
  const [activeSecondaryTab, setActiveSecondaryTab] = useState<'all' | 'hot' | 'new'>('all');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('searchHistory') : null;
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved));
      } catch {
        setSearchHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .neq('status', 'pending')
          .order('is_hot', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) {
          console.error('Error fetching products for search:', error);
          setAllProducts([]);
          setHotKeywords([]);
          return;
        }

        const rows = (data as ProductRow[]) || [];
        setAllProducts(rows);

        const keywords = Array.from(
          new Set(
            rows
              .map((p) => p.name?.trim())
              .filter((name): name is string => !!name)
          )
        ).slice(0, 12);
        setHotKeywords(keywords);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [supabase]);

  useEffect(() => {
    if (!flags.sell) {
      setSellListings([]);
      return;
    }

    const fetchSellListings = async () => {
      try {
        const selectWithViewCount = async () =>
          await supabase
            .from('sell_listings')
            .select('id, title, price, view_count, created_at, images, items, status')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(200);

        const selectWithoutViewCount = async () =>
          await supabase
            .from('sell_listings')
            .select('id, title, price, created_at, images, items, status')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(200);

        let data: any = null;
        let error: any = null;
        const r1 = await selectWithViewCount();
        data = r1.data;
        error = r1.error;
        if (error) {
          const msg = String((error as any)?.message || '');
          if (msg.includes('view_count') && msg.includes('sell_listings')) {
            const r2 = await selectWithoutViewCount();
            data = r2.data;
            error = r2.error;
          }
        }
        if (error) {
          setSellListings([]);
          return;
        }

        const rows = Array.isArray(data) ? (data as any[]) : [];
        const mapped: SaleListing[] = rows.map((r) => {
          const images = Array.isArray(r?.images) ? (r.images as string[]) : [];
          const items = Array.isArray(r?.items) ? (r.items as any[]) : [];
          const itemPrices = items.map((it) => Math.max(0, Number(it?.price) || 0)).filter((n) => n > 0);
          const minItemPrice = itemPrices.length ? Math.min(...itemPrices) : 0;
          const basePrice = Math.max(0, Number(r?.price) || 0);
          const finalPrice = minItemPrice > 0 ? minItemPrice : basePrice;
          return {
            id: String(r?.id ?? ''),
            createdAt: String(r?.created_at ?? ''),
            title: String(r?.title ?? ''),
            image: String(images[0] || ''),
            price: finalPrice,
            viewCount: Math.max(0, Math.floor(Number(r?.view_count ?? 0) || 0)),
          };
        }).filter((x) => x.id);

        setSellListings(mapped);
      } catch {
        setSellListings([]);
      }
    };

    fetchSellListings();
  }, [flags.sell, supabase]);

  const saveHistory = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const next = [trimmed, ...searchHistory.filter((h) => h !== trimmed)].slice(0, 10);
    setSearchHistory(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('searchHistory', JSON.stringify(next));
    }
  };

  const deleteHistoryItem = (term: string) => {
    const next = searchHistory.filter((h) => h !== term);
    setSearchHistory(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('searchHistory', JSON.stringify(next));
    }
  };

  const searchQueryParam = searchParams.get('q') || '';
  const focusParam = searchParams.get('focus') || '';

  useEffect(() => {
    setQuery(searchQueryParam);
  }, [searchQueryParam]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldRestore = sessionStorage.getItem(searchRestoreKey) === '1';
    if (!shouldRestore) return;
    const raw = sessionStorage.getItem(searchStateKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        scrollY?: number;
        visibleCount?: number;
        timestamp?: number;
      };
      const now = Date.now();
      const ts = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
      if (now - ts > 30 * 60 * 1000) {
        sessionStorage.removeItem(searchRestoreKey);
        return;
      }
      isRestoringRef.current = true;
      if (typeof parsed.visibleCount === 'number' && parsed.visibleCount > 0) {
        setVisibleCount(parsed.visibleCount);
      }
      restoringScrollRef.current = typeof parsed.scrollY === 'number' ? parsed.scrollY : null;
    } catch {
      sessionStorage.removeItem(searchRestoreKey);
    }
  }, []);

  useEffect(() => {
    // Check if we need to auto-focus based on navigation state or just mount
    // The user requested that clicking the search icon on navbar redirects here and focuses.
    // We can just focus on mount for mobile if query is empty to improve UX.
    // Or strictly follow the 'focus' param. 
    // Given the prompt "跳轉到 ... 並focus在搜尋框", let's ensure it focuses.
    if (!query) {
       // Small delay to ensure the element is ready and transition is done
       setTimeout(() => {
         inputRef.current?.focus();
       }, 100);
    }
  }, []);

  const trimmedQuery = query.trim();
  const visibleHistory = searchHistory.slice(0, 5);
  const showSuggestionPanel = isInputFocused && !trimmedQuery;

  useEffect(() => {
    if (isRestoringRef.current) return;
    setVisibleCount(10);
  }, [trimmedQuery]);

  const enabledPrimaryFeatureCount =
    (flags.sell ? 1 : 0) +
    (flags.ichiban ? 1 : 0) +
    (flags.blindbox ? 1 : 0) +
    (flags.gacha ? 1 : 0) +
    (flags.card ? 1 : 0) +
    (flags.custom ? 1 : 0);
  const hasAnyPrimaryFeature = enabledPrimaryFeatureCount > 0;
  const hidePrimaryTabs = enabledPrimaryFeatureCount < 2;
  const singlePrimaryTab: PrimaryTabId | null =
    enabledPrimaryFeatureCount === 1
      ? flags.sell
        ? 'sell'
        : flags.ichiban
          ? 'ichiban'
          : flags.blindbox
            ? 'blindbox'
            : flags.gacha
              ? 'gacha'
              : flags.card
                ? 'card'
                : flags.custom
                  ? 'custom'
                  : null
      : null;

  useEffect(() => {
    if (!singlePrimaryTab) return;
    if (activePrimaryTab !== singlePrimaryTab) setActivePrimaryTab(singlePrimaryTab);
  }, [activePrimaryTab, singlePrimaryTab]);

  useEffect(() => {
    if (hasAnyPrimaryFeature) return;
    if (activePrimaryTab !== 'all') setActivePrimaryTab('all');
  }, [activePrimaryTab, hasAnyPrimaryFeature]);

  const primaryTabs = useMemo(() => {
    const base: { id: PrimaryTabId; label: string }[] = [{ id: 'all', label: '精選' }];
    if (flags.sell) base.push({ id: 'sell', label: '販售' });
    if (flags.ichiban) base.push({ id: 'ichiban', label: '一番賞' });
    if (flags.blindbox) base.push({ id: 'blindbox', label: '盒玩' });
    if (flags.gacha) base.push({ id: 'gacha', label: '轉蛋' });
    if (flags.card) base.push({ id: 'card', label: '抽卡' });
    if (flags.custom) base.push({ id: 'custom', label: '自製賞' });
    return base;
  }, [flags.blindbox, flags.card, flags.custom, flags.gacha, flags.ichiban, flags.sell]);

  const secondaryTabs = useMemo(() => {
    return [
      { id: 'all' as const, label: '全部' },
      { id: 'hot' as const, label: '熱門' },
      { id: 'new' as const, label: '最新' },
    ];
  }, []);

  const filteredProducts = useMemo(() => {
    const base = trimmedQuery
      ? allProducts.filter((product) => {
          const name = product.name || '';
          return name.toLowerCase().includes(trimmedQuery.toLowerCase());
        })
      : allProducts;

    // 全部 tab 搜尋時不過濾 flag，確保熱門關鍵字能找到結果
    const filteredByFlags = activePrimaryTab === 'all'
      ? base
      : base.filter((p) => {
          const t = (p as any)?.type as string | null;
          if (!t) return true;
          if (t === 'ichiban') return flags.ichiban;
          if (t === 'blindbox') return flags.blindbox;
          if (t === 'gacha') return flags.gacha;
          if (t === 'card') return flags.card;
          if (t === 'custom') return flags.custom;
          return true;
        });

    const filteredByTab =
      activePrimaryTab === 'ichiban' ||
      activePrimaryTab === 'blindbox' ||
      activePrimaryTab === 'gacha' ||
      activePrimaryTab === 'card' ||
      activePrimaryTab === 'custom'
        ? filteredByFlags.filter((p) => String((p as any)?.type || '') === activePrimaryTab)
        : filteredByFlags;

    const sorted =
      activeSecondaryTab === 'new'
        ? [...filteredByTab].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        : activeSecondaryTab === 'hot'
          ? [...filteredByTab].sort((a, b) => Number((b as any)?.is_hot ? 1 : 0) - Number((a as any)?.is_hot ? 1 : 0))
          : filteredByTab;

    return sorted;
  }, [
    activePrimaryTab,
    activeSecondaryTab,
    allProducts,
    flags.blindbox,
    flags.card,
    flags.custom,
    flags.gacha,
    flags.ichiban,
    trimmedQuery,
  ]);

  const filteredSellListings = useMemo(() => {
    if (!flags.sell) return [];
    if (activePrimaryTab !== 'all' && activePrimaryTab !== 'sell') return [];
    const base = trimmedQuery
      ? sellListings.filter((l) => l.title.toLowerCase().includes(trimmedQuery.toLowerCase()))
      : sellListings;
    const sorted =
      activeSecondaryTab === 'new'
        ? [...base].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        : base;
    return sorted;
  }, [activePrimaryTab, activeSecondaryTab, flags.sell, sellListings, trimmedQuery]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const y = restoringScrollRef.current;
    if (y === null) return;
    if (isLoading) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, left: 0, behavior: 'auto' });
        restoringScrollRef.current = null;
        isRestoringRef.current = false;
        sessionStorage.removeItem(searchRestoreKey);
      });
    });
  }, [isLoading, visibleCount, filteredProducts.length]);

  const persistSearchState = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.pathname}${window.location.search}`;
    sessionStorage.setItem(searchStateKey, JSON.stringify({
      scrollY: window.scrollY,
      visibleCount,
      timestamp: Date.now(),
    }));
    sessionStorage.setItem(searchRestoreKey, '1');
    sessionStorage.setItem(returnToKey, JSON.stringify({
      url,
      timestamp: Date.now(),
    }));
  }, [visibleCount]);

  const handleSearchSubmit = (value?: string) => {
    const raw = (typeof value === 'string' ? value : query).trim();
    const params = new URLSearchParams(searchParams.toString());

    if (!raw) {
      setQuery('');
      setIsInputFocused(false);
      params.delete('q');
      params.delete('focus');
      const qs = params.toString();
      router.push(qs ? `/search?${qs}` : '/search');
      return;
    }

    setQuery(raw);
    saveHistory(raw);
    setIsInputFocused(false);

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    if (baseUrl) {
      try {
        void fetch(`${baseUrl}/api/stats/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: raw,
            user_id: null,
            metadata: { source: 'search' },
          }),
          keepalive: true,
        });
      } catch {
      }
    }

    params.set('q', raw);
    params.delete('focus');
    router.push(`/search?${params.toString()}`);
  };

  const mobileTitle = trimmedQuery ? `搜尋「${trimmedQuery}」的結果` : '猜你喜歡';
  const mobileCountLabel = useMemo(() => {
    if (!hasAnyPrimaryFeature) return '0 個結果';
    if (activePrimaryTab === 'sell') return `${filteredSellListings.length} 個結果`;
    if (activePrimaryTab === 'all') return `${filteredProducts.length + filteredSellListings.length} 個結果`;
    return `${filteredProducts.length} 個結果`;
  }, [activePrimaryTab, filteredProducts.length, filteredSellListings.length, hasAnyPrimaryFeature]);

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-20 transition-colors">
      <div className="sticky top-0 z-50 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 md:hidden">
        <div className="max-w-7xl mx-auto px-2 relative">
          <div className="flex items-center gap-3 h-[57px]">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="p-2 rounded-full text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2]" />
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchSubmit();
              }}
              className="flex-1 flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 stroke-[2.5]" />
                <input
                  ref={inputRef}
                  value={query}
                  onFocus={() => setIsInputFocused(true)}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="曾經搜尋平凡的商品"
                  className="w-full h-10 bg-neutral-100 dark:bg-neutral-800 rounded-full pl-9 pr-8 text-[16px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  inputMode="search"
                />
                <button
                  type="button"
                  onClick={() => {
                    handleSearchSubmit('');
                    setIsInputFocused(false);
                    inputRef.current?.blur();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
              <button
                type="submit"
                className="px-3 h-9 rounded-full bg-primary text-white text-[12px] font-black whitespace-nowrap active:scale-95 transition-transform"
              >
                搜尋
              </button>
            </form>
          </div>

          {hasAnyPrimaryFeature && (
            <div className="pb-2">
              {!hidePrimaryTabs && (
                <Tabs value={activePrimaryTab} onValueChange={(val) => setActivePrimaryTab(val as PrimaryTabId)} className="w-full">
                  <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b border-neutral-100 dark:border-neutral-800 pb-0">
                    {primaryTabs.map((tab) => (
                      <TabsTrigger key={tab.id} value={tab.id}>
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}

              <div className="flex items-center gap-1.5 pt-2 px-0">
                <div className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide">
                  <div className="flex items-center gap-1.5">
                    {secondaryTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveSecondaryTab(tab.id)}
                        className={cn(
                          "px-3 py-1 rounded-full text-[12px] font-black whitespace-nowrap transition-colors",
                          activeSecondaryTab === tab.id
                            ? "bg-primary text-white"
                            : "bg-neutral-100 text-neutral-600"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {showSuggestionPanel && (
            <div className="absolute left-0 right-0 top-[57px] bottom-[-100vh] z-50 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
              <div className="h-[calc(100vh-57px)] overflow-y-auto pb-24">
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800 px-4">
                  {visibleHistory.map((term) => (
                    <div
                      key={term}
                      className="flex items-center justify-between py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleSearchSubmit(term)}
                        className="flex items-center gap-2 text-left flex-1"
                      >
                        <History className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">
                          {term}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteHistoryItem(term);
                        }}
                        className="ml-2 text-[11px] font-black text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                      >
                        清除
                      </button>
                    </div>
                  ))}

                  {hotKeywords.length > 0 && (
                    <div className="pt-2 pb-1 text-[11px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
                      熱門搜尋
                    </div>
                  )}

                  {hotKeywords.map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => handleSearchSubmit(kw)}
                      className="w-full py-2.5 text-left text-[13px] font-black text-primary"
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 pt-3 space-y-4">
        <div className="mt-1 md:hidden">
          <div className="mb-2 px-0.5">
            <h2 className="text-[14px] sm:text-[15px] font-black text-neutral-900 dark:text-white tracking-tight leading-snug">
              {mobileTitle}
            </h2>
            <span className="text-[11px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mt-0.5 block">
              {isLoading ? '載入中...' : mobileCountLabel}
            </span>
          </div>

          {!hasAnyPrimaryFeature && !isLoading ? (
            <div className="py-10 text-center text-[13px] text-neutral-400 font-bold">
              目前沒有開啟任何功能
            </div>
          ) : activePrimaryTab === 'sell' ? (
            filteredSellListings.length === 0 && !isLoading ? (
              <div className="py-10 text-center text-[13px] text-neutral-400 font-bold">
                {trimmedQuery ? '找不到相關販售，試試其他關鍵字' : '目前沒有販售'}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                  {filteredSellListings.slice(0, visibleCount).map((listing) => (
                    <Link
                      key={`sell:${listing.id}`}
                      href={`/sell/${listing.id}`}
                      className="group block h-full bg-white dark:bg-neutral-900 rounded-[8px] border border-neutral-100 dark:border-neutral-800 overflow-hidden text-left"
                      onClick={persistSearchState}
                    >
                      <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                        <Image src={listing.image || '/images/default.png'} alt={listing.title} fill className="object-cover" unoptimized />
                      </div>

                      <div className="flex flex-col p-2">
                        <div className="mb-1 h-[2.75rem]">
                          <h3 className="text-[14px] font-normal text-neutral-900 dark:text-white line-clamp-2 leading-[1.25] break-all">
                            <span className="inline-flex align-middle mr-1 relative -top-[0.1rem] h-4 px-1 text-[8px] font-medium text-white rounded-[4px] shadow-lg uppercase tracking-wider items-center backdrop-blur-sm bg-opacity-90 bg-[#EE4D2D] shadow-[#EE4D2D]/20">
                              販售
                            </span>
                            <span className="inline">{listing.title}</span>
                          </h3>
                        </div>

                        <div className="mt-auto pt-2 border-t border-neutral-100 dark:border-neutral-800">
                          <div className="flex items-end justify-between gap-1">
                            <div className="flex items-center gap-1">
                              <div className="w-3.5 h-3.5">
                                <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="w-full h-full object-contain" />
                              </div>
                              <span className="text-[24px] leading-none font-black font-amount text-[#EE4D2D] tracking-tight">
                                {Math.round(listing.price).toLocaleString()}
                              </span>
                            </div>
                            {listing.viewCount > 0 && (
                              <div className="text-[12px] font-black text-neutral-400">{formatViewCount(listing.viewCount)}瀏覽</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                {visibleCount < filteredSellListings.length && (
                  <div className="flex justify-center mt-4">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((c) => c + 10)}
                      className="px-4 py-2 text-[13px] font-black text-primary bg-primary/5 rounded-full hover:bg-primary/10 transition-colors"
                    >
                      載入更多
                    </button>
                  </div>
                )}
              </>
            )
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                {activePrimaryTab === 'all'
                  ? (() => {
                      const mixed: Array<
                        | { kind: 'product'; item: ProductRow }
                        | { kind: 'sell'; item: SaleListing }
                      > = [];
                      let inserted = 0;
                      let productCount = 0;

                      for (const product of filteredProducts.slice(0, visibleCount)) {
                        mixed.push({ kind: 'product', item: product });
                        productCount += 1;

                        if (filteredSellListings.length > inserted && productCount % 4 === 0) {
                          mixed.push({ kind: 'sell', item: filteredSellListings[inserted] });
                          inserted += 1;
                        }
                      }

                      for (; inserted < filteredSellListings.length && mixed.length < visibleCount; inserted += 1) {
                        mixed.push({ kind: 'sell', item: filteredSellListings[inserted] });
                      }

                      return mixed.map((row) => {
                        if (row.kind === 'sell') {
                          const listing = row.item;
                          return (
                            <Link
                              key={`sell:${listing.id}`}
                              href={`/sell/${listing.id}`}
                              className="group block h-full bg-white dark:bg-neutral-900 rounded-[8px] border border-neutral-100 dark:border-neutral-800 overflow-hidden text-left"
                              onClick={persistSearchState}
                            >
                              <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                                <Image src={listing.image || '/images/default.png'} alt={listing.title} fill className="object-cover" unoptimized />
                              </div>

                              <div className="flex flex-col p-2">
                                <div className="mb-1 h-[2.75rem]">
                                  <h3 className="text-[14px] font-normal text-neutral-900 dark:text-white line-clamp-2 leading-[1.25] break-all">
                                    <span className="inline-flex align-middle mr-1 relative -top-[0.1rem] h-4 px-1 text-[8px] font-medium text-white rounded-[4px] shadow-lg uppercase tracking-wider items-center backdrop-blur-sm bg-opacity-90 bg-[#EE4D2D] shadow-[#EE4D2D]/20">
                                      販售
                                    </span>
                                    <span className="inline">{listing.title}</span>
                                  </h3>
                                </div>

                                <div className="mt-auto pt-2 border-t border-neutral-100 dark:border-neutral-800">
                                  <div className="flex items-end justify-between gap-1">
                                    <div className="flex items-center gap-1">
                                      <div className="w-3.5 h-3.5">
                                        <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="w-full h-full object-contain" />
                                      </div>
                                      <span className="text-[24px] leading-none font-black font-amount text-[#EE4D2D] tracking-tight">
                                        {Math.round(listing.price).toLocaleString()}
                                      </span>
                                    </div>
                                    {listing.viewCount > 0 && (
                                      <div className="text-[12px] font-black text-neutral-400">{formatViewCount(listing.viewCount)}瀏覽</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Link>
                          );
                        }

                        const product = row.item;
                        return (
                          <ProductCard
                            key={product.id}
                            id={product.id.toString()}
                            name={product.name}
                            image={product.image_url || ''}
                            price={product.price}
                            remaining={product.remaining}
                            total={product.total_count}
                            isHot={product.is_hot}
                            type={product.type}
                            status={product.status}
                            onNavigate={persistSearchState}
                          />
                        );
                      });
                    })()
                  : filteredProducts.slice(0, visibleCount).map((product) => (
                      <ProductCard
                        key={product.id}
                        id={product.id.toString()}
                        name={product.name}
                        image={product.image_url || ''}
                        price={product.price}
                        remaining={product.remaining}
                        total={product.total_count}
                        isHot={product.is_hot}
                        type={product.type}
                        status={product.status}
                        onNavigate={persistSearchState}
                      />
                    ))}
              </div>
              {visibleCount < filteredProducts.length && (
                <div className="flex justify-center mt-4">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 10)}
                    className="px-4 py-2 text-[13px] font-black text-primary bg-primary/5 rounded-full hover:bg-primary/10 transition-colors"
                  >
                    載入更多
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="hidden md:block">
          <div className="mt-1">
            <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight px-0.5 mb-1.5">
              {mobileTitle}
            </h1>
            <div className="px-0.5 text-xs font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
              {isLoading ? (
                '載入中...'
              ) : (
                <>
                  <span className="font-amount">
                    {filteredProducts.length.toLocaleString()}
                  </span>{' '}
                  個商品
                </>
              )}
            </div>

            {filteredProducts.length === 0 && !isLoading ? (
              <div className="py-10 text-center text-[13px] text-neutral-400 font-bold">
                {trimmedQuery ? '找不到相關商品，試試其他關鍵字' : '目前沒有商品'}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                  {filteredProducts.slice(0, visibleCount).map((product) => (
                    <ProductCard
                      key={product.id}
                      id={product.id.toString()}
                      name={product.name}
                      image={product.image_url || ''}
                      price={product.price}
                      remaining={product.remaining}
                      total={product.total_count}
                      isHot={product.is_hot}
                      type={product.type}
                      status={product.status}
                      onNavigate={persistSearchState}
                    />
                  ))}
                </div>
                {visibleCount < filteredProducts.length && (
                  <div className="flex justify-center mt-4">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((c) => c + 10)}
                      className="px-4 py-2 text-[13px] font-black text-primary bg-primary/5 rounded-full hover:bg-primary/10 transition-colors"
                    >
                      載入更多
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
