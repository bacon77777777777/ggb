'use client';
// v3
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Database } from '@/types/database.types';
import ProductCard from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/ProductCardSkeleton';
import { BannerSkeleton } from '@/components/Skeletons';
import HeroBanner from '@/components/HeroBanner';
import WinningMarquee from '@/components/WinningMarquee';
import { createClient } from '@/lib/supabase/client';
import { cn, formatViewCount } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import Image from 'next/image';
import ProductBadge, { ProductType } from '@/components/ui/ProductBadge';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { trackPageView, trackScrollDepth, trackEvent } from '@/lib/trackEvent';

type ProductRow = Database['public']['Tables']['products']['Row'];
type BannerRow = Database['public']['Tables']['banners']['Row'];

type SortMode = 'latest' | 'price-asc' | 'price-desc' | 'sold-out';

export default function Home() {
  const homeRestoreKey = 'gachago:home_restore';
  const homeStateKey = 'gachago:home_state';

  const [allProducts, setAllProducts] = useState<ProductRow[]>([]);
  const [banners, setBanners] = useState<Database['public']['Tables']['banners']['Row'][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());
  const { flags } = useFeatureFlags();
  const { user } = useAuth();
  // Map<series, score> — populated from get_user_series_preferences RPC
  const [userSeriesPref, setUserSeriesPref] = useState<Map<string, number>>(new Map());
  // Map<series, score> — global platform popularity (used as default for new users)
  const [globalSeriesPop, setGlobalSeriesPop] = useState<Map<string, number>>(new Map());
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

  const fetchData = useCallback(async () => {
    const LOAD_TIMEOUT_MS = 10000;
    console.log('[Home] Fetching data...');
    console.log('[Home] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 20) + '...');
    const startTime = Date.now();

    const withTimeout = async <T,>(p: PromiseLike<T>, label: string) => {
      const startTime = Date.now();
      try {
        const result = await Promise.race<T>([
          Promise.resolve(p),
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout fetching ${label}`)), LOAD_TIMEOUT_MS))
        ]);
        console.log(`[Home] Fetch ${label} took ${Date.now() - startTime}ms`);
        return result;
      } catch (error) {
        throw error;
      }
    };

    try {
      setIsLoading(true);
      setLoadError(null);

      console.log('[Home] Starting data fetch...');

      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        setLoadError('Supabase 設定缺失，請檢查 .env.local');
        return;
      }
      
      // Independent fetch handling to ensure partial data loading
      let productsData: ProductRow[] = [];
      let bannersData: BannerRow[] = [];
      let productsError = null;

      // Fetch Products
      try {
        type RawProductRow = ProductRow & { original_price?: number | string | null };
        type ProductsQueryResult = {
          data: RawProductRow[] | null;
          error: unknown;
        };

        const result = await withTimeout(
          supabase
            .from('products')
            .select('*')
            .neq('status', 'pending')
            .order('created_at', { ascending: false }) as unknown as Promise<ProductsQueryResult>,
          'products'
        );
        
        const { data, error } = result;
        
        if (error) throw error;
        
        productsData = (data || []).map((p) => ({
          ...p,
          price: Number(p.price),
          original_price: p.original_price != null ? Number(p.original_price) : undefined,
          total_count: Number(p.total_count),
          remaining: Number(p.remaining),
        }));
      } catch (err) {
        console.warn('[Home] Products fetch failed:', err);
        productsError = err;
      }

      // Fetch Banners (Non-blocking for products)
      try {
        type BannersQueryResult = {
          data: BannerRow[] | null;
          error: unknown;
        };

        const result = await withTimeout(
          supabase
            .from('banners')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }) as unknown as Promise<BannersQueryResult>,
          'banners'
        );
        
        const { data, error } = result;
        
        if (!error) {
          bannersData = data || [];
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('timeout fetching banners')) {
          console.warn('[Home] Banners fetch timed out');
        } else {
          console.warn('[Home] Banners fetch failed:', err);
        }
        // Banners error is non-critical
      }

      // Fetch Menus (Categories)
      try {
        const { data, error } = await withTimeout(
          supabase
            .from('categories')
            .select('id, name')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }) as unknown as Promise<{ data: Array<{ id: string; name: string }> | null; error: unknown }>,
          'menus'
        );
        if (!error) {
          setMenus((data || []).map((m) => ({ id: m.id, name: m.name })));
        }
      } catch (err) {
        console.warn('[Home] Menus fetch failed:', err);
      }

      setAllProducts(productsData);
      setBanners(bannersData);

      if (productsError) {
        setLoadError('無法載入商品列表，請檢查網路連線');
      }

      console.log(`[Home] Data fetch complete in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoadError('載入失敗，請重試');
    } finally {
      console.log('[Home] Setting isLoading to false');
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const c1 = trackPageView();
    const c2 = trackScrollDepth();
    return () => { c1(); c2(); };
  }, []);

  // Fetch global platform popularity (for all users, used as default sort)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_popular_series');
        if (cancelled || !Array.isArray(data)) return;
        const map = new Map<string, number>();
        for (const row of data as Array<{ series: string; score: number }>) {
          if (row.series) map.set(row.series, Number(row.score) || 0);
        }
        setGlobalSeriesPop(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // Fetch personalized series preferences for logged-in users
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_user_series_preferences', {
          p_user_id: user.id,
          p_limit: 10,
        });
        if (cancelled || !Array.isArray(data)) return;
        const map = new Map<string, number>();
        for (const row of data as Array<{ series: string; score: number }>) {
          if (row.series) map.set(row.series, Number(row.score) || 0);
        }
        setUserSeriesPref(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user?.id, supabase]);

  // Fallback timeout to ensure we don't stuck in loading state forever
  useEffect(() => {
    if (!isLoading) return;
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        console.warn('[Home] Fallback timeout triggered');
        setIsLoading(false);
        setLoadError((prev) => prev || '載入逾時，請檢查網路連線');
      }
    }, 6000); // 6s fallback (slightly longer than fetch timeout)
    return () => clearTimeout(timeoutId);
  }, [isLoading]);

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleRealtimeUpdate = () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        fetchData();
      }, 2000);
    };

    const channel = supabase
      .channel('realtime-products-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleRealtimeUpdate)
      .on('broadcast', { event: 'products_updated' }, handleRealtimeUpdate)
      .subscribe();

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchData]);

  type PrimaryTabId =
    | 'all'
    | 'exchange'
    | 'sell'
    | 'ichiban'
    | 'blindbox'
    | 'gacha'
    | 'card'
    | 'custom'
    | `menu:${string}`;

  const [activePrimaryTab, setActivePrimaryTab] = useState<PrimaryTabId>('all');
  const [direction, setDirection] = useState(0);
  const [activeSecondaryTab, setActiveSecondaryTab] = useState<string>('featured');
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [sellSortMode, setSellSortMode] = useState<SortMode>('latest');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [menus, setMenus] = useState<Array<{ id: string; name: string }>>([]);
  const [menuProductIdsByMenuId, setMenuProductIdsByMenuId] = useState<Record<string, number[]>>({});

  type SaleListing = {
    id: string;
    seller: { id: string; name: string; avatar: string };
    createdAt: string;
    price: number;
    viewCount: number;
    product: { name: string; series: string; grade: string; image: string; type?: ProductType };
  };

  const [sellListings, setSellListings] = useState<SaleListing[]>([]);
  const [isSellListingsLoading, setIsSellListingsLoading] = useState(false);
  const [sellPage, setSellPage] = useState(0);
  const [sellHasMore, setSellHasMore] = useState(true);
  const [isSellFetchingMore, setIsSellFetchingMore] = useState(false);
  const sellSentinelRef = useRef<HTMLDivElement | null>(null);
  const secondaryTabsRef = useRef<HTMLDivElement>(null);
  const restoringSecondaryTabRef = useRef<string | null>(null);
  const restoringScrollRef = useRef<number | null>(null);
  const [homeDisplayCount, setHomeDisplayCount] = useState(10);
  const homeSentinelRef = useRef<HTMLDivElement>(null);

  const featuredSellCards = useMemo(() => {
    if (!flags.sell) return [];
    return sellListings.slice(0, 6);
  }, [flags.sell, sellListings]);

  useEffect(() => {
    if (secondaryTabsRef.current) {
      const activeTabElement = secondaryTabsRef.current.querySelector(`[data-tab-id="${activeSecondaryTab}"]`);
      if (activeTabElement) {
        activeTabElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [activeSecondaryTab]);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldRestore = sessionStorage.getItem(homeRestoreKey) === '1';
    if (!shouldRestore) return;
    const raw = sessionStorage.getItem(homeStateKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        activePrimaryTab?: PrimaryTabId;
        activeSecondaryTab?: string;
        sortMode?: SortMode;
        priceMin?: string;
        priceMax?: string;
        scrollY?: number;
        timestamp?: number;
      };
      const now = Date.now();
      const ts = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
      if (now - ts > 30 * 60 * 1000) {
        sessionStorage.removeItem(homeRestoreKey);
        return;
      }
      if (parsed.activeSecondaryTab) {
        restoringSecondaryTabRef.current = parsed.activeSecondaryTab;
      }
      restoringScrollRef.current = typeof parsed.scrollY === 'number' ? parsed.scrollY : null;
      if (parsed.sortMode) setSortMode(parsed.sortMode);
      if (typeof parsed.priceMin === 'string') setPriceMin(parsed.priceMin);
      if (typeof parsed.priceMax === 'string') setPriceMax(parsed.priceMax);
      if (parsed.activePrimaryTab && parsed.activePrimaryTab !== 'exchange')
        setActivePrimaryTab(parsed.activePrimaryTab);
      if (parsed.activeSecondaryTab) setActiveSecondaryTab(parsed.activeSecondaryTab);
    } catch {
      sessionStorage.removeItem(homeRestoreKey);
    }
  }, []);

  const primaryTabs: { id: PrimaryTabId; label: string }[] = useMemo(() => {
    const base: { id: PrimaryTabId; label: string }[] = [{ id: 'all', label: '綜合' }];
    if (flags.sell) base.push({ id: 'sell', label: '販售' });
    if (flags.ichiban) base.push({ id: 'ichiban', label: '一番賞' });
    if (flags.blindbox) base.push({ id: 'blindbox', label: '盒玩' });
    if (flags.gacha) base.push({ id: 'gacha', label: '轉蛋' });
    if (flags.card) base.push({ id: 'card', label: '抽卡' });
    if (flags.custom) base.push({ id: 'custom', label: '自製賞' });
    const menuTabs = menus.map((m) => ({ id: `menu:${m.id}` as PrimaryTabId, label: m.name }));
    return [...base, ...menuTabs];
  }, [flags.blindbox, flags.card, flags.custom, flags.gacha, flags.ichiban, flags.sell, menus]);

  useEffect(() => {
    const disabled =
      (activePrimaryTab === 'sell' && !flags.sell) ||
      (activePrimaryTab === 'ichiban' && !flags.ichiban) ||
      (activePrimaryTab === 'blindbox' && !flags.blindbox) ||
      (activePrimaryTab === 'gacha' && !flags.gacha) ||
      (activePrimaryTab === 'card' && !flags.card) ||
      (activePrimaryTab === 'custom' && !flags.custom);
    if (!disabled) return;
    if (singlePrimaryTab) {
      setActivePrimaryTab(singlePrimaryTab);
      return;
    }
    setActivePrimaryTab('all');
  }, [activePrimaryTab, flags.blindbox, flags.card, flags.custom, flags.gacha, flags.ichiban, flags.sell, singlePrimaryTab]);

  useEffect(() => {
    if (!singlePrimaryTab) return;
    if (activePrimaryTab !== singlePrimaryTab) setActivePrimaryTab(singlePrimaryTab);
  }, [activePrimaryTab, singlePrimaryTab]);

  useEffect(() => {
    if (hasAnyPrimaryFeature) return;
    if (activePrimaryTab !== 'all') setActivePrimaryTab('all');
  }, [activePrimaryTab, hasAnyPrimaryFeature]);

  useEffect(() => {
    if (!activePrimaryTab.startsWith('menu:')) return;
    const menuId = activePrimaryTab.slice('menu:'.length);
    if (!menuId || menuProductIdsByMenuId[menuId]) return;
    const fetchProductIds = async () => {
      const { data, error } = await supabase
        .from('menu_products')
        .select('product_id')
        .eq('menu_id', menuId)
        .order('sort_order', { ascending: false });
      if (error) return;
      const rows = (data || []) as Array<{ product_id: number }>;
      const ids = rows
        .map((r) => Number(r.product_id))
        .filter((n: number) => Number.isFinite(n));
      setMenuProductIdsByMenuId((prev) => ({ ...prev, [menuId]: Array.from(new Set(ids)) }));
    };
    fetchProductIds();
  }, [activePrimaryTab, supabase, menuProductIdsByMenuId]);

  const filterByPrimaryTab = useCallback(
    (products: ProductRow[]) => {
      return products.filter((product) => {
        if (activePrimaryTab === 'all') {
          const t = String(product.type || '').trim();
          if (t === 'ichiban') return Boolean(flags.ichiban);
          if (t === 'blindbox') return Boolean(flags.blindbox);
          if (t === 'gacha') return Boolean(flags.gacha);
          if (t === 'card') return Boolean(flags.card);
          if (t === 'custom') return Boolean(flags.custom);
          return true;
        }

        if (activePrimaryTab.startsWith('menu:')) {
          const menuId = activePrimaryTab.slice('menu:'.length);
          const ids = menuProductIdsByMenuId[menuId];
          if (!ids) return false;
          return ids.includes(Number(product.id));
        }

        if (activePrimaryTab === 'card') {
          const category = product.category || '';
          if (product.type === 'card') return true;
          return category.includes('卡') || category.toLowerCase().includes('card');
        }

        return product.type === activePrimaryTab;
      });
    },
    [activePrimaryTab, flags.blindbox, flags.card, flags.custom, flags.gacha, flags.ichiban, menuProductIdsByMenuId]
  );

  // Series tabs: personal prefs → global popularity → product count
  // Only include series from products in the current primary tab
  const seriesTabs = useMemo(() => {
    const tabProducts = filterByPrimaryTab(allProducts);
    const counts = new Map<string, number>();
    for (const p of tabProducts) {
      const s = p.series;
      if (s && typeof s === 'string' && s.trim()) {
        counts.set(s.trim(), (counts.get(s.trim()) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => {
        const prefDiff = (userSeriesPref.get(b[0]) || 0) - (userSeriesPref.get(a[0]) || 0);
        if (prefDiff !== 0) return prefDiff;
        const popDiff = (globalSeriesPop.get(b[0]) || 0) - (globalSeriesPop.get(a[0]) || 0);
        if (popDiff !== 0) return popDiff;
        return b[1] - a[1];
      })
      .slice(0, 14)
      .map(([s]) => ({
        id: `series:${s}`,
        label: s.length > 8 ? s.slice(0, 8) : s,
      }));
  }, [allProducts, filterByPrimaryTab, userSeriesPref, globalSeriesPop]);

  const secondaryTabs = useMemo(() => {
    if (activePrimaryTab === 'exchange') {
      return [
        { id: 'all', label: '全部' },
        { id: 'new', label: '最新' },
      ];
    }
    if (activePrimaryTab === 'sell') {
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const l of sellListings) {
        const s = String(l?.product?.series || '').trim();
        if (!s) continue;
        if (seen.has(s)) continue;
        seen.add(s);
        ordered.push(s);
        if (ordered.length >= 14) break;
      }
      return [
        { id: 'featured', label: '推薦' },
        ...ordered.map((s) => ({ id: `series:${s}`, label: s.length > 8 ? s.slice(0, 8) : s })),
      ];
    }
    // Default: 精選 + series tabs derived from product data
    return [{ id: 'featured', label: '推薦' }, ...seriesTabs];
  }, [activePrimaryTab, sellListings, seriesTabs]);

  useEffect(() => {
    if (activePrimaryTab === 'exchange') setActivePrimaryTab('all');
    if (restoringSecondaryTabRef.current) {
      setActiveSecondaryTab(restoringSecondaryTabRef.current);
      restoringSecondaryTabRef.current = null;
      return;
    }
    setActiveSecondaryTab('featured');
  }, [activePrimaryTab]);

  const handlePriceChange = (value: string, setter: (val: string) => void) => {
    const raw = value.replace(/\D/g, '');
    if (!raw) {
      setter('');
      return;
    }
    setter(parseInt(raw, 10).toLocaleString());
  };

  const applySortAndFilter = useCallback(
    (products: ProductRow[]) => {
      const base = filterByPrimaryTab(products);
      let result = [...base];

      if (activeSecondaryTab.startsWith('series:')) {
        const seriesName = activeSecondaryTab.slice('series:'.length);
        result = result.filter((p) => p.series === seriesName);
      }

      if (sortMode === 'sold-out') {
        result = result.filter(
          (p) =>
            (typeof p.remaining === 'number' && p.remaining <= 0) ||
            p.status === 'ended'
        );
      }

      const parsePrice = (val: string) => {
        if (!val) return null;
        const raw = val.replace(/\D/g, '');
        if (!raw) return null;
        return parseInt(raw, 10);
      };

      const min = parsePrice(priceMin);
      const max = parsePrice(priceMax);

      if (min !== null || max !== null) {
        result = result.filter((p) => {
          if (min !== null && p.price < min) return false;
          if (max !== null && p.price > max) return false;
          return true;
        });
      }

      if (sortMode === 'price-asc') {
        result.sort((a, b) => a.price - b.price);
      } else if (sortMode === 'price-desc') {
        result.sort((a, b) => b.price - a.price);
      } else if (activeSecondaryTab === 'featured') {
        const prefMap = userSeriesPref.size > 0 ? userSeriesPref : globalSeriesPop;
        if (prefMap.size > 0) {
          result.sort((a, b) => {
            const scoreA = prefMap.get(a.series || '') || 0;
            const scoreB = prefMap.get(b.series || '') || 0;
            if (scoreA !== scoreB) return scoreB - scoreA;
            if (a.is_hot !== b.is_hot) return b.is_hot ? 1 : -1;
            const da = a.created_at ? new Date(a.created_at).getTime() : 0;
            const db = b.created_at ? new Date(b.created_at).getTime() : 0;
            return db - da;
          });
        } else {
          result.sort((a, b) => {
            if (a.is_hot !== b.is_hot) return b.is_hot ? 1 : -1;
            const da = a.created_at ? new Date(a.created_at).getTime() : 0;
            const db = b.created_at ? new Date(b.created_at).getTime() : 0;
            return db - da;
          });
        }
      }

      if (sortMode !== 'sold-out') {
        const isEndedOrSoldOut = (p: ProductRow) =>
          (typeof p.remaining === 'number' && p.remaining <= 0) || p.status === 'ended'
        const activeProducts = result.filter((p) => !isEndedOrSoldOut(p))
        const endedProducts = result.filter((p) => isEndedOrSoldOut(p))
        result = [...activeProducts, ...endedProducts]
      }

      return result;
    },
    [filterByPrimaryTab, sortMode, priceMin, priceMax, activeSecondaryTab, userSeriesPref, globalSeriesPop]
  );

  const filteredProducts = useMemo(
    () => applySortAndFilter(allProducts),
    [allProducts, applySortAndFilter]
  );

  // Home page lazy load — reset on tab change
  useEffect(() => {
    setHomeDisplayCount(10);
  }, [activePrimaryTab, activeSecondaryTab]);

  // Home page lazy load — window scroll
  useEffect(() => {
    const total = filteredProducts.length;
    if (total === 0) return;
    const handleScroll = () => {
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200) {
        setHomeDisplayCount(prev => prev < total ? prev + 10 : prev);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [filteredProducts.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const y = restoringScrollRef.current;
    if (y === null) return;
    if (isLoading) return;
    if (loadError) return;
    const shouldRestore = sessionStorage.getItem(homeRestoreKey) === '1';
    if (!shouldRestore) {
      restoringScrollRef.current = null;
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, left: 0, behavior: 'auto' });
        restoringScrollRef.current = null;
        sessionStorage.removeItem(homeRestoreKey);
      });
    });
  }, [isLoading, loadError, filteredProducts.length]);

  const persistHomeState = useCallback(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      activePrimaryTab,
      activeSecondaryTab,
      sortMode,
      priceMin,
      priceMax,
      scrollY: window.scrollY,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(homeStateKey, JSON.stringify(payload));
    sessionStorage.setItem(homeRestoreKey, '1');
  }, [activePrimaryTab, activeSecondaryTab, sortMode, priceMin, priceMax]);

  const handlePrimaryTabChange = (newTabId: PrimaryTabId) => {
    if (newTabId === activePrimaryTab) return;
    const oldIndex = primaryTabs.findIndex((t) => t.id === activePrimaryTab);
    const newIndex = primaryTabs.findIndex((t) => t.id === newTabId);
    setDirection(newIndex > oldIndex ? 1 : -1);
    setActivePrimaryTab(newTabId);
    setActiveSecondaryTab('all');
  };

  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
  };

  const handleDragEnd = (e: MouseEvent | TouchEvent | PointerEvent, { offset, velocity }: PanInfo) => {
    const swipe = swipePower(offset.x, velocity.x);

    if (hidePrimaryTabs) {
      // 只有二級 tab 時，左右滑切換二級 tab
      if (swipe < -swipeConfidenceThreshold) {
        const currentIndex = secondaryTabs.findIndex((t) => t.id === activeSecondaryTab);
        if (currentIndex < secondaryTabs.length - 1) {
          setActiveSecondaryTab(secondaryTabs[currentIndex + 1].id as typeof activeSecondaryTab);
        }
      } else if (swipe > swipeConfidenceThreshold) {
        const currentIndex = secondaryTabs.findIndex((t) => t.id === activeSecondaryTab);
        if (currentIndex > 0) {
          setActiveSecondaryTab(secondaryTabs[currentIndex - 1].id as typeof activeSecondaryTab);
        }
      }
    } else {
      // 一級 tab 存在時，左右滑切換一級 tab
      if (swipe < -swipeConfidenceThreshold) {
        const currentIndex = primaryTabs.findIndex((t) => t.id === activePrimaryTab);
        if (currentIndex < primaryTabs.length - 1) {
          handlePrimaryTabChange(primaryTabs[currentIndex + 1].id);
        }
      } else if (swipe > swipeConfidenceThreshold) {
        const currentIndex = primaryTabs.findIndex((t) => t.id === activePrimaryTab);
        if (currentIndex > 0) {
          handlePrimaryTabChange(primaryTabs[currentIndex - 1].id);
        }
      }
    }
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  type ExchangeCard = {
    id: string;
    name: string;
    image: string;
    series?: string;
    value: number;
  };

  type ExchangeOffer = {
    id: string;
    user: { name: string; avatar: string; trades: number };
    getting: ExchangeCard[];
    giving: ExchangeCard[];
    createdAt: string;
  };

  useEffect(() => {
    if (activePrimaryTab !== 'sell') return;
    setSellPage(0);
    setSellHasMore(true);
    setSellListings([]);
  }, [activePrimaryTab]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (activePrimaryTab !== 'sell') return;
      if (sellPage === 0) setIsSellListingsLoading(true);
      else setIsSellFetchingMore(true);
      try {
        const pageSize = 20;
        const from = sellPage * pageSize;
        const to = from + pageSize - 1;
        const supabase = createClient();
        const selectWithViewCount = async () =>
          await supabase
            .from('sell_listings')
            .select(
              `
                id,
                seller_id,
                price,
                view_count,
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

        const selectWithoutViewCount = async () =>
          await supabase
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

        let rows: any[] | null = null;
        let error: any = null;
        const r1 = await selectWithViewCount();
        rows = r1.data as any;
        error = r1.error as any;

        if (error) {
          const msg = String((error as any)?.message || '');
          if (msg.includes('view_count') && msg.includes('sell_listings')) {
            const r2 = await selectWithoutViewCount();
            rows = r2.data as any;
            error = r2.error as any;
          }
        }

        if (error) throw error;
        const listingRows = Array.isArray(rows) ? rows : [];

        const sellerIds = Array.from(new Set(listingRows.map((r: any) => String(r?.seller_id || '')).filter(Boolean)));
        const displayById = new Map<string, { name: string; avatar_url: string }>();
        if (sellerIds.length > 0) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: sellerIds });
          if (!displayError) {
            for (const d of Array.isArray(displays) ? displays : []) {
              const id = String((d as any)?.id || '');
              if (!id) continue;
              displayById.set(id, {
                name: String((d as any)?.name || 'user'),
                avatar_url: String((d as any)?.avatar_url || '/images/avatar.png'),
              });
            }
          }
        }

        const mapped: SaleListing[] = listingRows.map((row: any) => {
          const sellerId = String(row?.seller_id || '');
          const display = displayById.get(sellerId) || { name: 'user', avatar_url: '/images/avatar.png' };
          const createdAtRaw = String(row?.created_at || '');
          const createdAt = createdAtRaw ? createdAtRaw.slice(0, 10) : '';
          const title = String(row?.title || '').trim();
          const rawImages = row?.images ?? row?.image_urls ?? row?.imageUrls ?? null;
          const imageCandidates: string[] = Array.isArray(rawImages)
            ? rawImages.map((x: any) => String(x || '').trim()).filter(Boolean)
            : [];
          const rawItems = row?.items ?? [];
          const items = Array.isArray(rawItems)
            ? rawItems.map((x: any) => ({
                name: String(x?.name || '').trim(),
                series: String(x?.series || '').trim(),
                grade: String(x?.grade || '').trim(),
                image: String(x?.image || '').trim(),
                price: Number(x?.price || 0),
              }))
            : [];
          const itemPrices = items.map((x: any) => Number(x?.price || 0)).filter((n: number) => Number.isFinite(n) && n > 0);
          const minPrice = itemPrices.length > 0 ? Math.min(...itemPrices) : Number(row?.price || 0);
          return {
            id: String(row?.id || ''),
            seller: { id: sellerId, name: display.name, avatar: display.avatar_url },
            createdAt,
            price: minPrice,
            viewCount: Math.max(0, Math.floor(Number(row?.view_count ?? 0) || 0)),
            product: {
              name: title || (items[0]?.name ? String(items[0].name) : '販售商品'),
              grade: items[0]?.grade ? String(items[0].grade) : '',
              series: items[0]?.series ? String(items[0].series) : '',
              image:
                (imageCandidates[0] ||
                  items.map((x: any) => x.image).filter(Boolean)[0] ||
                  '/images/item.png') as string,
            },
          };
        });

        if (cancelled) return;
        setSellHasMore(mapped.length === pageSize);
        setSellListings((prev) => {
          if (sellPage === 0) return mapped;
          const existing = new Set(prev.map((o) => o.id));
          const next = [...prev];
          for (const o of mapped) {
            if (!existing.has(o.id)) next.push(o);
          }
          return next;
        });
      } catch (e) {
        console.error('Failed to load sell listings:', e);
        if (!cancelled && sellPage === 0) setSellListings([]);
        if (!cancelled) setSellHasMore(false);
      } finally {
        if (cancelled) return;
        setIsSellListingsLoading(false);
        setIsSellFetchingMore(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activePrimaryTab, sellPage]);

  useEffect(() => {
    if (activePrimaryTab !== 'sell') return;
    if (!sellHasMore) return;
    if (isSellListingsLoading || isSellFetchingMore) return;
    const node = sellSentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSellPage((p) => p + 1);
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [activePrimaryTab, sellHasMore, isSellFetchingMore, isSellListingsLoading]);

  const filteredSellListings = useMemo(() => {
    let result = [...sellListings];
    const series =
      activePrimaryTab === 'sell' && activeSecondaryTab.startsWith('series:')
        ? activeSecondaryTab.slice('series:'.length)
        : '';
    if (series) {
      result = result.filter((l) => String(l.product.series || '').trim() === series);
    }

    if (sellSortMode === 'price-asc') {
      result.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sellSortMode === 'price-desc') {
      result.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else {
      result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    return result;
  }, [sellListings, activePrimaryTab, activeSecondaryTab, sellSortMode]);

  const [exchangeOffers, setExchangeOffers] = useState<ExchangeOffer[]>([]);
  const [isExchangeOffersLoading, setIsExchangeOffersLoading] = useState(false);
  const [exchangeQuery, setExchangeQuery] = useState('');
  const [exchangePage, setExchangePage] = useState(0);
  const [exchangeHasMore, setExchangeHasMore] = useState(true);
  const [isExchangeFetchingMore, setIsExchangeFetchingMore] = useState(false);
  const exchangeSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (activePrimaryTab !== 'exchange') return;
      if (exchangePage === 0) setIsExchangeOffersLoading(true);
      else setIsExchangeFetchingMore(true);
      try {
        const pageSize = 30;
        const from = exchangePage * pageSize;
        const to = from + pageSize - 1;
        const supabase = createClient();
        const { data: rows, error } = await supabase
          .from('exchange_offers')
          .select(
            `
              id,
              owner_id,
              status,
              created_at,
              cards:exchange_offer_cards (
                side,
                external_id,
                name,
                series,
                image_url,
                value,
                position
              )
            `
          )
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;
        const offerRows = Array.isArray(rows) ? rows : [];

        const ownerIds = Array.from(new Set(offerRows.map((r: any) => String(r.owner_id || '')).filter((x) => !!x)));
        const displayById = new Map<string, { name: string; avatar_url: string }>();
        if (ownerIds.length > 0) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: ownerIds });
          if (displayError) throw displayError;
          for (const d of Array.isArray(displays) ? displays : []) {
            const id = String((d as any).id || '');
            if (!id) continue;
            displayById.set(id, { name: String((d as any).name || 'user'), avatar_url: String((d as any).avatar_url || '/images/avatar.png') });
          }
        }

        const toCard = (r: any): ExchangeCard => ({
          id: String(r.external_id || ''),
          name: String(r.name || ''),
          image: String(r.image_url || ''),
          series: r.series ? String(r.series) : undefined,
          value: typeof r.value === 'number' ? r.value : Number(r.value || 0),
        });

        const mapped: ExchangeOffer[] = offerRows.map((row: any) => {
          const ownerId = String(row.owner_id || '');
          const display = displayById.get(ownerId) || { name: 'user', avatar_url: '/images/avatar.png' };
          const cardRows = Array.isArray(row.cards) ? row.cards : [];
          cardRows.sort((a: any, b: any) => (Number(a.position) || 0) - (Number(b.position) || 0));
          const getting = cardRows.filter((c: any) => c.side === 'want').map(toCard);
          const giving = cardRows.filter((c: any) => c.side === 'give').map(toCard);
          const createdAtRaw = String(row.created_at || '');
          const createdAt = createdAtRaw ? createdAtRaw.slice(0, 10) : '';
          return {
            id: String(row.id),
            user: { name: display.name, avatar: display.avatar_url, trades: 0 },
            getting,
            giving,
            createdAt,
          };
        });

        if (cancelled) return;
        setExchangeOffers((prev) => {
          if (exchangePage === 0) return mapped;
          const existing = new Set(prev.map((o) => o.id));
          const next = [...prev];
          for (const o of mapped) {
            if (!existing.has(o.id)) next.push(o);
          }
          return next;
        });
        setExchangeHasMore(mapped.length >= pageSize);
      } catch (e) {
        console.error('Failed to load exchange offers:', e);
        if (!cancelled && exchangePage === 0) setExchangeOffers([]);
      } finally {
        if (!cancelled) {
          setIsExchangeOffersLoading(false);
          setIsExchangeFetchingMore(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activePrimaryTab, exchangePage]);

  useEffect(() => {
    if (activePrimaryTab !== 'exchange') return;
    setExchangePage(0);
    setExchangeHasMore(true);
  }, [activePrimaryTab]);

  useEffect(() => {
    if (activePrimaryTab !== 'exchange') return;
    if (!exchangeHasMore) return;
    if (isExchangeOffersLoading || isExchangeFetchingMore) return;
    const el = exchangeSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        setExchangePage((p) => p + 1);
      },
      { rootMargin: '300px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [activePrimaryTab, exchangeHasMore, isExchangeFetchingMore, isExchangeOffersLoading]);

  const formatTwd = (amount: number) => `NT$${Math.round(amount).toLocaleString()}`;

  const filteredExchangeOffers = useMemo(() => {
    let result = [...exchangeOffers];

    if (activeSecondaryTab === 'new') {
      result = result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }

    const q = exchangeQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((o) => {
        if (o.user.name.toLowerCase().includes(q)) return true;
        for (const c of [...o.getting, ...o.giving]) {
          if (c.name.toLowerCase().includes(q)) return true;
          if ((c.series || '').toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    return result;
  }, [exchangeOffers, activeSecondaryTab, exchangeQuery]);

  const renderProductSections = () => {
    if (!hasAnyPrimaryFeature) {
      return (
        <section className="px-2 pt-6 pb-10">
          <div className="py-10 text-center text-[13px] font-black text-neutral-400">
            目前沒有開啟任何功能
          </div>
        </section>
      );
    }

    return (
    <section className="overflow-hidden">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={activePrimaryTab}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 }
          }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={1}
          onDragEnd={handleDragEnd}
          className="px-2 pt-2 touch-pan-y"
        >
          {activePrimaryTab === 'sell' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {isSellListingsLoading && sellListings.length === 0 ? (
                  <div className="col-span-2 py-20 text-center text-[13px] font-black text-neutral-400">載入中</div>
                ) : filteredSellListings.length > 0 ? (
                  filteredSellListings.map((listing) => (
                    <Link
                      key={listing.id}
                      href={`/sell/${listing.id}`}
                      className="group block h-full bg-white dark:bg-neutral-900 rounded-[8px] border border-neutral-100 dark:border-neutral-800 overflow-hidden text-left"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          persistHomeState();
                        }
                      }}
                    >
                      <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                        <Image src={listing.product.image} alt={listing.product.name} fill className="object-cover" unoptimized />
                      </div>

                      <div className="flex flex-col p-2">
                        <div className="mb-1 h-[2.75rem]">
                          <h3 className="text-[14px] font-normal text-neutral-900 dark:text-white line-clamp-2 leading-[1.25] break-all">
                            <span className="inline-flex align-middle mr-1 relative -top-[0.1rem] h-4 px-1 text-[8px] font-medium text-white rounded-[4px] shadow-lg uppercase tracking-wider items-center backdrop-blur-sm bg-opacity-90 bg-primary shadow-primary/20">
                              販售
                            </span>
                            {listing.product.type && (
                              <ProductBadge type={listing.product.type} className="inline-flex align-middle mr-1 relative -top-[0.1rem]" />
                            )}
                            <span className="inline">{listing.product.name}</span>
                          </h3>
                        </div>

                        <div className="mt-auto pt-2 border-t border-neutral-100 dark:border-neutral-800">
                          <div className="flex items-end justify-between gap-1">
                            <div className="flex items-center gap-1">
                              <div className="w-3.5 h-3.5">
                                <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="w-full h-full object-contain" />
                              </div>
                              <span className="text-[24px] leading-none font-black font-amount text-primary tracking-tight">
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
                  ))
                ) : (
                  <div className="col-span-2 py-20 text-center">
                    <p className="text-[13px] text-neutral-400 font-bold">目前沒有販售</p>
                  </div>
                )}
              </div>

              <div ref={sellSentinelRef} className="h-10" />
              {!isSellListingsLoading && isSellFetchingMore && (
                <div className="py-6 text-center text-[13px] font-black text-neutral-400">載入中</div>
              )}
              {!isSellListingsLoading && !isSellFetchingMore && !sellHasMore && sellListings.length > 0 && (
                <div className="py-6 text-center text-[13px] font-black text-neutral-400">到底了</div>
              )}
            </>
          ) : activePrimaryTab === 'all' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, index) => (
                  <div key={index} className="h-[280px]">
                    <ProductCardSkeleton />
                  </div>
                ))
              ) : loadError ? (
                <div className="col-span-full flex flex-col items-center justify-center py-10 space-y-4">
                  <div className="text-center text-sm text-neutral-500 dark:text-neutral-400 font-bold">
                    {loadError}
                  </div>
                  <button 
                    onClick={() => fetchData()}
                    className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors text-sm font-medium"
                  >
                    重試
                  </button>
                </div>
              ) : (
                (() => {
                  const mixed: Array<
                    | { kind: 'product'; item: ProductRow }
                    | { kind: 'sell'; item: SaleListing }
                  > = [];
                  let inserted = 0;
                  let productCount = 0;

                  for (const product of filteredProducts.slice(0, homeDisplayCount)) {
                    mixed.push({ kind: 'product', item: product });
                    productCount += 1;

                    if (featuredSellCards.length > inserted && productCount % 4 === 0) {
                      mixed.push({ kind: 'sell', item: featuredSellCards[inserted] });
                      inserted += 1;
                    }
                  }

                  for (; inserted < featuredSellCards.length; inserted += 1) {
                    mixed.push({ kind: 'sell', item: featuredSellCards[inserted] });
                  }

                  return mixed.map((row) => {
                    if (row.kind === 'sell') {
                      const listing = row.item;
                      return (
                        <Link
                          key={`sell:${listing.id}`}
                          href={`/sell/${listing.id}`}
                          className="group block h-full bg-white dark:bg-neutral-900 rounded-[8px] border border-neutral-100 dark:border-neutral-800 overflow-hidden text-left"
                          onClick={() => {
                            if (typeof window !== 'undefined') {
                              persistHomeState();
                            }
                          }}
                        >
                          <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                            <Image src={listing.product.image} alt={listing.product.name} fill className="object-cover" unoptimized />
                          </div>

                          <div className="flex flex-col p-2">
                            <div className="mb-1 h-[2.75rem]">
                              <h3 className="text-[14px] font-normal text-neutral-900 dark:text-white line-clamp-2 leading-[1.25] break-all">
                                <span className="inline-flex align-middle mr-1 relative -top-[0.1rem] h-4 px-1 text-[8px] font-medium text-white rounded-[4px] shadow-lg uppercase tracking-wider items-center backdrop-blur-sm bg-opacity-90 bg-primary shadow-primary/20">
                                  販售
                                </span>
                                <span className="inline">{listing.product.name}</span>
                              </h3>
                            </div>

                            <div className="mt-auto pt-2 border-t border-neutral-100 dark:border-neutral-800">
                              <div className="flex items-end justify-between gap-1">
                                <div className="flex items-center gap-1">
                                  <div className="w-3.5 h-3.5">
                                    <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="w-full h-full object-contain" />
                                  </div>
                                  <span className="text-[24px] leading-none font-black font-amount text-primary tracking-tight">
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
                        key={`product:${product.id}`}
                        id={product.id.toString()}
                        name={product.name}
                        image={product.image_url || ''}
                        price={product.price}
                        remaining={product.remaining}
                        total={product.total_count}
                        isHot={product.is_hot}
                        type={product.type}
                        status={product.status}
                        onNavigate={() => {
                          persistHomeState();
                          import('@/lib/trackEvent').then(({ trackEvent }) => {
                            trackEvent('product_click', { productId: product.id, series: product.series ?? undefined });
                          });
                        }}
                      />
                    );
                  });
                })()
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, index) => (
                  <div key={index} className="h-[280px]">
                    <ProductCardSkeleton />
                  </div>
                ))
              ) : loadError ? (
                <div className="col-span-full flex flex-col items-center justify-center py-10 space-y-4">
                  <div className="text-center text-sm text-neutral-500 dark:text-neutral-400 font-bold">
                    {loadError}
                  </div>
                  <button 
                    onClick={() => fetchData()}
                    className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors text-sm font-medium"
                  >
                    重試
                  </button>
                </div>
              ) : (
                filteredProducts.slice(0, homeDisplayCount).map((product) => (
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
                    onNavigate={persistHomeState}
                  />
                ))
              )}
            </div>
          )}
          {activePrimaryTab !== 'sell' && (
            <div
              ref={homeSentinelRef}
              className={`text-center text-[13px] font-black text-neutral-400 ${!isLoading && !loadError && filteredProducts.length === 0 ? 'min-h-[40vh] flex items-center justify-center' : 'py-6'}`}
            >
              {homeDisplayCount < filteredProducts.length
                ? '載入中...'
                : filteredProducts.length > 0
                  ? '到底了'
                  : !isLoading && !loadError
                    ? '此分類暫無商品'
                    : ''}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24 transition-colors">
      <div className="max-w-7xl mx-auto px-0 pt-0 sm:pt-4 md:hidden">
        <div className="px-2">
          <div className="rounded-none overflow-visible">
            <WinningMarquee />
          </div>
        </div>

        <section className="mb-0 sm:mb-0">
          {isLoading ? (
            <BannerSkeleton />
          ) : (
            <HeroBanner
              banners={banners.map((b) => ({
                id: b.id,
                image: b.image_url,
                link: b.link_url || '#',
              }))}
              onBannerClick={(banner) => trackEvent('banner_click', { meta: { banner_id: banner.id, link: banner.link } })}
            />
          )}
        </section>

        {hasAnyPrimaryFeature && (
        <div className="sticky top-[57px] z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 -mx-0">
          <div className="max-w-7xl mx-auto pt-0 pb-0 space-y-2">
            {!hidePrimaryTabs && (
              <Tabs 
                value={activePrimaryTab} 
                onValueChange={(val) => handlePrimaryTabChange(val as PrimaryTabId)}
                className="w-full"
              >
                <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b border-neutral-100 dark:border-neutral-800 pb-0">
                  {primaryTabs.map((tab) => (
                    <TabsTrigger key={tab.id} value={tab.id}>
                      <div className="relative inline-flex items-center">
                        {tab.label}
                        {tab.id === 'card' && (
                          <span className="absolute -top-1.5 -right-5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full scale-75 origin-center leading-none">
                             新
                           </span>
                        )}
                      </div>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}

            <div className={cn("flex items-center gap-1.5 py-2 px-2", secondaryTabs.length <= 1 && "hidden")}>
              <div ref={secondaryTabsRef} className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide snap-x snap-mandatory">
                <div className="flex items-center gap-1.5">
                  {secondaryTabs.map((tab) => (
                    <button
                      key={tab.id}
                      data-tab-id={tab.id}
                      onClick={() => {
                        setActiveSecondaryTab(tab.id as typeof activeSecondaryTab);
                      }}
                      className={cn(
                        "snap-start flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-black whitespace-nowrap transition-colors",
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
              <div className="relative flex-shrink-0">
                {activePrimaryTab !== 'exchange' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsFilterOpen((prev) => !prev)}
                      className={cn(
                        "ml-1 mr-1 p-1.5 rounded-full active:scale-95 transition-all",
                        (activePrimaryTab === 'sell' ? sellSortMode : sortMode) === 'latest' && !isFilterOpen
                          ? "text-neutral-500 hover:text-primary hover:bg-primary/5"
                          : "text-primary bg-primary/5"
                      )}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="w-4 h-4"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 4h16" />
                        <path d="M6 12h12" />
                        <path d="M10 20h4" />
                      </svg>
                    </button>
                    {isFilterOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setIsFilterOpen(false)}
                        />
                        <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-neutral-900 rounded-lg shadow-modal border border-neutral-100 dark:border-neutral-800 py-2 z-40">
                          {(activePrimaryTab === 'sell'
                            ? [
                                { id: 'latest' as SortMode, label: '最新上架' },
                                { id: 'price-asc' as SortMode, label: '價格：低到高' },
                                { id: 'price-desc' as SortMode, label: '價格：高到低' },
                              ]
                            : [
                                { id: 'latest' as SortMode, label: '最新上架' },
                                { id: 'price-asc' as SortMode, label: '價格：低到高' },
                                { id: 'price-desc' as SortMode, label: '價格：高到低' },
                                { id: 'sold-out' as SortMode, label: '已完抽' },
                              ]
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                if (activePrimaryTab === 'sell') setSellSortMode(opt.id);
                                else setSortMode(opt.id);
                                setIsFilterOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-4 py-2.5 text-[13px] font-black transition-colors",
                                (activePrimaryTab === 'sell' ? sellSortMode : sortMode) === opt.id
                                  ? "bg-primary/5 text-primary"
                                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        {renderProductSections()}
      </div>

      <div className="hidden md:block">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 md:pt-6 pb-10">
          <div className="flex flex-col md:flex-row gap-4 lg:gap-6 items-start">
            {!hidePrimaryTabs && (
              <aside className="hidden md:block w-60 flex-shrink-0 sticky top-16">
              <div className="bg-white dark:bg-neutral-900 rounded-2xl p-3 shadow-card border border-neutral-100 dark:border-neutral-800 transition-colors space-y-6">
                <div className="space-y-1 lg:space-y-1">
                  {primaryTabs.map((tab) => (
                    <div key={tab.id}>
                      <button
                        onClick={() => setActivePrimaryTab(tab.id as typeof activePrimaryTab)}
                        className={cn(
                          "w-full text-left px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-xl text-[13px] lg:text-sm font-black transition-all flex items-center justify-between group",
                          activePrimaryTab === tab.id
                            ? "bg-primary text-white shadow-lg shadow-primary/20"
                            : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{tab.label}</span>
                          {tab.id === 'card' && (
                            <span
                              className={cn(
                                "inline-flex items-center justify-center h-[20px] px-1.5 rounded-full text-[10px] font-black",
                                activePrimaryTab === 'card'
                                  ? "bg-primary/90 text-white"
                                  : "bg-primary/10 text-primary"
                              )}
                            >
                              新
                            </span>
                          )}
                        </div>
                      </button>
                      {tab.id === 'custom' && (
                        <div className="mt-2 mb-1 border-t border-dashed border-neutral-200 dark:border-neutral-700" />
                      )}
                    </div>
                  ))}
                </div>

                {activePrimaryTab !== 'exchange' && activePrimaryTab !== 'sell' && (
                  <div>
                    <div className="flex items-center gap-3 mb-3 lg:mb-4 px-1">
                      <h2 className="text-[12px] lg:text-sm font-black text-neutral-900 dark:text-white uppercase tracking-widest">
                        價格區間
                      </h2>
                    </div>
                    <div className="px-1">
                      <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                        <input
                          type="text"
                          value={priceMin}
                          onChange={(e) => handlePriceChange(e.target.value, setPriceMin)}
                          placeholder="最小"
                          className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 text-center font-black font-amount focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <span className="font-bold">-</span>
                        <input
                          type="text"
                          value={priceMax}
                          onChange={(e) => handlePriceChange(e.target.value, setPriceMax)}
                          placeholder="最大"
                          className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 text-center font-black font-amount focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <button className="w-full py-3 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-black uppercase tracking-widest hover:bg-primary dark:hover:bg-primary hover:text-white dark:hover:text-white transition-colors">
                        套用篩選
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </aside>
            )}

            <main className="flex-1">
              <div className="mb-3 rounded-[8px] overflow-hidden">
                <WinningMarquee />
              </div>

              <section className="mb-4">
                {isLoading ? (
                  <BannerSkeleton />
                ) : (
                  <HeroBanner
                    banners={banners.map((b) => ({
                      id: b.id,
                      image: b.image_url,
                      link: b.link_url || '#',
                    }))}
                    onBannerClick={(banner) => trackEvent('banner_click', { meta: { banner_id: banner.id, link: banner.link } })}
                  />
                )}
              </section>

              {hasAnyPrimaryFeature && (
              <div className="sticky top-16 z-30 mb-4">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-x-0 -top-6 h-10 bg-neutral-50 dark:bg-neutral-950 z-0" />
                  <div className="relative z-10 bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 overflow-x-auto overscroll-x-contain scrollbar-hide">
                        <div className="flex items-center gap-1.5">
                          {secondaryTabs.map((tab: { id: string; label: string }) => (
                            <button
                              key={tab.id}
                              onClick={() => {
                                setActiveSecondaryTab(tab.id as typeof activeSecondaryTab);
                                      }}
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
                      <div className="relative flex-shrink-0">
                        {activePrimaryTab !== 'exchange' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setIsFilterOpen((prev) => !prev)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-xl text-[13px] font-black text-neutral-600 dark:text-neutral-400 hover:border-primary hover:text-primary shadow-soft transition-all active:scale-95",
                                isFilterOpen && "border-primary text-primary"
                              )}
                            >
                              <span>排序方式</span>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                className="w-4 h-4"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M4 4h16" />
                                <path d="M6 12h12" />
                                <path d="M10 20h4" />
                              </svg>
                            </button>
                            {isFilterOpen && (
                              <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-neutral-900 rounded-lg shadow-modal border border-neutral-100 dark:border-neutral-800 py-2 z-40">
                                {(activePrimaryTab === 'sell'
                                  ? [
                                      { id: 'latest' as SortMode, label: '最新上架' },
                                      { id: 'price-asc' as SortMode, label: '價格：低到高' },
                                      { id: 'price-desc' as SortMode, label: '價格：高到低' },
                                    ]
                                  : [
                                      { id: 'latest' as SortMode, label: '最新上架' },
                                      { id: 'price-asc' as SortMode, label: '價格：低到高' },
                                      { id: 'price-desc' as SortMode, label: '價格：高到低' },
                                      { id: 'sold-out' as SortMode, label: '已完抽' },
                                    ]
                                ).map((opt) => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                      if (activePrimaryTab === 'sell') setSellSortMode(opt.id);
                                      else setSortMode(opt.id);
                                      setIsFilterOpen(false);
                                    }}
                                    className={cn(
                                      "w-full text-left px-4 py-2.5 text-[13px] font-black transition-colors",
                                      (activePrimaryTab === 'sell' ? sellSortMode : sortMode) === opt.id
                                        ? "bg-primary/5 text-primary"
                                        : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                                    )}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {renderProductSections()}
            </main>
          </div>
        </div>
      </div>

      {activePrimaryTab === 'sell' && (
        <Link
          href="/sell/new"
          className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 w-12 h-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 grid place-items-center active:scale-95 transition-transform"
          aria-label="上架販售"
        >
          <Plus className="w-6 h-6 stroke-[2]" />
        </Link>
      )}
    </div>
  );
}
