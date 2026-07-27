'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  公告: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  活動: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  維護: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  系統: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
};

const LAST_SEEN_KEY = 'ggb:bell:last_seen';

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/announcements')
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));

    // Mark as seen
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    // Notify navbar to clear badge
    window.dispatchEvent(new CustomEvent('ggb:announcementsRead'));
  }, []);

  const filtered = activeCategory === 'all'
    ? items
    : items.filter(i => i.category === activeCategory);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors',
                activeCategory === cat.key
                  ? 'bg-primary text-white'
                  : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:border-primary/50'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3 mt-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-neutral-900 rounded-2xl p-4 animate-pulse">
                <div className="h-3 w-20 bg-neutral-100 dark:bg-neutral-800 rounded mb-3" />
                <div className="h-4 w-4/5 bg-neutral-100 dark:bg-neutral-800 rounded mb-2" />
                <div className="h-3 w-full bg-neutral-100 dark:bg-neutral-800 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400 dark:text-neutral-600">
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm">目前沒有公告</p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {filtered.map(item => (
              <Link
                key={item.id}
                href={`/announcements/${item.id}`}
                className="block bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-100 dark:border-neutral-800 hover:border-primary/30 dark:hover:border-primary/30 transition-colors active:scale-[0.99]"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {item.is_pinned && (
                    <span className="text-xs font-bold text-accent-red">📌</span>
                  )}
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', CATEGORY_COLORS[item.category] || CATEGORY_COLORS['系統'])}>
                    {item.category}
                  </span>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500 ml-auto">
                    {timeAgo(item.published_at)}
                  </span>
                </div>
                <p className="text-sm font-bold text-neutral-900 dark:text-white leading-snug">
                  {item.title}
                </p>
                {item.content && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {item.content}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
