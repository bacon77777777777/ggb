'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  published_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  公告: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  活動: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  維護: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  系統: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
};

function linkify(text: string): React.ReactNode[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const parts = text.split(urlRegex);
  const urls = text.match(urlRegex) || [];
  const result: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    result.push(part);
    if (urls[i]) {
      result.push(
        <a
          key={i}
          href={urls[i]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 break-all"
        >
          {urls[i]}
        </a>
      );
    }
  });
  return result;
}

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Announcement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/announcements?limit=100`)
      .then(r => r.json())
      .then((data: Announcement[]) => {
        const found = data.find(a => a.id === id);
        if (found) setItem(found);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 pt-6 animate-pulse space-y-4">
          <div className="h-3 w-24 bg-neutral-200 dark:bg-neutral-800 rounded" />
          <div className="h-6 w-3/4 bg-neutral-200 dark:bg-neutral-800 rounded" />
          <div className="h-3 w-20 bg-neutral-100 dark:bg-neutral-800 rounded" />
          <div className="space-y-2 mt-6">
            {[1,2,3,4].map(i => <div key={i} className="h-3 bg-neutral-100 dark:bg-neutral-800 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
        <p className="text-neutral-400 text-sm">找不到此公告</p>
      </div>
    );
  }

  const date = new Date(item.published_at).toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 p-6">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {item.is_pinned && (
              <span className="text-xs font-bold text-accent-red">📌 置頂</span>
            )}
            <span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full', CATEGORY_COLORS[item.category] || CATEGORY_COLORS['系統'])}>
              {item.category}
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">{date}</span>
          </div>

          <h1 className="text-lg font-black text-neutral-900 dark:text-white mb-5 leading-snug">
            {item.title}
          </h1>

          <div className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {linkify(item.content || '')}
          </div>
        </div>
      </div>
    </div>
  );
}
