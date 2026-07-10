'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/trackEvent';

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

const CATEGORIES = [
  { key: 'all',      label: '全部' },
  { key: 'general',  label: '綜合' },
  { key: 'ichiban',  label: '一番賞' },
  { key: 'gacha',    label: '轉蛋' },
  { key: 'blindbox', label: '盒玩' },
  { key: 'tcg',      label: '卡牌' },
];

const CATEGORY_LABELS: Record<string, string> = {
  ichiban: '一番賞', gacha: '轉蛋', blindbox: '盒玩', tcg: '卡牌', general: '綜合',
};

const CATEGORY_COLORS: Record<string, string> = {
  ichiban: 'bg-blue-500',
  gacha:   'bg-orange-500',
  blindbox:'bg-purple-500',
  tcg:     'bg-amber-500',
  general: 'bg-neutral-400',
};

function CategoryBadge({ category, className }: { category: string; className?: string }) {
  const color = CATEGORY_COLORS[category] ?? 'bg-neutral-400';
  const label = CATEGORY_LABELS[category] ?? category;
  return (
    <span className={cn(
      'inline-flex items-center h-[18px] px-1.5 text-[10px] font-bold text-white rounded-[4px] flex-shrink-0',
      color, className
    )}>
      {label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return '剛剛';
  if (diff < 3600)  return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(dateStr).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}

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

// ─── 主頁 ────────────────────────────────────────────────────────────────────
export default function NewsPage() {
  const [all, setAll]         = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const supabase = createClient();

  useEffect(() => {
    trackEvent('news_list_view', { path: '/news' });
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value !== 'all') {
      trackEvent('news_category_filter', { path: '/news', meta: { category: value } });
    }
  };

  const handleLike = async (id: string) => {
    setAll(prev => prev.map(a => a.id === id
      ? { ...a, liked: !a.liked, likes_count: a.likes_count + (a.liked ? -1 : 1) }
      : a
    ));
    await fetch(`/api/news/${id}/like`, { method: 'POST' }).catch(() => {});
  };

  const tabKeys  = CATEGORIES.map(c => c.key);
  const swipeX   = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => { swipeX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (swipeX.current === null) return;
    const dist = swipeX.current - e.changedTouches[0].clientX;
    swipeX.current = null;
    if (Math.abs(dist) < 50) return;
    const cur = tabKeys.indexOf(activeTab);
    if (dist > 0 && cur < tabKeys.length - 1) setActiveTab(tabKeys[cur + 1]);
    if (dist < 0 && cur > 0) setActiveTab(tabKeys[cur - 1]);
  };

  const loadArticles = async () => {
    const { data } = await supabase
      .from('news')
      .select('id,title,summary,image_url,source_url,category,tags,is_active,created_at,view_count')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(60);

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
    loadArticles();
    // 回到頁面時刷新讚/留言數，確保與內頁同步
    const onFocus = () => { if (document.visibilityState === 'visible') loadArticles(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = activeTab === 'all' ? all : all.filter(n => n.category === activeTab);
  const carousel = [...filtered].sort((a, b) => b.view_count - a.view_count).slice(0, 5);
  const carouselIds = new Set(carousel.map(c => c.id));
  // 列表不重複顯示輪播中已出現的文章
  const listItems = filtered.filter(item => !carouselIds.has(item.id));

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 pb-24">

      {/* 手機端 */}
      <div className="md:hidden">
        {/* 固定 Tab 欄 */}
        <div className="sticky top-0 z-20 bg-white dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800 px-2">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="bg-transparent px-0">
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat.key} value={cat.key}>{cat.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? <LoadingSkeleton /> : (
          <div>
            {carousel.length > 0 && <Carousel items={carousel} />}
            <div className="px-4 min-h-[60vh]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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

      {/* 電腦端暫不開放 */}
      <div className="hidden md:flex items-center justify-center min-h-[60vh] text-neutral-400 dark:text-neutral-500">
        <div className="text-center">
          <p className="text-5xl mb-4">📰</p>
          <p className="font-bold">情報功能目前僅支援手機瀏覽</p>
        </div>
      </div>
    </div>
  );
}
