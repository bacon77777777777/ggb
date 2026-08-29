'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Search, X, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchRecommendations } from '@/lib/recommendations';
import ProductCard from '@/components/ProductCard';
import type { Database } from '@/types/database.types';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { filterEnabledCategories } from '@/lib/categoryFlags';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import Link from 'next/link';
import Image from 'next/image';
import { cn, formatViewCount } from '@/lib/utils';
import { trackPageView, trackEvent } from '@/lib/trackEvent';
import { PRODUCT_PUBLIC_COLUMNS } from '@/lib/productColumns'
import { asset } from '@/lib/asset';
import { useSentinelRegistry } from '@/lib/useSentinelRegistry';

type ProductRow = Database['public']['Tables']['products']['Row'];

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const { flags, states: flagStates, isLoading: isFlagsLoading } = useFeatureFlags();

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
  // 商品層熱度（近期真人抽數，含時間衰減）。「熱門」分頁與預設排序都吃這個，
  // is_hot 現在純粹是後台手動的精選標籤，不參與排序
  const [productHeat, setProductHeat] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    const c1 = trackPageView();
    return () => { c1(); };
  }, []);

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

  // 商品熱度：跟首頁同一支 RPC，同一套 7/30 天衰減與機器人過濾
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_popular_products', { p_limit: 200 });
        if (cancelled || !Array.isArray(data)) return;
        const map = new Map<number, number>();
        for (const row of data as Array<{ product_id: number; score: number }>) {
          map.set(Number(row.product_id), Number(row.score) || 0);
        }
        setProductHeat(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select(PRODUCT_PUBLIC_COLUMNS)
          // 以前只載轉蛋（.eq('type','gacha')）—— 頁籤明明有一番賞／盒玩／抽卡，搜不到
          // （老闆 2026-08-22：文章「更多」要跳來搜 IP 關鍵字）。改全類別，機台除外。
          .neq('type', 'slot')
          .neq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(600);

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
      /*
       * 立刻接手 focus，不能等。導覽列的搜尋圖標在點擊當下已經用
       * 假輸入框把 iOS 鍵盤叫起來了（lib/keyboardRelay），這裡越快把
       * focus 接過來，鍵盤越不會在交接空檔掉下去。連續補兩次是保險 ——
       * 元件掛載與轉場的時序在不同機器上不一樣。
       */
      inputRef.current?.focus();
      const t1 = setTimeout(() => inputRef.current?.focus(), 60);
      const t2 = setTimeout(() => inputRef.current?.focus(), 200);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, []);

  const trimmedQuery = query.trim();

  /*
   * 沒輸入關鍵字時這頁的標題是「猜你喜歡」，但先前只是把全部商品照原順序列出，
   * 誰看都一樣 —— 文案在承諾一件程式沒做的事。
   * 這裡取個人化推薦（照玩家自己的抽獎紀錄，見 lib/recommendations），
   * 排到清單最前面，後面才接原本的全部商品。
   */
  /*
   * 廠商名對照表 —— 讓關鍵字也搜得到廠商（老闆 2026-08-29）
   *
   * 搜尋是純前端過濾（商品一次載 600 筆），所以只要把 supplier_id → name
   * 建成表，比對時多看一個欄位就好，不必動查詢。
   * 廠商數是個位數，一次載完沒有成本。
   *
   * `suppliers` 只讀得到 id/name/is_active/is_platform —— 其餘欄位（分潤、
   * 統編、聯絡人）已於 migration 640 從 anon 撤掉。
   */
  const [supplierNames, setSupplierNames] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('suppliers').select('id, name');
      if (!alive || !data) return;
      setSupplierNames(new Map(data.map((r: { id: number; name: string | null }) => [Number(r.id), String(r.name ?? '')])));
    })();
    return () => { alive = false; };
  }, [supabase]);

  /*
   * 「猜你喜歡」下拉刷新要換一批（老闆 2026-08-29，跟首頁「綜合 → 推薦」同一套）
   *
   * 下拉更新不是整頁 reload，而是 PathnameKeyed 換 key 把頁面重掛
   *（見 lib/contentRefresh.ts），所以**每次刷新＝一次新的 mount**。
   * 只要排序帶一點「每次掛載才決定」的隨機性，刷新自然就換一批。
   *
   * 沿用首頁那三段做法：
   *   1. 多取一些候選（8 → 24），不然池子太小怎麼洗都是同一批
   *   2. 每次掛載發一副新的隨機權重（jitter），分數高的仍常在前排
   *   3. 上一輪露出在最前面的這一輪降權往後沉 —— 「刷新＝給我沒看過的」才有感
   *
   * jitter 放 ref：同一次掛載內 sort 必須穩定，不能在 comparator 裡擲骰子。
   */
  const RECO_POOL = 24;
  const RECO_SEEN_DEMOTE = 0.35;
  const recoJitter = useRef<Map<number, number>>(new Map());
  const recoSeen = useRef<Set<number>>(new Set());
  useEffect(() => {
    try {
      recoSeen.current = new Set(
        (JSON.parse(sessionStorage.getItem('ggb:search:reco:seen') || '[]') as unknown[]).map(Number),
      );
    } catch { /* 讀不到就當沒看過 */ }
  }, []);

  /*
   * 分批載入改成自動（老闆 2026-08-29：不該是按鈕，要跟首頁一樣捲到底就補）
   *
   * 用哨兵登記簿而不是單一 ref：這頁有三份清單（商城／混合／一般），
   * 切頁籤時哨兵會重掛，只留最後一顆會觀察到已卸載的節點。
   * 細節見 lib/useSentinelRegistry。
   */
  const listSentinel = useSentinelRegistry();

  const [recommendedIds, setRecommendedIds] = useState<number[]>([]);
  useEffect(() => {
    if (trimmedQuery) { setRecommendedIds([]); return; }
    let alive = true;
    (async () => {
      const rows = await fetchRecommendations(supabase, -1, null, RECO_POOL);
      if (!alive) return;
      const ids = rows.map(r => Number(r.id));
      // 名次分（越前面越高）× 隨機權重，看過的打折
      const scored = ids.map((id, i) => {
        let j = recoJitter.current.get(id);
        if (j === undefined) { j = Math.random(); recoJitter.current.set(id, j); }
        const rank = (ids.length - i) / ids.length;
        const seen = recoSeen.current.has(id) ? RECO_SEEN_DEMOTE : 1;
        return { id, score: rank * (0.55 + j * 0.9) * seen };
      }).sort((a, b) => b.score - a.score).map(x => x.id);
      setRecommendedIds(scored);
      // 這一輪露出在最前面的，下一輪降權
      try {
        sessionStorage.setItem('ggb:search:reco:seen', JSON.stringify(scored.slice(0, 8)));
      } catch { /* 無痕模式寫不進去就算了 */ }
    })();
    return () => { alive = false; };
  }, [trimmedQuery, supabase]);
  const visibleHistory = searchHistory.slice(0, 5);
  const showSuggestionPanel = isInputFocused && !trimmedQuery;

  useEffect(() => {
    if (isRestoringRef.current) return;
    setVisibleCount(10);
  }, [trimmedQuery]);

  // Track search events (debounced 1.5s — fires once user stops typing)
  useEffect(() => {
    if (!trimmedQuery) return;
    const timer = setTimeout(() => {
      import('@/lib/trackEvent').then(({ trackEvent }) => {
        trackEvent('search', { meta: { query: trimmedQuery } });
      });
    }, 1500);
    return () => clearTimeout(timer);
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
    if (flags.sell) base.push({ id: 'sell', label: '商城' });
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
          // 名稱、系列、廠商名命中都算
          //（吉伊卡哇可能只在 series 欄；廠商名是老闆 2026-08-29 加的）
          const q = trimmedQuery.toLowerCase();
          const name = (product.name || '').toLowerCase();
          const series = ((product as { series?: string | null }).series || '').toLowerCase();
          const sid = (product as { supplier_id?: number | null }).supplier_id;
          const supplier = (sid ? supplierNames.get(Number(sid)) ?? '' : '').toLowerCase();
          return name.includes(q) || series.includes(q) || (!!supplier && supplier.includes(q));
        })
      : allProducts;

    // 全部 tab 也要濾掉關著的類別。原本這裡刻意不濾，理由是「確保熱門關鍵字能找到結果」，
    // 但搜得到卻買不了比搜不到更糟 —— 玩家點進去只會撞到「暫停開放」
    const filteredByFlags = activePrimaryTab === 'all'
      ? filterEnabledCategories(base, flagStates, isFlagsLoading)
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
          ? [...filteredByTab].sort((a, b) => {
              const heatA = productHeat.get(Number((a as { id: number }).id)) || 0;
              const heatB = productHeat.get(Number((b as { id: number }).id)) || 0;
              if (heatA !== heatB) return heatB - heatA;
              return String(b.created_at || '').localeCompare(String(a.created_at || ''));
            })
          : filteredByTab;

    /*
     * 把推薦的商品提到最前面。只在「沒關鍵字＋全部分頁＋原始排序」時做 ——
     * 玩家已經自己選了熱門或最新，就不該再被我們重新排過。
     * 只調順序不篩選，清單內容不變，往下捲照樣看得到全部商品。
     */
    if (!trimmedQuery && activePrimaryTab === 'all' && activeSecondaryTab === 'all' && recommendedIds.length) {
      const rank = new Map(recommendedIds.map((id, i) => [id, i]));
      return [...sorted].sort((a, b) => {
        const ra = rank.get(Number((a as { id: number }).id)) ?? Infinity;
        const rb = rank.get(Number((b as { id: number }).id)) ?? Infinity;
        return ra - rb;
      });
    }

    return sorted;
  }, [
    recommendedIds,
    activePrimaryTab,
    activeSecondaryTab,
    allProducts,
    flags.blindbox,
    flags.card,
    flags.custom,
    flags.gacha,
    flags.ichiban,
    trimmedQuery,
    supplierNames,
    productHeat,
  ]);

  /*
   * 搜尋紀錄 → search_logs（推薦 feed 的話題訊號；以前這張表沒人在寫）。
   * 不綁在按 Enter 上：從文章「更多」帶 ?q= 進來也算一次搜尋。同一個關鍵字只記一次，
   * 等商品載完、結果數算好才送。
   */
  const loggedQueryRef = useRef<string>('');
  useEffect(() => {
    if (!trimmedQuery || isLoading || trimmedQuery === loggedQueryRef.current) return;
    loggedQueryRef.current = trimmedQuery;
    fetch('/api/search/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: trimmedQuery, result_count: filteredProducts.length }), keepalive: true }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery, isLoading]);

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

  /*
   * 盯著清單底部的哨兵，看得到就再載 10 筆 —— rootMargin 400px 讓它在
   * 快捲到底之前就先補好，玩家不會看到空白。
   * 桌機首屏可能一次填不滿，這樣也會一路補到畫面滿為止。
   */
  useEffect(() => {
    const total = activePrimaryTab === 'sell' ? filteredSellListings.length : filteredProducts.length;
    if (total === 0 || visibleCount >= total) return;
    const nodes = listSentinel.liveNodes();
    if (nodes.length === 0) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setVisibleCount(prev => (prev < total ? prev + 10 : prev));
        }
      },
      { rootMargin: '400px' },
    );
    for (const el of nodes) io.observe(el);
    return () => io.disconnect();
  }, [activePrimaryTab, filteredProducts.length, filteredSellListings.length, visibleCount, listSentinel, listSentinel.version]);

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
    trackEvent('search_query', { meta: { query: raw, result_count: filteredProducts.length } });

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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20 transition-colors">
      <div className="sticky top-0 z-50 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 md:hidden pt-[env(safe-area-inset-top)]">
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
              className="flex-1"
            >
              {/*
                送出鈕與清除鈕都收進輸入框裡（老闆指定的版型）：
                右側疊一組 absolute 的按鈕，叉叉在左、搜尋在右。
                輸入框的 pr 要留得比這組按鈕寬，不然打字會鑽到按鈕底下。
              */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 stroke-[2.5]" />
                <input
                  ref={inputRef}
                  value={query}
                  autoFocus={!!focusParam}
                  onFocus={() => setIsInputFocused(true)}
                  // 沒有 onBlur 的話 isInputFocused 只會在送出／按叉叉時才變 false，
                  // 點到別處仍算「聚焦中」—— 叉叉會一直留著
                  onBlur={() => setIsInputFocused(false)}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="曾經搜尋平凡的商品"
                  className="w-full h-10 bg-neutral-100 dark:bg-neutral-800 rounded-full pl-9 pr-[86px] text-[16px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  inputMode="search"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {/*
                    顯示條件（老闆指定）：有輸入**或**聚焦中。
                    · 有字 → 要能清掉，即使沒聚焦（例如帶 ?q= 進來）
                    · 沒字但聚焦 → 面板開著，這顆同時是「收起面板」的出口
                    · 沒字又沒聚焦 → 藏起來，空框不擺一個沒作用的叉叉
                  */}
                  {(isInputFocused || !!query) && (
                    <button
                      type="button"
                      // 不擋的話 mousedown 會先讓輸入框失焦，這顆按鈕在 click 送到前就消失了
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleSearchSubmit('');
                        setIsInputFocused(false);
                        inputRef.current?.blur();
                      }}
                      className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                      aria-label="清除搜尋"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-3.5 h-8 rounded-full bg-primary text-white text-[12px] font-black whitespace-nowrap active:scale-95 transition-transform"
                  >
                    搜尋
                  </button>
                </div>
              </div>
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
            /*
              onMouseDown preventDefault：輸入框現在有 onBlur 會關掉 isInputFocused，
              而這層面板的顯示條件就是 isInputFocused。少了這行，點面板裡任何一顆按鈕
              都會先觸發 blur → 面板在 click 送到之前就被卸載 → 點了沒反應。
            */
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-0 right-0 top-[57px] bottom-[-100vh] z-50 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800"
            >
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
                {trimmedQuery ? '找不到相關商品，試試其他關鍵字' : '目前沒有商城商品'}
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
                        <Image src={listing.image || asset('/images/item_defaulet.webp')} alt={listing.title} fill className="object-cover" unoptimized />
                      </div>

                      <div className="flex flex-col p-2">
                        <div className="mb-1 h-[2.75rem]">
                          <h3 className="text-[14px] font-normal text-neutral-900 dark:text-white line-clamp-2 leading-[1.25] break-all">
                            <span className="inline align-[2px] mr-1 px-1 py-[3px] text-[8px] font-medium text-white rounded-[4px] shadow-lg uppercase tracking-wider bg-opacity-90 bg-primary shadow-primary/20">
                              商城
                            </span>
                            <span className="inline">{listing.title}</span>
                          </h3>
                        </div>

                        <div className="mt-auto pt-2 border-t border-neutral-100 dark:border-neutral-800">
                          <div className="flex items-end justify-between gap-1">
                            <div className="flex items-center gap-1">
                              <div className="w-3.5 h-3.5">
                                <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="w-full h-full object-contain" />
                              </div>
                              <span className="text-[24px] leading-none font-black font-amount text-amount tracking-tight">
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
                  <div ref={listSentinel.register} className="flex justify-center py-6 text-[13px] font-black text-neutral-400">
                    載入中...
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
                                <Image src={listing.image || asset('/images/item_defaulet.webp')} alt={listing.title} fill className="object-cover" unoptimized />
                              </div>

                              <div className="flex flex-col p-2">
                                <div className="mb-1 h-[2.75rem]">
                                  <h3 className="text-[14px] font-normal text-neutral-900 dark:text-white line-clamp-2 leading-[1.25] break-all">
                                    <span className="inline align-[2px] mr-1 px-1 py-[3px] text-[8px] font-medium text-white rounded-[4px] shadow-lg uppercase tracking-wider bg-opacity-90 bg-primary shadow-primary/20">
                                      商城
                                    </span>
                                    <span className="inline">{listing.title}</span>
                                  </h3>
                                </div>

                                <div className="mt-auto pt-2 border-t border-neutral-100 dark:border-neutral-800">
                                  <div className="flex items-end justify-between gap-1">
                                    <div className="flex items-center gap-1">
                                      <div className="w-3.5 h-3.5">
                                        <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="w-full h-full object-contain" />
                                      </div>
                                      <span className="text-[24px] leading-none font-black font-amount text-amount tracking-tight">
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
                            cardsPerPack={(product as any).cards_per_pack}
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
                        cardsPerPack={(product as any).cards_per_pack}
                        isHot={product.is_hot}
                        type={product.type}
                        status={product.status}
                        onNavigate={persistSearchState}
                      />
                    ))}
              </div>
              {visibleCount < filteredProducts.length && (
                  <div ref={listSentinel.register} className="flex justify-center py-6 text-[13px] font-black text-neutral-400">
                    載入中...
                  </div>
                )}
            </>
          )}
        </div>

        <div className="hidden md:block">
          <div className="mt-1">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSearchSubmit(); }}
              className="mb-5"
            >
              {/* 同手機版：送出鈕與清除鈕都收進輸入框內側，叉叉在左、搜尋在右 */}
              <div className="relative max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 stroke-[2.5]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋商品名稱、系列..."
                  className="w-full h-11 bg-neutral-100 dark:bg-neutral-800 rounded-full pl-9 pr-[104px] text-[15px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {query && (
                    <button
                      type="button"
                      onClick={() => handleSearchSubmit('')}
                      className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                      aria-label="清除搜尋"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 h-8 rounded-full bg-primary text-white text-[13px] font-black whitespace-nowrap hover:bg-primary/90 transition-colors"
                  >
                    搜尋
                  </button>
                </div>
              </div>
            </form>
            <h1 className="text-xl font-black text-neutral-900 dark:text-white tracking-tight px-0.5 mb-1">
              {mobileTitle}
            </h1>
            <div className="px-0.5 text-xs font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-3">
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
                      cardsPerPack={(product as any).cards_per_pack}
                      isHot={product.is_hot}
                      type={product.type}
                      status={product.status}
                      onNavigate={persistSearchState}
                    />
                  ))}
                </div>
                {visibleCount < filteredProducts.length && (
                  <div ref={listSentinel.register} className="flex justify-center py-6 text-[13px] font-black text-neutral-400">
                    載入中...
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
