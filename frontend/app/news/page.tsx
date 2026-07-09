'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

const CATEGORIES = [
  { key: 'all',      label: '全部' },
  { key: 'ichiban',  label: '一番賞' },
  { key: 'gacha',    label: '轉蛋' },
  { key: 'blindbox', label: '盒玩' },
  { key: 'tcg',      label: '卡牌' },
  { key: 'general',  label: '綜合' },
];

const CATEGORY_LABELS: Record<string, string> = {
  ichiban: '一番賞', gacha: '轉蛋', blindbox: '盒玩', tcg: '卡牌', general: '綜合',
};

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

  const start = () => {
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % items.length), 4000);
  };
  const stop = () => { if (timerRef.current) clearInterval(timerRef.current); };

  useEffect(() => { if (items.length > 1) { start(); return stop; } }, [items.length]);

  if (!items.length) return null;
  const item = items[idx];

  return (
    <div className="relative w-full aspect-[16/9] bg-neutral-900 overflow-hidden"
      onMouseEnter={stop} onMouseLeave={start}>
      <Link href={`/news/${item.id}`} className="block w-full h-full">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.title} fill className="object-cover" unoptimized />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-neutral-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-16">
          <span className="inline-block px-2 py-0.5 bg-primary text-white text-[10px] font-black rounded mb-2">
            {CATEGORY_LABELS[item.category ?? ''] ?? '情報'}
          </span>
          <h2 className="text-white font-black text-[17px] leading-[1.35] line-clamp-2 overflow-hidden">
            {item.title}
          </h2>
          <p className="text-white/60 text-[11px] mt-1.5">{timeAgo(item.created_at)}</p>
        </div>
      </Link>
      {items.length > 1 && (
        <>
          <button onClick={e => { e.preventDefault(); stop(); setIdx(i => (i - 1 + items.length) % items.length); start(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-white">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={e => { e.preventDefault(); stop(); setIdx(i => (i + 1) % items.length); start(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-white">
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-4 right-4 flex gap-1">
            {items.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={cn('w-1.5 h-1.5 rounded-full transition-colors', i === idx ? 'bg-white' : 'bg-white/40')} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 文章列表項目 ────────────────────────────────────────────────────────────
function ArticleRow({ item }: { item: NewsItem }) {
  return (
    <Link href={`/news/${item.id}`}
      className="flex items-start gap-3 py-4 border-b border-neutral-100 dark:border-neutral-800 last:border-0 active:bg-neutral-50 dark:active:bg-neutral-800/50 transition-colors">
      <div className="flex-shrink-0 w-[90px] h-[65px] rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800 relative">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.title} fill className="object-cover" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-300 text-xs font-bold">GGB</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-bold text-neutral-900 dark:text-white line-clamp-2 leading-[1.5] mb-2">
          {item.title}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
          {item.category && (
            <span className="text-primary font-bold">{CATEGORY_LABELS[item.category] ?? item.category}</span>
          )}
          {item.category && <span>·</span>}
          <span>{timeAgo(item.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── 骨架屏 ──────────────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div>
      <Skeleton className="w-full aspect-[16/9] rounded-none" />
      <div className="px-4 pt-2">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex gap-3 py-4 border-b border-neutral-100 dark:border-neutral-800">
            <Skeleton className="w-[90px] h-[65px] rounded-lg flex-shrink-0" />
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
    supabase
      .from('news')
      .select('id,title,summary,image_url,source_url,category,tags,is_active,created_at,view_count')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => { setAll(data ?? []); setIsLoading(false); });
  }, []);

  const filtered = activeTab === 'all' ? all : all.filter(n => n.category === activeTab);
  const carousel = [...all].sort((a, b) => b.view_count - a.view_count).slice(0, 5);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 pb-24">

      {/* 手機端 */}
      <div className="md:hidden">
        {/* 固定 Tab 欄 */}
        <div className="sticky top-0 z-20 bg-white dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800 px-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-transparent px-0">
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat.key} value={cat.key}>{cat.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? <LoadingSkeleton /> : (
          <>
            {activeTab === 'all' && carousel.length > 0 && <Carousel items={carousel} />}
            <div className="px-4">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-neutral-400 dark:text-neutral-500 text-sm font-bold">
                  此分類目前沒有文章
                </div>
              ) : (
                filtered.map(item => <ArticleRow key={item.id} item={item} />)
              )}
            </div>
          </>
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
