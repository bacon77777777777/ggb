'use client';
// v3
import { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react';
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
import { HOME_TABS_EVENT, SET_HOME_TAB_EVENT } from '@/lib/desktopShell';
import CardxPage from '@/components/cardx/CardxPage';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { categoryState } from '@/lib/categoryFlags';
import { trackPageView, trackScrollDepth, trackEvent } from '@/lib/trackEvent';
import { filterBannersBySchedule } from '@/lib/schedule';
import { isJustRefreshed } from '@/lib/contentRefresh';
import { thumbUrl } from '@/lib/productImage';
import { restoreScrollTo } from '@/lib/restoreScroll';
import PromoPopup from '@/components/promo/PromoPopup';
import FanMenu from '@/components/home/FanMenu';
import NoticeBar from '@/components/promo/NoticeBar';
import { PRODUCT_PUBLIC_COLUMNS } from '@/lib/productColumns'
import { useSwipeTabs } from '@/lib/useSwipeTabs';
import { asset } from '@/lib/asset';
import { useStatusBarText } from '@/components/native/StatusBarStyle';
import { useQueryClient } from '@tanstack/react-query';
import { swrLoad } from '@/lib/swr';
import { HOME_KEY, fetchHomeCatalog } from '@/lib/queries/home';
import { assembleFeed, seededRng, type FeedBucket, type FeedSignals, type FeedCtrItem } from '@/lib/feed/assemble';
import { loadSeenRounds, saveRound } from '@/lib/feed/memory';
import { resolveVariant } from '@/lib/feed/variant';
import { sessionIntent } from '@/lib/feed/session';
import { fetchJson } from '@/lib/swr';
import { useSentinelRegistry } from '@/lib/useSentinelRegistry';

type ProductRow = Database['public']['Tables']['products']['Row'];
type BannerRow = Database['public']['Tables']['banners']['Row'];

type SortMode = 'latest' | 'hot' | 'price-asc' | 'price-desc' | 'sold-out';

/**
 * 輪播圖「首頁頁籤」可以指定的內建頁籤 id（網址 `/?tab=<id>`）。
 *
 * 後台 `app/banners/page.tsx` 的下拉選單要跟這份一致，改了記得兩邊一起改。
 * 不收 `exchange`：那個頁籤目前沒有畫面（`filteredExchangeOffers` 算了但沒渲染）。
 * 自建分類不在這裡，走 `/?menu=<uuid>`。
 */
const BUILT_IN_TAB_IDS = ['all', 'ichiban', 'blindbox', 'gacha', 'card', 'custom', 'sell'] as const;

/*
 * 推薦頁的排序凍結在「這一趟」（老闆 2026-08-30）
 *
 * 原本每次掛載都換一顆種子重抽一輪 —— 從商品頁返回時位置雖然還原了，
 * 卡片卻已經整片換過，等於停在一堆沒看過的商品上，記憶位置就白記了。
 * 改成把算好的順序放模組層，返回沿用；**只有下拉刷新與整頁重載才重抽**
 *（下拉刷新是 PathnameKeyed 重掛，不是 reload，所以要自己聽事件清掉）。
 */
type FrozenFeed = {
  order: Map<string, number>;
  meta: Map<string, { bucket: FeedBucket; position: number }>;
};
/**
 * 每個主分類各凍結一份（老闆 2026-08-30）
 *
 * 只存一份的話，「綜合捲到一半 → 切去轉蛋 → 切回綜合」會把綜合那份蓋掉，
 * 切回來就重排了 —— 但玩家並沒有下拉刷新，不該換。
 */
const sessionFeedOrders = new Map<string, FrozenFeed>();
if (typeof window !== 'undefined') {
  // 下拉刷新＝每一個分類都重抽（玩家要的就是「換一批」）
  window.addEventListener('ggb:content-refresh', () => { sessionFeedOrders.clear(); });
}

export default function Home() {
  const homeRestoreKey = 'gachago:home_restore';

  /* 動態島文字：手機端首頁的導航列吃主題色（Navbar 的 surfaceClassName
     `bg-primary`，不隨捲動改變），白字。桌機那條是白底，但 App 只有手機版。 */
  useStatusBarText('white', '#EE4D2D');
  const homeStateKey = 'gachago:home_state';

  const [allProducts, setAllProducts] = useState<ProductRow[]>([]);
  const [banners, setBanners] = useState<Database['public']['Tables']['banners']['Row'][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());
  const queryClient = useQueryClient();
  const { flags, states: flagStates, isLoading: isFlagsLoading } = useFeatureFlags();
  const { user } = useAuth();
  // Map<series, score> — populated from get_user_series_preferences RPC
  const [userSeriesPref, setUserSeriesPref] = useState<Map<string, number>>(new Map());
  // Map<series, score> — global platform popularity (used as default for new users)
  const [globalSeriesPop, setGlobalSeriesPop] = useState<Map<string, number>>(new Map());
  // Map<product_id, score> — 商品層熱度（近期真人抽數，含時間衰減）。
  // 系列分只知道「哪個 IP 紅」，這張表才知道「同一個 IP 裡哪一檔紅」
  const [productHeat, setProductHeat] = useState<Map<number, number>>(new Map());
  /*
   * 推薦 feed（老闆 2026-08-22：要像 IG／短影音）—— 組裝邏輯在 lib/feed/assemble.ts。
   * feedAux：話題（/api/public/topics）、近 14 天曝光／點擊（/api/public/feed-weights，Thompson 用）、A/B 比例。
   * feedRng：每次掛載一顆種子 —— 導航進來、下拉刷新、從別頁回來都是新的一輪；同一次掛載內
   *           偏好／熱度陸續到齊時重算，拿同一顆種子才不會在玩家眼前重洗。
   * feedMeta：商品 id → 桶別／位置，給 ProductCard 記曝光／點擊用。
   */
  const [feedAux, setFeedAux] = useState<{ topics: { keyword: string; weight: number }[]; ctr: FeedSignals['ctr']; abRatio: number }>({
    topics: [], ctr: { mean: 0.03, items: new Map() }, abRatio: 0,
  });
  const [follows, setFollows] = useState<Set<number>>(new Set());
  const [feedVariant, setFeedVariant] = useState<'v1' | 'v2'>('v2');
  /*
   * 電腦端（≥1024）首頁的兩種檢視（老闆 2026-09-04，照 cardx）：
   *   sections：總覽 —— 推薦一列、每個分類一列，各自「查看全部」
   *   grid：某一籤的完整格子（頂部頁籤那套：系列膠囊＋排序＋價格區間）
   * 分類頁籤（非綜合）一律是 grid；綜合才分兩種。手機端不看這個值。
   */
  const [desktopView, setDesktopView] = useState<'sections' | 'grid'>('sections');
  const feedSeed = useRef<number>(Math.floor(Math.random() * 0xffffffff));
  const feedMeta = useRef<Map<string, { bucket: FeedBucket; position: number }>>(new Map());
  /*
   * 這一輪的「看過記憶」只在掛載時讀一次（老闆 2026-08-24：首頁推薦一直跳來跳去）。
   * 以前每次重算都 loadSeenRounds()，而重算前一步才剛 saveRound() —— 等於把自己
   * 剛顯示的六件標成「看過」再重排，形成回饋迴圈，畫面就一直翻。
   */
  const feedSeenRounds = useRef<string[][] | null>(null);
  if (feedSeenRounds.current === null) feedSeenRounds.current = loadSeenRounds();
  /*
   * 凍結這一輪的排序。個人偏好／熱度／話題／點擊率是各自非同步到齊的，
   * 每到一個就重算一次 assembleFeed → 玩家眼前的卡片位置整片換掉。
   * 改成：同一輪（同一顆種子＋同一個頁籤＋同一批商品）只抽一次籤，之後沿用；
   * 晚到的訊號留給下一輪（導航、下拉刷新、回首頁都會換種子）。
   */
  const feedOrder = useRef<{ key: string; order: Map<string, number> } | null>(null);
  /** 這一輪算出來的首屏（等排序穩定後才寫進看過記憶，見下方 effect） */
  const feedFirstScreen = useRef<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      queryClient.fetchQuery({ queryKey: ['feed', 'topics'], queryFn: () => fetchJson<{ keyword: string; weight: number }[]>('/api/public/topics'), staleTime: 10 * 60 * 1000 }).catch(() => []),
      queryClient.fetchQuery({ queryKey: ['feed', 'weights'], queryFn: () => fetchJson<{ mean: number; items: Record<string, FeedCtrItem>; abRatio: number }>('/api/public/feed-weights'), staleTime: 5 * 60 * 1000 }).catch(() => null),
    ]).then(([topics, w]) => {
      if (!alive) return;
      const items = new Map<number, FeedCtrItem>();
      if (w) for (const [id, v] of Object.entries(w.items || {})) items.set(Number(id), v);
      setFeedAux({ topics: Array.isArray(topics) ? topics : [], ctr: { mean: w?.mean ?? 0.03, items }, abRatio: w?.abRatio ?? 0 });
      setFeedVariant(resolveVariant(w?.abRatio ?? 0));
    });
    return () => { alive = false; };
  }, [queryClient]);
  useEffect(() => {
    if (!user?.id) { setFollows(new Set()); return; }
    let alive = true;
    supabase.from('product_follows').select('product_id').eq('user_id', user.id).limit(500)
      .then(({ data }) => { if (alive) setFollows(new Set((data ?? []).map(r => Number(r.product_id)))); });
    return () => { alive = false; };
  }, [user?.id, supabase]);
  /*
   * 有幾個分類頁籤存在。
   *
   * 這裡問的是「頁籤在不在」，不是「能不能抽」，所以用 state 而不是 flags ——
   * 維護中的 flags 是 false，拿它來數會把維護中的頁籤當成不存在，
   * 於是下面那段 effect 一路把使用者踢回「綜合」，點都點不進去。
   */
  const visibleCategories = (['ichiban', 'blindbox', 'gacha', 'card', 'custom'] as const)
    .filter(t => categoryState(t, flagStates, false) !== 'off');
  const enabledPrimaryFeatureCount = visibleCategories.length + (flags.sell ? 1 : 0);
  const hasAnyPrimaryFeature = enabledPrimaryFeatureCount > 0;
  const hidePrimaryTabs = enabledPrimaryFeatureCount < 2;
  const singlePrimaryTab: PrimaryTabId | null =
    enabledPrimaryFeatureCount === 1
      ? (flags.sell ? 'sell' : ((visibleCategories[0] as PrimaryTabId) ?? null))
      : null;

  const fetchData = useCallback(async () => {
    /*
     * 先套快取、再背景更新（lib/swr.ts）—— 老闆 2026-08-22 頁面加載優化 ③④。
     * 商品／輪播／分類改走 /api/public/home（CDN 邊緣快取 15 秒，該 route 有說明）。
     * 回到首頁時快取裡有上次的資料就直接畫、不閃骨架屏；重抓到了再無聲換掉。
     */
    try {
      setLoadError(null);
      if (!queryClient.getQueryData(HOME_KEY)) setIsLoading(true);
      await swrLoad(queryClient, HOME_KEY, fetchHomeCatalog, (d) => {
        setAllProducts(d.products as ProductRow[]);
        setBanners(filterBannersBySchedule(d.banners as any[]) as BannerRow[]);
        setMenus(d.menus);
        setIsLoading(false);
      });
    } catch (error) {
      console.warn('[Home] catalog fetch failed:', error);
      // 有快取就讓舊畫面留著，只在完全沒東西時才顯示錯誤
      if (!queryClient.getQueryData(HOME_KEY)) setLoadError('無法載入商品列表，請檢查網路連線');
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => {
      setActivePrimaryTab('all');
      setDesktopView('sections');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('ggb:resetHome', handler);
    return () => window.removeEventListener('ggb:resetHome', handler);
  }, []);

  /*
   * 電腦端左側欄（components/desktop/DesktopSidebar）跟首頁的頁籤講話（lib/desktopShell 有說明）：
   * 側欄要切籤就發 SET_HOME_TAB_EVENT 過來；這裡把頁籤清單與選中項播出去給它畫。
   * handlePrimaryTabChange 是元件裡的一般函式，用 ref 拿最新的那一份，事件只掛一次。
   */
  const primaryTabChangeRef = useRef<(id: PrimaryTabId) => void>(() => {});
  primaryTabChangeRef.current = handlePrimaryTabChange;
  const primaryTabsRef = useRef<{ id: PrimaryTabId; label: string }[]>([]);
  useEffect(() => {
    const onSet = (e: Event) => {
      const id = (e as CustomEvent<string>).detail as PrimaryTabId;
      if (!primaryTabsRef.current.some((t) => t.id === id)) return;
      primaryTabChangeRef.current(id);
    };
    window.addEventListener(SET_HOME_TAB_EVENT, onSet);
    return () => window.removeEventListener(SET_HOME_TAB_EVENT, onSet);
  }, []);

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

  // 商品層熱度（取代原本的 is_hot 排序 —— is_hot 現在純粹是後台手動的精選標籤）
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
  const [isCategoryChanging, setIsCategoryChanging] = useState(false);
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
  const sellSentinel = useSentinelRegistry();
  const secondaryTabsRef = useRef<HTMLDivElement>(null);
  const restoringSecondaryTabRef = useRef<string | null>(null);
  const restoringScrollRef = useRef<number | null>(null);
  /*
   * 返回時要接回去的「已載入幾筆」（老闆 2026-08-30）
   *
   * 只還原捲動位置是不夠的：列表每次掛載都退回第一批 10 筆，頁面高度不到當初的
   * 一半，scrollTo 會被瀏覽器夾在那個高度的底部 —— 不管當初捲到哪，返回後都停在
   * 同一個地方。until 是「還原中」的有效期，過了就恢復正常的換頁籤重置。
   */
  const restoringCountRef = useRef<{ count: number; until: number } | null>(null);
  const [homeDisplayCount, setHomeDisplayCount] = useState(10);
  const homeSentinel = useSentinelRegistry();

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

  /*
   * 網址帶頁籤 → 直接切到那一籤，不另開頁面。輪播圖的「首頁頁籤」就走這個。
   *
   *   /?tab=<內建頁籤 id>   例：/?tab=ichiban（一番賞）
   *   /?menu=<分類 id>      例：/?menu=<uuid>（老闆自建的分類，如「開學買五送一」）
   *
   * 兩個參數並存是為了相容：`?menu=` 先做、正式站已經有輪播圖在用，不能換掉。
   *
   * 這樣輪播圖點下去是在首頁換頁籤，玩家還留在原本的瀏覽流程裡，
   * 上面那排分類頁籤也還在，想跳去別類直接點就好 —— 比開一個
   * 只有商品格的獨立促銷頁順。/promo/[id] 保留，那個網址還能對外分享。
   *
   * 讀 window.location 而不是 useSearchParams：後者在 App Router 需要
   * Suspense 邊界，為了一個參數把整頁包起來不划算。
   *
   * ⚠️ 代價是這個值不會自己更新，所以三個入口都要各自打一次 goToHomeTab()：
   * 掛載（從別頁進來）、popstate（上一頁／下一頁）、輪播圖點擊。
   * 少了第三個就是老闆回報的那個 bug —— 人已經在首頁時點輪播圖，
   * next/link 走同路由的淺導覽，網址換了但 Home 不會重新掛載，
   * 頁籤原地不動；重新整理才會重新掛載，所以「刷新就對了」。
   */
  /** 被網址帶去某一籤之前待在哪，按上一頁時要退回去 */
  const tabBeforeDeepLinkRef = useRef<PrimaryTabId | null>(null);
  const deepLinkedTabRef = useRef<PrimaryTabId | null>(null);

  const goToHomeTab = useCallback((tabId: PrimaryTabId) => {
    deepLinkedTabRef.current = tabId;
    setActivePrimaryTab((prev) => {
      if (prev === tabId) return prev;
      tabBeforeDeepLinkRef.current = prev;
      return tabId;
    });
    setActiveSecondaryTab('all');
    // 帶參數進來就不要再套用上次離開時的頁籤
    sessionStorage.removeItem(homeRestoreKey);
    restoringScrollRef.current = null;
    restoringCountRef.current = null;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [homeRestoreKey]);

  /** 網址上的頁籤參數不見了（按上一頁）→ 退回被帶走之前的那一籤 */
  const leaveDeepLinkedTab = useCallback(() => {
    setActivePrimaryTab((prev) => {
      if (prev !== deepLinkedTabRef.current) return prev;
      const back = tabBeforeDeepLinkRef.current ?? ('all' as PrimaryTabId);
      tabBeforeDeepLinkRef.current = null;
      deepLinkedTabRef.current = null;
      return back;
    });
    setActiveSecondaryTab('all');
  }, []);

  /**
   * 連到首頁且帶頁籤參數的網址 → 取出頁籤 id，其餘回 null。
   *
   * `?tab=` 只認內建那幾顆（白名單），不然後台打錯字會切到一個不存在的籤、
   * 畫面整片空白還沒有任何提示。自建分類走 `?menu=`，id 是 uuid 沒得比對。
   */
  const homeTabFromHref = useCallback((href: string): PrimaryTabId | null => {
    if (typeof window === 'undefined') return null;
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname !== '/') return null;
      const menu = url.searchParams.get('menu');
      if (menu) return `menu:${menu}` as PrimaryTabId;
      const tab = url.searchParams.get('tab');
      return tab && (BUILT_IN_TAB_IDS as readonly string[]).includes(tab)
        ? (tab as PrimaryTabId)
        : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tab = homeTabFromHref(window.location.href);
    if (tab) goToHomeTab(tab);

    const onPop = () => {
      const next = homeTabFromHref(window.location.href);
      if (next) goToHomeTab(next);
      else leaveDeepLinkedTab();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [goToHomeTab, leaveDeepLinkedTab, homeTabFromHref]);

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
        displayCount?: number;
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
      if (typeof parsed.displayCount === 'number' && parsed.displayCount > 10) {
        restoringCountRef.current = { count: parsed.displayCount, until: Date.now() + 3000 };
        setHomeDisplayCount(parsed.displayCount);
      }
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
    // 維護中的類別頁籤照常出現 —— 那是「暫時停一下」，藏起來玩家會以為我們不做了。
    // 只有「關閉」才整個消失。維護中不在頁籤上加註記：那會把每個頁籤撐得一長一短，
    // 而且點進去本來就會說明，講兩次沒有比較清楚
    const CATEGORY_TABS: { id: PrimaryTabId; label: string; type: string }[] = [
      { id: 'ichiban',  label: '一番賞', type: 'ichiban' },
      { id: 'blindbox', label: '盒玩',   type: 'blindbox' },
      { id: 'gacha',    label: '轉蛋',   type: 'gacha' },
      { id: 'card',     label: '抽卡',   type: 'card' },
      { id: 'custom',   label: '自製賞', type: 'custom' },
    ];
    // 抽獎首頁不放「商城」頁籤（老闆指定）——
    // 商城有自己的入口與獨立版型，混在抽獎的分類頁籤裡會讓兩邊的動線互相干擾。
    // 之後要加回來，把這行還原即可（flags.sell 仍然控制商城本身開不開）。
    for (const t of CATEGORY_TABS) {
      if (categoryState(t.type, flagStates, false) === 'off') continue;
      base.push({ id: t.id, label: t.label });
    }
    const menuTabs = menus.map((m) => ({ id: `menu:${m.id}` as PrimaryTabId, label: m.name }));
    return [...base, ...menuTabs];
  }, [flagStates, menus]);
  primaryTabsRef.current = primaryTabs;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(HOME_TABS_EVENT, { detail: { tabs: primaryTabs, active: activePrimaryTab } }));
  }, [primaryTabs, activePrimaryTab]);

  /*
   * 這兩段是「頁籤不存在就別停在上面」的保護，但**功能旗標載完之前不能動手**。
   *
   * 旗標還在載的時候 flagStates 是空的，數出來的分類數是 0 ——
   * 於是 `/?tab=ichiban` 這種深連結才剛把頁籤切過去，就被這裡打回「綜合」。
   * 冷開必中、熱開（旗標已在 context 裡）反而正常，很難重現。
   */
  useEffect(() => {
    if (isFlagsLoading) return;
    if (!singlePrimaryTab) return;
    if (activePrimaryTab !== singlePrimaryTab) setActivePrimaryTab(singlePrimaryTab);
  }, [activePrimaryTab, isFlagsLoading, singlePrimaryTab]);

  useEffect(() => {
    if (isFlagsLoading) return;
    if (hasAnyPrimaryFeature) return;
    if (activePrimaryTab !== 'all') setActivePrimaryTab('all');
  }, [activePrimaryTab, hasAnyPrimaryFeature, isFlagsLoading]);

  useEffect(() => {
    if (!activePrimaryTab.startsWith('menu:')) return;
    const menuId = activePrimaryTab.slice('menu:'.length);
    if (!menuId || menuProductIdsByMenuId[menuId]) return;
    const fetchProductIds = async () => {
      const { data, error } = await supabase
        .from('product_categories')
        .select('product_id')
        .eq('category_id', menuId)
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
          // 維護中與關閉的商品都不列出。差別在頁籤：維護中的頁籤還在，
          // 點進去會說「此分類暫時維護中」；關閉的整個頁籤都不見
          return categoryState(product.type, flagStates, false) === 'on';
        }

        if (activePrimaryTab.startsWith('menu:')) {
          const menuId = activePrimaryTab.slice('menu:'.length);
          const ids = menuProductIdsByMenuId[menuId];
          if (!ids) return false;
          // 自訂選單也要看類別開關 —— 選單是後台手動挑的商品清單，
          // 沒濾的話關掉「轉蛋」之後轉蛋商品還是會從這裡漏出來
          if (categoryState(product.type, flagStates, false) !== 'on') return false;
          return ids.includes(Number(product.id));
        }

        if (activePrimaryTab === 'card') {
          if (categoryState('card', flagStates, false) !== 'on') return false;
          const category = product.category || '';
          if (product.type === 'card') return true;
          return category.includes('卡') || category.toLowerCase().includes('card');
        }

        if (categoryState(product.type, flagStates, false) !== 'on') return false;
        return product.type === activePrimaryTab;
      });
    },
    [activePrimaryTab, flagStates, menuProductIdsByMenuId]
  );

  /*
   * 閒置時預抓其他主分類的前幾張小卡圖（老闆 2026-09-03：滑到下一個頁籤圖要已經在快取裡）。
   * 各分類的推薦順序要到那個頁籤才會抽，這裡抓不到「將來的首屏」，退而求其次抓各類型
   * 最新的六件（fresh 桶＋頭部多半就是這些）。用 thumbUrl 抓縮圖，跟小卡吃的是同一個網址，
   * 瀏覽器快取才對得上。requestIdleCallback：不跟首屏搶頻寬。
   */
  useEffect(() => {
    if (typeof window === 'undefined' || allProducts.length === 0) return;
    const run = () => {
      const byType = new Map<string, ProductRow[]>();
      for (const p of allProducts) {
        if (p.type === activePrimaryTab) continue;
        const list = byType.get(p.type) ?? [];
        if (list.length < 6) { list.push(p); byType.set(p.type, list); }
      }
      for (const list of byType.values()) {
        for (const p of list) {
          const src = thumbUrl(p.image_url);
          if (src) { const img = new window.Image(); img.decoding = 'async'; img.src = src; }
        }
      }
    };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const handle = idle ? idle(run, { timeout: 4000 }) : window.setTimeout(run, 2500);
    return () => { if (idle) (window as unknown as { cancelIdleCallback: (h: number) => void }).cancelIdleCallback(handle); else window.clearTimeout(handle); };
  }, [allProducts, activePrimaryTab]);

  // 二級頁籤最多顯示幾顆。轉蛋光是現在就有 18 個系列，抓 14 會有四個
  // 系列永遠顯示不出來、畫面上也沒有任何提示（老闆指定放寬到 20）
  const MAX_SERIES_TABS = 20;

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
      .slice(0, MAX_SERIES_TABS)
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
        if (ordered.length >= MAX_SERIES_TABS) break;
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

  /*
   * 推薦頁的「刷新有新鮮感」機制（老闆 2026-08-21 核准的做法）：
   *
   * 1. 頭部固定：分數最高的前 HEAD_KEEP 件照實力排，轉換主力不動
   * 2. 其餘加權洗牌：每次掛載（導航進來或下拉刷新重掛）發一副新的隨機權重，
   *    分數高的仍常在前排，但每次刷都有新面孔，尾部商品也輪得到曝光
   * 3. 看過降權：上一輪排在前面的（幾乎必然被看過）這一輪分數打折往後沉，
   *    「刷新＝給我沒看過的」才有感。上一輪頭部記在 sessionStorage
   *
   * 只動「推薦」頁籤；系列頁籤與價格排序是工具性瀏覽，維持確定性。
   * jitter 表放 ref：同一次掛載內 sort 要穩定，不能在 comparator 裡擲骰子。
   */
  const HEAD_KEEP = 5;
  const SEEN_DEMOTE = 0.3;
  const feedJitter = useRef<Map<string, number>>(new Map());
  const jitterOf = (id: string) => {
    let v = feedJitter.current.get(id);
    if (v === undefined) {
      v = Math.random();
      feedJitter.current.set(id, v);
    }
    return v;
  };
  const seenTop = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      seenTop.current = new Set(JSON.parse(sessionStorage.getItem('ggb:feed:seen') || '[]'));
    } catch { /* 讀不到就當沒看過 */ }
  }, []);

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
      } else if (sortMode === 'hot') {
        /*
         * 熱門（老闆 2026-08-26）：照 get_popular_products 的熱度分數由高到低。
         *
         * 那個分數是近期抽數的加權和 —— 7 天內每抽算 1 分、30 天內 0.5、更早 0.2，
         * 且已排除機器人。用它而不是 `is_hot`：後者是後台手動掛的精選標籤，
         * 跟「真的多少人在抽」是兩回事。
         *
         * 沒有人抽過的商品分數是 0，會落在後段；同分時照上架時間新到舊，
         * 免得每次刷新順序都在跳。
         */
        result.sort((a, b) => {
          const heatA = productHeat.get(Number(a.id)) || 0;
          const heatB = productHeat.get(Number(b.id)) || 0;
          if (heatA !== heatB) return heatB - heatA;
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });
      } else if (
        activeSecondaryTab === 'featured' &&
        sessionFeedOrders.has(activePrimaryTab) &&
        /* 空的凍結表視同沒有（老闆 2026-09-03：Safari 整頁重新整理推薦不會換）。
           首次載入時這個 memo 會先跑一次「商品還沒到、0 件」的 v2 分支，以前那一次就把空表
           凍結進來；商品到了之後就一路走這條「沿用」分支，空表對不到任何商品、全部照 API
           原始順序排 —— 等於推薦從來沒真的洗過牌。下拉更新看起來正常只是因為 isJustRefreshed()
           那 2 秒把這條擋掉了 */
        sessionFeedOrders.get(activePrimaryTab)!.order.size > 0 &&
        // 下拉更新要換一輪。除了上面那個事件監聽，這裡再用 isJustRefreshed() 擋一次 ——
        // 監聽器與 PathnameKeyed 的重掛誰先誰後不該由我們賭，這個旗標是重掛前就標好的
        !isJustRefreshed()
      ) {
        // 這個分類這一趟已經抽過籤了（返回首頁、切回這一籤）：沿用同一份順序，不重抽
        const { order, meta } = sessionFeedOrders.get(activePrimaryTab)!;
        feedMeta.current = meta;
        result = [...result].sort(
          // 這一輪之後才上架的商品沒有名次，排在最後面
          (a, b) => (order.get(String(a.id)) ?? 1e9) - (order.get(String(b.id)) ?? 1e9),
        );
      } else if (activeSecondaryTab === 'featured' && feedVariant === 'v2') {
        /*
         * 新 feed（老闆 2026-08-22）：分桶配額＋加權抽籤＋Thompson 學習權重＋看過懲罰，
         * 每次掛載一輪、首屏保證換新面孔，所有商品都有機會（explore 桶）。詳見 lib/feed/assemble.ts。
         */
        const signals: FeedSignals = {
          seriesPref: userSeriesPref.size > 0 ? userSeriesPref : globalSeriesPop,
          heat: productHeat,
          follows,
          topics: feedAux.topics,
          ctr: feedAux.ctr,
          session: sessionIntent(),
          isGuest: !user,
        };
        // 同一輪沿用既有順序（見 feedOrder 的說明）；商品清單本身變了才重抽
        const orderKey = `${feedSeed.current}|${activePrimaryTab}|${result.length}|${result.map(p => p.id).join(',')}`;
        if (feedOrder.current?.key === orderKey) {
          const order = feedOrder.current.order;
          result = [...result].sort(
            (a, b) => (order.get(String(a.id)) ?? 1e9) - (order.get(String(b.id)) ?? 1e9),
          );
        } else {
          const items = assembleFeed(result, signals, feedSeenRounds.current ?? [], seededRng(feedSeed.current));
          feedMeta.current = new Map(items.map(i => [String(i.product.id), { bucket: i.bucket, position: i.position }]));
          feedOrder.current = {
            key: orderKey,
            order: new Map(items.map(i => [String(i.product.id), i.position])),
          };
          result = items.map(i => i.product);
          // 0 件（商品還沒到）不凍結也不記首屏 —— 見上面「空的凍結表」的說明
          if (result.length > 0) {
            feedFirstScreen.current = result.slice(0, 6).map(p => String(p.id));
            sessionFeedOrders.set(activePrimaryTab, {
              order: feedOrder.current.order,
              meta: feedMeta.current,
            });
          }
        }
      } else if (activeSecondaryTab === 'featured') {
        const prefMap = userSeriesPref.size > 0 ? userSeriesPref : globalSeriesPop;
        /*
         * 不管有沒有系列偏好分數都要洗牌。以前包在 `if (prefMap.size > 0)` 裡 ——
         * 沒有偏好資料（新帳號、訪客、資料還沒累積）時整段跳過、照 API 的上架時間排，
         * 下拉刷新永遠同一個順序（老闆 2026-08-22 回報）。沒有分數時 scoreOf 全是 0，
         * 權重只剩熱度＋1，頭部照熱度固定、其餘照樣每刷換一輪。
         */
        {
          /*
           * 新品曝光期：上架 7 天內的商品，系列分保底拉到「熱度榜中位數」。
           *
           * 不這樣做會有死結 —— 全新 IP 的系列分是 0，在推薦頁被埋在所有
           * 有分的系列後面；但玩家看不到就不會抽，不抽就永遠拿不到分。
           * 保底取中位數而不是最高分：新品進得了上半部，但不會蓋過真正
           * 賣得動的那幾檔。過了 7 天就自動掉回自己系列的真實分數。
           */
          const scored = Array.from(prefMap.values()).filter(v => v > 0).sort((x, y) => x - y);
          const newcomerFloor = scored.length > 0 ? scored[Math.floor(scored.length / 2)] : 0;
          const NEW_WINDOW_MS = 7 * 24 * 3600 * 1000;
          const now = Date.now();
          const scoreOf = (p: ProductRow) => {
            const base = prefMap.get(p.series || '') || 0;
            const age = p.created_at ? now - new Date(p.created_at).getTime() : Infinity;
            return age <= NEW_WINDOW_MS ? Math.max(base, newcomerFloor) : base;
          };

          // 先照實力排一次，取頭部；剩下的做「看過降權＋加權洗牌」
          const byScore = [...result].sort((a, b) => {
            const scoreA = scoreOf(a);
            const scoreB = scoreOf(b);
            if (scoreA !== scoreB) return scoreB - scoreA;
            // 同一個系列裡，比誰最近真的在賣（is_hot 只是手動精選標籤，不參與排序）
            const heatA = productHeat.get(Number(a.id)) || 0;
            const heatB = productHeat.get(Number(b.id)) || 0;
            if (heatA !== heatB) return heatB - heatA;
            const da = a.created_at ? new Date(a.created_at).getTime() : 0;
            const db = b.created_at ? new Date(b.created_at).getTime() : 0;
            return db - da;
          });
          const head = byScore.slice(0, HEAD_KEEP);
          const tail = byScore.slice(HEAD_KEEP);
          /*
           * 加權隨機排序（exponential ranking）：key = jitter^(1/權重)，
           * 權重取分數＋熱度＋1（全 0 也有基本權重）；看過的整體打折。
           * 分數高 → key 通常大 → 常在前排，但每次掛載的 jitter 不同，
           * 排列每刷一次就換一輪。
           */
          const rankKey = (p: ProductRow) => {
            const w =
              (scoreOf(p) + (productHeat.get(Number(p.id)) || 0) + 1) *
              (seenTop.current.has(String(p.id)) ? SEEN_DEMOTE : 1);
            return Math.pow(jitterOf(String(p.id)), 1 / w);
          };
          tail.sort((a, b) => rankKey(b) - rankKey(a));
          result = [...head, ...tail];
          // 這一輪的順序凍結起來，返回首頁時沿用（見檔案上方 sessionFeedOrders）；0 件不凍結
          if (result.length > 0) sessionFeedOrders.set(activePrimaryTab, {
            order: new Map(result.map((p, i) => [String(p.id), i])),
            meta: feedMeta.current,
          });
          // 這一輪的前排記下來，下一輪降權（上限 24 筆，別把整站都標成看過）
          try {
            sessionStorage.setItem(
              'ggb:feed:seen',
              JSON.stringify(result.slice(0, 24).map((p) => String(p.id))),
            );
          } catch { /* 無痕模式寫不了就沒有降權，無害 */ }
        }
      } else {
        // 系列頁籤：同一個系列內比系列分沒有意義，改用商品熱度 → 新到舊。
        // 以前這裡沒有任何 sort，靠 fetch 的 created_at desc 撐著 ——
        // 看起來對，但只要查詢順序一改就會無聲亂掉
        result.sort((a, b) => {
          const heatA = productHeat.get(Number(a.id)) || 0;
          const heatB = productHeat.get(Number(b.id)) || 0;
          if (heatA !== heatB) return heatB - heatA;
          const da = a.created_at ? new Date(a.created_at).getTime() : 0;
          const db = b.created_at ? new Date(b.created_at).getTime() : 0;
          return db - da;
        });
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
    [filterByPrimaryTab, sortMode, priceMin, priceMax, activeSecondaryTab, userSeriesPref, globalSeriesPop, productHeat, feedVariant, feedAux, follows, user]
  );

  const filteredProducts = useMemo(
    () => applySortAndFilter(allProducts),
    [allProducts, applySortAndFilter]
  );

  /*
   * 排序選單的選項（老闆 2026-08-26）。
   *
   * 手機版與桌面版各有一份一模一樣的清單，改一次要記得改兩處 —— 收成這裡。
   *
   * 第一項在「綜合 → 推薦」底下叫**推薦**、其他分頁叫**最新**：
   * 同樣是 `latest`，在推薦分頁跑的是 feed（分桶配額＋加權抽籤，每次刷新順序都不同），
   * 在別的分頁才是照上架時間。名字跟著實際行為走，不然玩家在推薦頁選「最新」
   * 卻得到一個每次都不一樣的順序，會以為壞了。
   */
  const sortOptions = useMemo<{ id: SortMode; label: string }[]>(() => {
    const first = { id: 'latest' as SortMode, label: activeSecondaryTab === 'featured' ? '推薦' : '最新' };
    if (activePrimaryTab === 'sell') {
      return [
        { id: 'latest' as SortMode, label: '最新' },
        { id: 'price-asc' as SortMode, label: '價格：低到高' },
        { id: 'price-desc' as SortMode, label: '價格：高到低' },
      ];
    }
    return [
      first,
      { id: 'hot' as SortMode, label: '熱門' },
      { id: 'price-asc' as SortMode, label: '價格：低到高' },
      { id: 'price-desc' as SortMode, label: '價格：高到低' },
      { id: 'sold-out' as SortMode, label: '已完抽' },
    ];
  }, [activePrimaryTab, activeSecondaryTab]);

  /*
   * 這一輪首屏記進「看過記憶」，供下一輪降權。寫在 effect 而不是排序當下 ——
   * 排序是 useMemo，會被重算好幾次，在裡面寫 sessionStorage 等於邊算邊改自己的輸入。
   */
  useEffect(() => {
    const first = feedFirstScreen.current;
    if (!first || !first.length) return;
    feedFirstScreen.current = null;
    saveRound(first);
  }, [filteredProducts]);

  // Home page lazy load — reset on tab change
  useEffect(() => {
    // 還原中就先接回當初的筆數（這個 effect 掛載時也會跑一次，而還原頁籤又會讓它再跑）
    const restoring = restoringCountRef.current;
    if (restoring && Date.now() < restoring.until) {
      setHomeDisplayCount(prev => Math.max(prev, restoring.count));
      return;
    }
    restoringCountRef.current = null;
    setHomeDisplayCount(10);
  }, [activePrimaryTab, activeSecondaryTab]);

  /*
   * 分批載入：盯著列表底部的哨兵，看得到就再載 10 筆。
   *
   * 原本只掛 window 的 scroll 事件，在桌機上是壞的 —— 首批 10 張卡在
   * 五欄版面只有兩列，整頁根本沒有捲軸，scroll 事件永遠不觸發，於是
   * 綜合與轉蛋（商品多）就卡在 10 張＋底下一行永遠的「載入中...」。
   * 其他類別只有 4 件商品、一次就載完，所以看起來正常。
   *
   * 哨兵本來就已經掛在 DOM 上，只是沒有人在看它。
   * 改用 IntersectionObserver：不需要捲動也會觸發，會一路補到畫面被填滿
   * 或商品出完為止。
   *
   * 觀察對象走 useSentinelRegistry()（手機／桌機兩份面板各一顆哨兵），
   * 不能只留一個 ref —— 細節見該 hook 的註解。
   */
  useEffect(() => {
    const total = filteredProducts.length;
    if (total === 0 || homeDisplayCount >= total) return;
    const nodes = homeSentinel.liveNodes();
    if (nodes.length === 0) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setHomeDisplayCount(prev => (prev < total ? prev + 10 : prev));
        }
      },
      { rootMargin: '400px' },
    );
    for (const el of nodes) io.observe(el);
    return () => io.disconnect();
    // 切頁籤時兩份面板會重掛哨兵，但商品數與已顯示數有可能剛好沒變
    //（例如兩個頁籤的商品數相同），所以要靠 version 把觀察者重新接上
  }, [filteredProducts.length, homeDisplayCount, homeSentinel, homeSentinel.version]);

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
    restoringScrollRef.current = null;
    sessionStorage.removeItem(homeRestoreKey);
    // 卡片圖載完才撐開版位，一次性的 scrollTo 會被夾住 —— 交給 restoreScrollTo 重試
    return restoreScrollTo(y);
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
      displayCount: homeDisplayCount,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(homeStateKey, JSON.stringify(payload));
    sessionStorage.setItem(homeRestoreKey, '1');
  }, [activePrimaryTab, activeSecondaryTab, sortMode, priceMin, priceMax, homeDisplayCount]);

  // 內容區左右滑 = 切主分類。沿用點擊同一條路（含方向動畫與次分類重設）
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const swipePrimaryTabs = useSwipeTabs(primaryTabs.map(t => t.id), activePrimaryTab, handlePrimaryTabChange);

  function handlePrimaryTabChange(newTabId: PrimaryTabId) {
    if (newTabId === activePrimaryTab) return;
    const oldIndex = primaryTabs.findIndex((t) => t.id === activePrimaryTab);
    const newIndex = primaryTabs.findIndex((t) => t.id === newTabId);
    setDirection(newIndex > oldIndex ? 1 : -1);
    setIsCategoryChanging(true);
    setActivePrimaryTab(newTabId);
    setActiveSecondaryTab('all');
    requestAnimationFrame(() => setIsCategoryChanging(false));
  }

  /*
   * 輪播圖點擊：埋點 + 「連結首頁分類頁籤」就地切頁籤。
   *
   * HeroBanner 走的是 next/link，人已經在首頁時點 `/?menu=<id>` 是同路由的
   * 淺導覽 —— 網址會換、Home 不會重新掛載，所以不能只靠讀網址的那個 effect。
   * 這裡直接從 banner 自己的連結取分類 id，不等網址更新。
   */
  const handleBannerClick = useCallback((banner: { id: string | number; link: string }) => {
    trackEvent('banner_click', { meta: { banner_id: banner.id, link: banner.link } });
    const tab = homeTabFromHref(banner.link);
    if (tab) goToHomeTab(tab);
  }, [goToHomeTab, homeTabFromHref]);

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
                avatar_url: String((d as any)?.avatar_url || asset('/images/avatar.webp')),
              });
            }
          }
        }

        const mapped: SaleListing[] = listingRows.map((row: any) => {
          const sellerId = String(row?.seller_id || '');
          const display = displayById.get(sellerId) || { name: 'user', avatar_url: asset('/images/avatar.webp') };
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
              name: title || (items[0]?.name ? String(items[0].name) : '商城商品'),
              grade: items[0]?.grade ? String(items[0].grade) : '',
              series: items[0]?.series ? String(items[0].series) : '',
              image:
                (imageCandidates[0] ||
                  items.map((x: any) => x.image).filter(Boolean)[0] ||
                  asset('/images/item_defaulet.webp')) as string,
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
    const nodes = sellSentinel.liveNodes();
    if (nodes.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSellPage((p) => p + 1);
      },
      { rootMargin: '600px 0px' }
    );
    for (const node of nodes) io.observe(node);
    return () => io.disconnect();
  }, [activePrimaryTab, sellHasMore, isSellFetchingMore, isSellListingsLoading, sellSentinel, sellSentinel.version]);

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
            displayById.set(id, { name: String((d as any).name || 'user'), avatar_url: String((d as any).avatar_url || asset('/images/avatar.webp')) });
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
          const display = displayById.get(ownerId) || { name: 'user', avatar_url: asset('/images/avatar.webp') };
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
                            <span className="inline align-[2px] mr-1 px-1 py-[3px] text-[8px] font-medium text-white rounded-[4px] shadow-lg uppercase tracking-wider bg-opacity-90 bg-primary shadow-primary/20">
                              商城
                            </span>
                            {listing.product.type && (
                              <ProductBadge type={listing.product.type} className="inline align-[2px] mr-1 py-[3px] backdrop-blur-none" />
                            )}
                            <span className="inline">{listing.product.name}</span>
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
                  ))
                ) : (
                  <div className="col-span-2 py-20 text-center">
                    <p className="text-[13px] text-neutral-400 font-bold">目前沒有商城商品</p>
                  </div>
                )}
              </div>

              <div ref={sellSentinel.register} className="h-10" />
              {!isSellListingsLoading && isSellFetchingMore && (
                <div className="py-6 text-center text-[13px] font-black text-neutral-400">載入中</div>
              )}
              {!isSellListingsLoading && !isSellFetchingMore && !sellHasMore && sellListings.length > 0 && (
                <div className="py-6 text-center text-[13px] font-black text-neutral-400">到底了</div>
              )}
            </>
          ) : activePrimaryTab === 'all' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
              {isLoading || isCategoryChanging ? (
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

                  return mixed.map((row, rowIndex) => {
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
                                <span className="inline align-[2px] mr-1 px-1 py-[3px] text-[8px] font-medium text-white rounded-[4px] shadow-lg uppercase tracking-wider bg-opacity-90 bg-primary shadow-primary/20">
                                  商城
                                </span>
                                <span className="inline">{listing.product.name}</span>
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
                        key={`product:${product.id}`}
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
                        series={product.series}
                        feedBucket={feedMeta.current.get(String(product.id))?.bucket}
                        feedPosition={feedMeta.current.get(String(product.id))?.position}
                        /* 首屏前六張高優先度、不 lazy（老闆 2026-09-03：第一次開首頁圖等很久） */
                        priority={rowIndex < 6}
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
              {isLoading || isCategoryChanging ? (
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
                filteredProducts.slice(0, homeDisplayCount).map((product, index) => (
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
                    priority={index < 6}
                    onNavigate={persistHomeState}
                  />
                ))
              )}
            </div>
          )}
          {activePrimaryTab !== 'sell' && (
            <div
              ref={homeSentinel.register}
              className={`text-center text-[13px] font-black text-neutral-400 ${!isLoading && !loadError && filteredProducts.length === 0 ? 'min-h-[40vh] flex items-center justify-center' : 'py-6'}`}
            >
              {homeDisplayCount < filteredProducts.length
                ? '載入中...'
                : filteredProducts.length > 0
                  ? '到底了'
                  : !isLoading && !loadError
                    ? (categoryState(activePrimaryTab, flagStates, false) === 'maintenance'
                        ? '此分類暫時維護中'
                        : '此分類暫無商品')
                    : ''}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
    );
  };

  return (
    <>
    {/* 768 以下：我們原本的手機版（整棵一字沒動，含扇形選單、最新上架彈窗）；
        768 以上：cardx 的首頁（老闆 2026-09-04，整套原封不動搬）。自己做的桌機分區列在 git（ef502c66） */}
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24 transition-colors md:hidden">
      <div className="max-w-7xl mx-auto px-0 pt-0 sm:pt-4">
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
              onBannerClick={handleBannerClick}
            />
          )}
        </section>

        {hasAnyPrimaryFeature && (
        <div className="sticky top-[calc(57px+env(safe-area-inset-top))] z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 -mx-0">
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

            <div className={cn("flex items-center gap-1.5 pb-2 px-2", secondaryTabs.length <= 1 && "hidden")}>
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
                          {sortOptions.map((opt) => (
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

      {activePrimaryTab === 'sell' && (
        <Link
          href="/sell/new"
          className="fixed right-4 z-40 w-12 h-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 grid place-items-center active:scale-95 transition-[transform,bottom] duration-200 ease-out"
          /* `--bottom-nav-shift`：底部欄往下滑收起時一起坐下來（MobileTabbar 發佈，沒設＝0px）；
             `--guest-login-bar-h`：訪客登入條出現時再往上讓一段（GuestLoginBar 發佈） */
          style={{
            bottom: 'calc(4.75rem + env(safe-area-inset-bottom) + var(--promo-notice-h, 0px) + var(--guest-login-bar-h, 0px) - var(--bottom-nav-shift, 0px))',
          }}
          aria-label="商城上架"
        >
          <Plus className="w-6 h-6 stroke-[2]" />
        </Link>
      )}

      <NoticeBar />
      {/*
        首頁右下角的扇形懸浮選單。

        入口寫死（老闆指定：不做上傳圖與自訂路徑），
        各自吃「類別」那一區原本的旗標 —— 不另外做一套開關，
        兩邊各管一半只會互相蓋來蓋去。

        **整顆按鈕沒有自己的開關**（老闆指定）：只要還有一個入口不是「關閉」
        就顯示，全關就整顆不出現 —— 它存在的意義就是通往這幾個地方。
        後台「類別」最下面那一列只是把這個結果顯示出來，不是開關。

        入口在功能關閉時不出現（不該留一個點進去看到「商品關閉中」的入口）；
        維護中照樣出現、點下去跳提示，跟站上其他入口一致 ——
        直接藏掉會讓玩家以為功能被拿掉了。

        排列由 `lib/fanLayout` 依實際顆數決定：3 顆以內同一圈、4 顆以上內外交錯。
        旗標還沒載完不顯示：寧可晚半秒出現，也不要讓關掉的東西先閃出來被點到。
      */}
      {!isFlagsLoading && (() => {
        const entries = [
          /* 抽籤販售（老闆 2026-08-31 指定放這裡）。暫時沿用機台那張圖 ——
             等老闆給專屬去背圖再換 `/images/menu/5.webp` */
          { feature: 'lottery',  icon: asset('/images/menu/4.webp'),   label: '抽籤販售', href: '/lottery' },
          { feature: 'slot',     icon: asset('/images/menu/4.webp'),   label: '機台',     href: '/challenge' },
          // nudgeY: 店鋪那張圖的主體偏上，跟鄰居擺同一格會看起來高一截，往下推 4px
          { feature: 'sell',     icon: asset('/images/menu/2.webp'),   label: '商城',     href: '/sell', nudgeY: 4 },
          { feature: 'exchange', icon: asset('/images/menu/3.webp'),   label: '卡牌交換', href: '/exchange' },
          { feature: 'market',   icon: asset('/images/menu/1.webp'),   label: '交易所',   href: '/market' },
        ] as const;
        /*
         * ⚠️ 直接讀 `flagStates[key]`，不要用 `categoryState()`。
         * 那支只認六個「類別」key（ichiban/blindbox/gacha/card/custom/slot），
         * sell / exchange / market 傳進去會拿不到對應而一律回 'on' ——
         * 後台明明關掉了，前台四顆照樣全出現（2026-08-13 就是這樣壞的）。
         */
        const items = entries
          .map(e => ({ ...e, st: flagStates[e.feature] ?? 'on' }))
          .filter(e => e.st !== 'off')
          .map(e => ({
            icon: e.icon,
            label: e.label,
            href: e.href,
            state: e.st as 'on' | 'maintenance',
            // 這個 map 是逐欄挑的，漏掉就等於改了沒效果
            nudgeY: (e as { nudgeY?: number }).nudgeY,
          }));
        // 全部關掉時整組不出現 —— 點開空空如也比沒有還怪
        if (items.length === 0) return null;
        return <FanMenu mainIcon={asset("/images/btn.webp")} mainIconOpen={asset("/images/btn_close.webp")} items={items} />;
      })()}

      <PromoPopup placement="home" />
    </div>
    <CardxPage page="home" />
    </>
  );
}

