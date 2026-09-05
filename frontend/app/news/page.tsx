'use client';

import CardxPage from '@/components/cardx/CardxPage';
import { useMinWidth } from '@/lib/useMinWidth';

import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { rememberNewsView, readNewsView } from '@/lib/newsView';
import { restoreScrollTo } from '@/lib/restoreScroll';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/trackEvent';
import CategoryBadge from '@/components/news/CategoryBadge';
import { timeAgo } from '@/lib/timeAgo';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { useSwipeTabs } from '@/lib/useSwipeTabs';
import { useQueryClient } from '@tanstack/react-query';
import { swrLoad } from '@/lib/swr';
import { newsListKey, fetchNewsList } from '@/lib/queries/news';

interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  source_url: string | null;
  category: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_at: string;
  view_count: number;
  likes_count: number;
  comments_count: number;
  liked?: boolean;
}

// 頁籤順序照老闆 2026-08-30 指定（平台的主力商品排前面，公仔景品收尾）
const CATEGORIES = [
  { key: 'all',     label: '全部' },
  { key: 'ichiban', label: '一番賞' },
  { key: 'gacha',   label: '轉蛋' },
  { key: 'toy',     label: '盒玩周邊' },
  { key: 'tcg',     label: '卡牌' },
  { key: 'figure',  label: '公仔景品' },
];


