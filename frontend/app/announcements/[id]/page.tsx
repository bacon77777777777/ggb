'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/Skeleton';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { markRead } from '@/lib/announcementRead';

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  published_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  消息: 'bg-blue-100 text-blue-700',
  活動: 'bg-green-100 text-green-700',
  系統: 'bg-neutral-100 text-neutral-600',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

const INTERNAL_HOSTS = ['www.ggb.com.tw', 'ggb.com.tw', 'staging.ggb.com.tw']
function isInternal(url: string) {
  if (url.startsWith('/')) return true
  try { return INTERNAL_HOSTS.includes(new URL(url).hostname) } catch { return false }
}
function toPath(url: string) {
  try { const u = new URL(url); return u.pathname + u.search + u.hash } catch { return url }
}

function linkify(text: string): React.ReactNode[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const parts = text.split(urlRegex);
  const urls = text.match(urlRegex) || [];
  const result: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    result.push(part);
    if (urls[i]) {
      const internal = isInternal(urls[i]);
      result.push(internal
        ? <Link key={i} href={toPath(urls[i])} className="text-primary underline underline-offset-2 break-all">{urls[i]}</Link>
        : <a key={i} href={urls[i]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-all">{urls[i]}</a>
      );
    }
  });
  return result;
}

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();

  // 直接開網址進來也要標記已讀（不只從列表點進來）
  useEffect(() => { if (id) markRead(String(id)); }, [id]);
  const [item, setItem] = useState<Announcement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/announcements?id=${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { if (data) setItem(data); else setNotFound(true); })
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 pb-8">
        <Skeleton className="w-0 h-0" />
        <div className="px-4 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
          <Skeleton className="h-6 w-full rounded" />
          <Skeleton className="h-6 w-3/4 rounded" />
          <div className="pt-4 space-y-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-4 w-full rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-neutral-950 p-8">
        <p className="text-5xl mb-4">📭</p>
        <h1 className="text-lg font-black text-neutral-900 dark:text-white mb-2">找不到這則公告</h1>
        <Link href="/announcements" className="text-primary font-bold text-sm">回到公告列表</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 pb-8">
      <article className="px-4 pt-4 max-w-2xl mx-auto">
        {/* 分類 + 時間 */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded', CATEGORY_COLORS[item.category] || CATEGORY_COLORS['系統'])}>
            {item.category}
          </span>
          {item.is_pinned && (
            <span className="text-[11px] font-bold text-accent-red">📌 置頂</span>
          )}
          <div className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
            <Clock className="w-3 h-3" />
            <span>{formatDate(item.published_at)}</span>
          </div>
        </div>

        {/* 標題 */}
        <h1 className="text-[20px] font-black text-neutral-900 dark:text-white leading-[1.3] mb-4">
          {item.title}
        </h1>

        {/* 內容 */}
        <div className="text-[15px] text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
          {linkify(item.content || '')}
        </div>
      </article>
    </div>
  );
}
