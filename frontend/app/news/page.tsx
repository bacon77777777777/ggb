'use client';

import { useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/trackEvent';
import CategoryBadge from '@/components/news/CategoryBadge';
import { timeAgo } from '@/lib/timeAgo';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { useSwipeTabs } from '@/lib/useSwipeTabs';

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

// 依實際篇數排序；每一類都有足夠內容，避免出現空頁籤
const CATEGORIES = [
  { key: 'all',     label: '全部' },
  { key: 'figure',  label: '公仔景品' },
  { key: 'gacha',   label: '轉蛋' },
  { key: 'toy',     label: '盒玩周邊' },
  { key: 'ichiban', label: '一番賞' },
  { key: 'tcg',     label: '卡牌' },
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
        onClick={() => trackEvent('news_article_click', { meta: { news_id: item.id, category: item.category, title: item.title, source: 'carousel' } })}
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
        onClick={() => trackEvent('news_article_click', { meta: { news_id: item.id, category: item.category, title: item.title } })}
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
        onClick={() => trackEvent('news_article_click', { meta: { news_id: item.id, category: item.category, title: item.title } })}
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
let listCache: { tab: string; items: NewsItem[]; scrollY: number } | null = null;

// ─── 主頁 ────────────────────────────────────────────────────────────────────
export default function NewsPage() {
  // 從快取起手：第一幀就有完整內容，捲動位置才還原得回去
  const [all, setAll]         = useState<NewsItem[]>(() => listCache?.items ?? []);
  const [isLoading, setIsLoading] = useState(() => !listCache);
  const [activeTab, setActiveTab] = useState(() => listCache?.tab ?? 'all');
  const supabase = createClient();

  // 內容已經在 DOM 裡了才捲。用 layout effect + rAF：
  // layout effect 早於瀏覽器繪製，rAF 讓出一幀給圖片版位撐開
  useLayoutEffect(() => {
    const y = listCache?.scrollY ?? 0;
    if (!y) return;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, []);

  // 持續記住捲到哪。passive 監聽，只寫一個數字，不觸發 re-render
  useEffect(() => {
    const onScroll = () => { if (listCache) listCache.scrollY = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 清單與分頁籤同步進快取
  useEffect(() => {
    listCache = { tab: activeTab, items: all, scrollY: listCache?.scrollY ?? 0 };
  }, [all, activeTab]);

  useEffect(() => {
    trackEvent('news_list_view', { path: '/news' });
  }, []);

  const handleTabChange = (value: string) => {
    // 換分頁等於換一份清單，位置要歸零 —— 不然會停在上一個分頁捲到的高度
    if (listCache) listCache.scrollY = 0;
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
    let q = supabase
      .from('news')
      .select('id,title,summary,image_url,source_url,category,tags,is_active,created_at,view_count')
      .eq('is_active', true);
    if (category !== 'all') q = q.eq('category', category);
    const { data } = await q.order('created_at', { ascending: false }).limit(60);

    const articles = data ?? [];
    if (articles.length === 0) { setAll([]); setIsLoading(false); return; }

    const ids = articles.map(a => String(a.id));
    const countsRes = await fetch(`/api/news/counts?ids=${ids.join(',')}`).then(r => r.json()).catch(() => ({}));
    const likesMap:    Record<string, number> = countsRes.likes    ?? {};
    const commentsMap: Record<string, number> = countsRes.comments ?? {};

    setAll(articles.map(a => ({
      ...a,
      likes_count:    likesMap[String(a.id)]    ?? 0,
      comments_count: commentsMap[String(a.id)] ?? 0,
    })));
    setIsLoading(false);
  };

  useEffect(() => {
    // 有這個分頁的快取就不要再閃一次 loading —— 直接顯示舊內容、背景換新的。
    // 這也是捲動位置能還原的前提：畫面不能在還原前變成空的
    const cached = listCache?.tab === activeTab && listCache.items.length > 0;
    if (!cached) setIsLoading(true);
    loadArticles(activeTab);
    // 回到頁面時刷新讚/留言數，確保與內頁同步
    const onFocus = () => { if (document.visibilityState === 'visible') loadArticles(activeTab); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /*
   * 捲動位置記憶（老闆 2026-08-20）：點進文章前記下列表的捲動位置，
   * 讀完返回時回到原地。只在「從文章返回」時還原 —— 從底部導航新進來
   * 沒有存值，照常從頂端開始。存 sessionStorage：換頁時 PathnameKeyed
   * 會整棵重掛，元件內的 state 活不過去。
   */
  const rememberScroll = useCallback(() => {
    try { sessionStorage.setItem('ggb:news:scroll', String(window.scrollY)); } catch { /* 略 */ }
  }, []);
  useEffect(() => {
    if (isLoading) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem('ggb:news:scroll');
      sessionStorage.removeItem('ggb:news:scroll');
    } catch { /* 略 */ }
    const y = Number(raw);
    if (y > 0) {
      // 等這一輪 render 畫完（列表高度就緒）再捲，太早捲會捲不到位
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    }
  }, [isLoading]);

  const filtered = all;
  const carousel = [...filtered].sort((a, b) => b.view_count - a.view_count).slice(0, 5);
  const carouselIds = new Set(carousel.map(c => c.id));
  // 列表不重複顯示輪播中已出現的文章
  const listItems = filtered.filter(item => !carouselIds.has(item.id));

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 pb-24">

      {/* 手機端（onClickCapture：點任何文章連結前先記下捲動位置） */}
      <div className="md:hidden" onClickCapture={rememberScroll}>
        {/* 固定 Tab 欄 */}
        <div className="sticky top-0 z-20 bg-white dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800 px-2 pt-[env(safe-area-inset-top)]">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="bg-transparent px-0">
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat.key} value={cat.key}>{cat.label}</TabsTrigger>
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
                listItems.map(item => <ArticleRow key={item.id} item={item} onLike={handleLike} />)
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
            <TabsList className="bg-transparent px-0">
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat.key} value={cat.key}>{cat.label}</TabsTrigger>
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
          <div className="grid grid-cols-3 gap-5">
            {filtered.map(item => <ArticleCard key={item.id} item={item} onLike={handleLike} />)}
          </div>
        )}
      </div>
    </div>
  );
}