// ─── 輪播 ──────────────────────────────────────────────────────────────────
function Carousel({ items }: { items: NewsItem[] }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);

  const go = (i: number) => setIdx((i + items.length) % items.length);
  const start = () => {
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % items.length), 4000);
  };
  const stop = () => { if (timerRef.current) clearInterval(timerRef.current); };

  useEffect(() => { if (items.length > 1) { start(); return stop; } }, [items.length]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };
  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const dist = touchStart.current - touchEnd.current;
    if (dist > 50) { stop(); go(idx + 1); start(); }
    if (dist < -50) { stop(); go(idx - 1); start(); }
  };

  if (!items.length) return null;
  const item = items[idx];

  return (
    <div className="relative w-full aspect-[16/9] bg-neutral-900 overflow-hidden"
      onMouseEnter={stop} onMouseLeave={start}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <Link href={`/news/${item.id}`} className="block w-full h-full"
        onClick={() => { rememberBeforeLeaving(item.id); trackEvent('news_article_click', { meta: { news_id: item.id, category: item.category, title: item.title, source: 'carousel' } }); }}
      >
        {item.image_url ? (
          <Image src={item.image_url} alt={item.title} fill className="object-cover" unoptimized />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-neutral-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-16">
          <CategoryBadge category={item.category ?? 'general'} className="mb-2" />
          <h2 className="text-white font-black text-[17px] leading-[1.35] line-clamp-2 overflow-hidden">
            {item.title}
          </h2>
          <p className="text-white/60 text-[11px] mt-1.5">{timeAgo(item.created_at)}</p>
        </div>
      </Link>
      {items.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
          {items.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={cn('h-1.5 rounded-full transition-all duration-500', i === idx ? 'w-8 bg-white' : 'w-1.5 bg-white/40')} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 文章列表項目 ────────────────────────────────────────────────────────────
function ArticleRow({ item, onLike }: { item: NewsItem; onLike: (id: string) => void }) {
  return (
    <div className="relative flex items-start gap-3 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0 active:bg-neutral-50 dark:active:bg-neutral-800/40 transition-colors">
      {/* 整行透明 link，覆蓋整個列 */}
      <Link href={`/news/${item.id}`} className="absolute inset-0 z-0" aria-label={item.title}
        onClick={() => { rememberBeforeLeaving(item.id); trackEvent('news_article_click', { meta: { news_id: item.id, category: item.category, title: item.title } }); }}
      />

      {/* 縮圖 */}
      <div className="pointer-events-none relative z-10 flex-shrink-0 w-[70px] h-[70px] rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.title} fill className="object-cover" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-300 text-xs font-bold">GGB</div>
        )}
      </div>

      {/* 文字區 */}
      <div className="pointer-events-none relative z-10 flex-1 min-w-0">
        <h3 className="text-[14px] font-bold text-neutral-900 dark:text-white line-clamp-2 leading-[1.5] h-[42px] mb-1.5">
          {item.title}
        </h3>
        <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-400 dark:text-neutral-500">
          <div className="flex items-center gap-1.5 min-w-0">
            {item.category && <CategoryBadge category={item.category} />}
            {item.category && <span>·</span>}
            <span className="truncate">{timeAgo(item.created_at)}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 text-neutral-500 dark:text-neutral-400">
            {/* 留言（點擊整行已進頁面，此處純顯示） */}
            <div className="flex items-center gap-0.5 w-9">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="tabular-nums font-bold">{item.comments_count}</span>
            </div>
            {/* 讚（pointer-events-auto 讓按鈕浮出覆蓋在透明 link 上） */}
            <button
              onClick={e => { e.stopPropagation(); onLike(item.id); }}
              className={cn(
                'pointer-events-auto flex items-center gap-0.5 w-9 transition-colors active:scale-110',
                item.liked ? 'text-primary' : ''
              )}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={item.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
              </svg>
              <span className="tabular-nums font-bold">{item.likes_count}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 桌機文章卡（電腦端網格用）───────────────────────────────────────────────
function ArticleCard({ item, onLike }: { item: NewsItem; onLike: (id: string) => void }) {
  return (
    <div className="group relative flex flex-col rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden hover:shadow-card transition-shadow">
      <Link href={`/news/${item.id}`} className="absolute inset-0 z-0" aria-label={item.title}
        onClick={() => { rememberBeforeLeaving(item.id); trackEvent('news_article_click', { meta: { news_id: item.id, category: item.category, title: item.title } }); }}
      />
      {/* 封面 16:9 */}
      <div className="pointer-events-none relative z-10 w-full aspect-[16/9] bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.title} fill className="object-cover group-hover:scale-[1.03] transition-transform duration-300" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-300 text-lg font-black">GGB</div>
        )}
        {item.category && (
          <span className="absolute top-2 left-2"><CategoryBadge category={item.category} /></span>
        )}
      </div>
      {/* 文字 */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col p-4">
        <h3 className="text-[15px] font-bold text-neutral-900 dark:text-white line-clamp-2 leading-[1.5] mb-2">
          {item.title}
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2 text-[12px] text-neutral-400 dark:text-neutral-500">
          <span className="truncate">{timeAgo(item.created_at)}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="flex items-center gap-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              <span className="tabular-nums font-bold">{item.comments_count}</span>
            </span>
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onLike(item.id); }}
              className={cn('pointer-events-auto flex items-center gap-1 transition-colors active:scale-110', item.liked ? 'text-primary' : 'hover:text-primary')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={item.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></svg>
              <span className="tabular-nums font-bold">{item.likes_count}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 骨架屏 ──────────────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div>
      <Skeleton className="w-full aspect-[16/9] rounded-none" />
      <div className="px-4 pt-2">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex gap-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
            <Skeleton className="w-[70px] h-[70px] rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/*
 * 返回時記憶瀏覽位置。
 *
 * 為什麼不能只靠瀏覽器的捲動還原：這頁每次掛載都重新抓資料，`isLoading` 期間
 * 列表是空的、頁面高度接近 0 —— 瀏覽器嘗試還原位置的那一刻根本沒有東西可以捲，
 * 等資料回來已經來不及了。分頁籤也會一併被重設回「全部」。
 *
 * 所以把「上次看到哪、在哪個分頁、當時的清單」一起記在模組層。
 * 用模組變數而不是 sessionStorage：這只需要在單頁應用的前後導航之間有效，
 * 重新整理時本來就該重抓最新文章，順便自然失效。
 */
let listCache: { tab: string; items: NewsItem[]; scrollY: number; count: number } | null = null;

/*
 * 模組變數只在「單頁應用的前後導航」之間有效 —— 從 LINE、推播或重新整理進到
 * 文章內頁再返回，整份 JS 是重新載入的，listCache 是空的，位置就回不去了
 *（老闆 2026-08-29）。所以位置與分頁籤再寫一份到 sessionStorage，
 * 內頁的返回鍵也讀它來判斷「是不是從列表點進來的」。
 */
/**
 * 點進文章前把位置記起來。分頁籤與「展開到第幾篇」從 listCache 拿
 *（它每次 render 都同步）。篇數一定要一起記 —— 理由見下面的還原邏輯。
 */
function rememberBeforeLeaving(id: string) {
  rememberNewsView({
    tab: listCache?.tab ?? 'all',
    y: window.scrollY,
    count: listCache?.count ?? 0,
    from: `/news/${id}`,
  });
}

// ─── 主頁 ────────────────────────────────────────────────────────────────────
function NewsPageMobile() {
  // 從快取起手：第一幀就有完整內容，捲動位置才還原得回去
  const [all, setAll]         = useState<NewsItem[]>(() => listCache?.items ?? []);
  const [isLoading, setIsLoading] = useState(() => !listCache);
  const [activeTab, setActiveTab] = useState(() => listCache?.tab ?? 'all');
  const supabase = createClient();
  const queryClient = useQueryClient();

  /*
   * 分頁（老闆 2026-08-24：情報頁一次吃 60 篇很卡）。
   * 一次只渲染 PAGE_SIZE 篇，捲到底再加 PAGE_STEP 篇 —— 資料本來就一次撈回來了，
   * 卡的是「同時掛上 60 張卡片＋60 張圖」；限制渲染量就順了。
   */
  const PAGE_SIZE = 12;
  const PAGE_STEP = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  /*
   * 返回還原：位置 **和當時展開到第幾篇**（老闆 2026-08-30：返回永遠停在同一個位置）
   *
   * 只還原 y 會壞在分頁上：列表每次掛載都退回 PAGE_SIZE 篇，頁面高度不到當初的
   * 一半，`window.scrollTo` 會被瀏覽器夾在「12 篇那麼高」的底部 —— 不管當初捲到
   * 哪裡，返回後都停在同一個高度。所以要先把篇數補回去，等版位撐開了再捲。
   *
   * 還原中不讓下面的「換分頁重置」把篇數打回 12：那個 effect 掛載時也會跑一次，
   * 而還原分頁籤本身又會讓它再跑一次。用 ref 記著目標篇數，玩家自己換分頁才清掉。
   */
  const restoredCountRef = useRef(0);
  useLayoutEffect(() => {
    // 模組快取優先（同一趟前後導航），沒有就讀 sessionStorage（重新載入過）
    const saved = readNewsView(true);
    const y = listCache?.scrollY || saved?.y || 0;
    const count = Math.max(listCache?.count ?? 0, saved?.count ?? 0);
    if (saved?.tab && saved.tab !== 'all') setActiveTab(saved.tab);
    if (!y) return;
    if (count > PAGE_SIZE) {
      restoredCountRef.current = count;
      setVisibleCount(count);
    }

    // 縮圖還沒撐開版位時 scrollTo 會被夾住，restoreScrollTo 會一直試到定位
    return restoreScrollTo(y);
  }, []);

  // 持續記住捲到哪。passive 監聽，只寫一個數字，不觸發 re-render
  useEffect(() => {
    const onScroll = () => { if (listCache) listCache.scrollY = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 清單、分頁籤、已展開篇數同步進快取
  useEffect(() => {
    listCache = { tab: activeTab, items: all, scrollY: listCache?.scrollY ?? 0, count: visibleCount };
  }, [all, activeTab, visibleCount]);

  useEffect(() => {
    trackEvent('news_list_view', { path: '/news' });
  }, []);

  const handleTabChange = (value: string) => {
    // 換分頁等於換一份清單，位置與篇數都要歸零 —— 不然會停在上一個分頁捲到的高度
    if (listCache) listCache.scrollY = 0;
    restoredCountRef.current = 0;
    setActiveTab(value);
    if (value !== 'all') {
      trackEvent('news_category_filter', { path: '/news', meta: { category: value } });
    }
  };

  const requireLogin = useRequireLogin();

  const handleLike = async (id: string) => {
    // 未登入就先擋下來。不擋的話會樂觀更新完再被 401 回滾 ——
    // 愛心先亮起來又暗掉，看起來像壞掉而不是「你要先登入」
    if (!requireLogin('登入後就可以幫這篇按讚')) return;
    setAll(prev => prev.map(a => a.id === id
      ? { ...a, liked: !a.liked, likes_count: a.likes_count + (a.liked ? -1 : 1) }
      : a
    ));
    await fetch(`/api/news/${id}/like`, { method: 'POST' }).catch(() => {});
  };

  const tabKeys  = CATEGORIES.map(c => c.key);
  // 換成全站共用的手勢（含邊緣讓位、水平捲動區讓位、斜滑防誤觸）
  const swipeTabs = useSwipeTabs(tabKeys, activeTab, handleTabChange);

  // 依分類向 DB 取資料，不可先抓最新 N 篇再於前端過濾：
  // 冷門分類（卡牌/盒玩）的文章多半較舊，會整批落在 N 篇之外，
  // 導致資料庫明明有文章、頁籤卻顯示「此分類目前沒有文章」
  const loadArticles = async (category: string) => {
    // 先套快取、再背景更新（lib/swr.ts）；資料改走 /api/public/news（CDN 邊緣快取 60 秒）
    try {
      await swrLoad(queryClient, newsListKey(category), () => fetchNewsList(category), (items) => {
        setAll(items as unknown as NewsItem[]);
        setIsLoading(false);
      });
    } catch (e) {
      console.warn('[News] list fetch failed:', e);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // 有這個分頁的快取就不要再閃一次 loading —— 直接顯示舊內容、背景換新的。
    // 這也是捲動位置能還原的前提：畫面不能在還原前變成空的
    const cached = (listCache?.tab === activeTab && listCache.items.length > 0)
      || queryClient.getQueryData(newsListKey(activeTab)) !== undefined;
    if (!cached) setIsLoading(true);
    loadArticles(activeTab);
    // 回到頁面時刷新讚/留言數，確保與內頁同步
    const onFocus = () => { if (document.visibilityState === 'visible') loadArticles(activeTab); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /*
   * 舊的 `ggb:news:scroll` 那一套已經拿掉（2026-08-30）：它跟上面的還原是兩套
   * 各自 scrollTo 的機制，而且只記位置不記篇數，晚一步把畫面拉回夾住的高度。
   * 現在只留 lib/newsView 這一套。
   */

  const filtered = all;
  /*
   * 輪播是「人氣前 5」，但名單要固定在**這次進頁面時**的那一份：
   * 背景更新會把剛讀完那篇的瀏覽數加上去，名單一換、列表就多／少一列 ——
   * 位置才剛還原好，畫面又自己跳一格。換分頁時重新選。
   */
  const carouselRef = useRef<{ tab: string; ids: string[] } | null>(null);
  let carousel = [...filtered].sort((a, b) => b.view_count - a.view_count).slice(0, 5);
  if (carouselRef.current?.tab === activeTab) {
    const byId = new Map(filtered.map(i => [i.id, i]));
    const kept = carouselRef.current.ids.map(id => byId.get(id)).filter(Boolean) as NewsItem[];
    if (kept.length) carousel = kept;
  } else if (carousel.length) {
    carouselRef.current = { tab: activeTab, ids: carousel.map(c => c.id) };
  }
  const carouselIds = new Set(carousel.map(c => c.id));
  // 列表不重複顯示輪播中已出現的文章
  const listItems = filtered.filter(item => !carouselIds.has(item.id));

  // 換分頁回到第一頁；還原中的話用還原的篇數（restoredCountRef 的說明在上面）
  useEffect(() => { setVisibleCount(Math.max(PAGE_SIZE, restoredCountRef.current)); }, [activeTab]);
  const visibleListItems = listItems.slice(0, visibleCount);
  const hasMoreArticles = listItems.length > visibleCount;
  /*
   * 觸底哨兵用屬性選取器一次觀察全部，不用 ref：手機版與桌機版**兩塊都在 DOM 裡**
   * （靠 md:hidden／hidden md:block 切換顯示），共用一個 ref 會被後掛載的桌機那塊搶走，
   * 而它在手機上是 display:none、永遠不會進視口 → 分頁完全不會觸發
   *（2026-08-24 正式站實測：捲到底沒有加載）。display:none 的元素本來就不會 intersect，
   * 兩塊都觀察剛好只有看得見的那塊會觸發。
   */
  useEffect(() => {
    if (!hasMoreArticles || typeof IntersectionObserver === 'undefined') return;
    const els = Array.from(document.querySelectorAll('[data-news-load-more]'));
    if (!els.length) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setVisibleCount(c => c + PAGE_STEP);
    }, { rootMargin: '400px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [hasMoreArticles, visibleCount]);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 pb-24">

      {/* 手機端（點文章時由 ArticleRow 的 rememberBeforeLeaving 記下位置） */}
      <div className="md:hidden">
        {/* 固定 Tab 欄 */}
        <div className="sticky top-0 z-20 bg-white dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800 px-2 pt-[env(safe-area-inset-top)]">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            {/* 六個分頁籤要塞進手機寬度：間距收緊（gap-2→0、px-3→px-2.5），
                不然最後的「公仔景品」永遠露不出來（老闆 2026-08-30） */}
            <TabsList className="bg-transparent px-0 gap-0">
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat.key} value={cat.key} className="px-2.5">{cat.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* data-ptr-content：下拉更新只拖這一塊。原本拖整個 <main> 再反向抵銷
            sticky tab，tab 空出來的位置會露出頁面的白底（老闆截圖的「白色塊」）；
            改成 tab 根本不在拖曳範圍裡，就沒有洞可以露 */}
        <div data-ptr-content>
        {isLoading ? <LoadingSkeleton /> : (
          <div>
            {carousel.length > 0 && <Carousel items={carousel} />}
            <div className="px-4 min-h-[60vh]" {...swipeTabs}>
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-neutral-400 dark:text-neutral-500 text-sm font-bold">
                  此分類目前沒有文章
                </div>
              ) : (
                <>
                  {visibleListItems.map(item => <ArticleRow key={item.id} item={item} onLike={handleLike} />)}
                  {hasMoreArticles && <div data-news-load-more className="h-10" aria-hidden />}
                </>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ── 電腦端（老闆 2026-08-21：桌機來的用戶多，很多從文章進站）── */}
      <div className="hidden md:block max-w-6xl mx-auto px-6 py-8">
        {/* 分類頁籤 */}
        <div className="border-b border-neutral-100 dark:border-neutral-800 mb-6">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            {/* 六個分頁籤要塞進手機寬度：間距收緊（gap-2→0、px-3→px-2.5），
                不然最後的「公仔景品」永遠露不出來（老闆 2026-08-30） */}
            <TabsList className="bg-transparent px-0 gap-0">
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat.key} value={cat.key} className="px-2.5">{cat.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-3 gap-5">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="rounded-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                <Skeleton className="w-full aspect-[16/9]" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-2/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center text-neutral-400 dark:text-neutral-500 text-sm font-bold">此分類目前沒有文章</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-5">
              {filtered.slice(0, visibleCount).map(item => <ArticleCard key={item.id} item={item} onLike={handleLike} />)}
            </div>
            {filtered.length > visibleCount && <div data-news-load-more className="h-10" aria-hidden />}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 768 以下：我們原本的手機版（NewsPageMobile，一字沒動）；
 * 768 以上：cardx 的頁面（老闆 2026-09-04，整套原封不動搬）。量到寬度才掛其中一棵（手機那棵有 effect，藏著也會跑）。
 */
export default function NewsPage() {
  const isMd = useMinWidth(768);
  if (isMd === null) return null;
  return isMd ? <CardxPage page="news" /> : <NewsPageMobile />;
}
