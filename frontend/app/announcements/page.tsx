'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/timeAgo';

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  published_at: string;
}

const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: '公告', label: '公告' },
  { key: '活動', label: '活動' },
  { key: '維護', label: '維護' },
  { key: '系統', label: '系統' },
];

const CATEGORY_COLORS: Record<string, string> = {
  公告: 'bg-blue-100 text-blue-700',
  活動: 'bg-green-100 text-green-700',
  維護: 'bg-orange-100 text-orange-700',
  系統: 'bg-neutral-100 text-neutral-600',
};

const LAST_SEEN_KEY = 'ggb:bell:last_seen';

function LoadingSkeleton() {
  return (
    <div className="px-4 pt-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="py-3 border-b border-neutral-100 dark:border-neutral-800 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const tabKeys = CATEGORIES.map(c => c.key);
  const swipeX = useRef<number | null>(null);

  useEffect(() => {
    fetch('/api/announcements')
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));

    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    window.dispatchEvent(new CustomEvent('ggb:announcementsRead'));
  }, []);

  const onTouchStart = (e: React.TouchEvent) => { swipeX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (swipeX.current === null) return;
    const dist = swipeX.current - e.changedTouches[0].clientX;
    swipeX.current = null;
    if (Math.abs(dist) < 50) return;
    const cur = tabKeys.indexOf(activeTab);
    if (dist > 0 && cur < tabKeys.length - 1) setActiveTab(tabKeys[cur + 1]);
    if (dist < 0 && cur > 0) setActiveTab(tabKeys[cur - 1]);
  };

  const filtered = activeTab === 'all' ? items : items.filter(i => i.category === activeTab);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 pb-24">

      {/* 固定 Tab 欄（在 Navbar 57px 下方） */}
      <div className="sticky top-[57px] z-20 bg-white dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800 px-2">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent px-0 gap-0 overflow-visible w-full">
            {CATEGORIES.map(cat => (
              <TabsTrigger key={cat.key} value={cat.key} className="flex-1 justify-center">{cat.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* 列表 */}
      {isLoading ? <LoadingSkeleton /> : (
        <div className="px-4 min-h-[60vh]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 dark:text-neutral-500 text-sm font-bold">
              此分類目前沒有公告
            </div>
          ) : (
            filtered.map(item => (
              <div key={item.id} className="relative py-3 border-b border-neutral-100 dark:border-neutral-800 last:border-0 active:bg-neutral-50 dark:active:bg-neutral-800/40 transition-colors">
                <Link href={`/announcements/${item.id}`} className="absolute inset-0 z-0" aria-label={item.title} />
                <div className="pointer-events-none relative z-10">
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {item.is_pinned && (
                      <span className="text-[10px] font-bold text-accent-red">📌</span>
                    )}
                    <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded', CATEGORY_COLORS[item.category] || CATEGORY_COLORS['系統'])}>
                      {item.category}
                    </span>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">·</span>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{timeAgo(item.published_at)}</span>
                  </div>
                  <h3 className="text-[14px] font-bold text-neutral-900 dark:text-white leading-[1.5] line-clamp-2">
                    {item.title}
                  </h3>
                  {item.content && (
                    <p className="text-[12px] text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1 leading-relaxed">
                      {item.content}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
