'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/Skeleton';
import { Clock, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  source_url: string | null;
  category: string | null;
  tags: string[] | null;
  created_at: string;
  view_count: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  ichiban: '一番賞', gacha: '轉蛋', blindbox: '盒玩', tcg: '卡牌', general: '綜合',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function NewsDetailPage() {
  const params  = useParams();
  const [item, setItem]       = useState<NewsItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!params.id) return;
    supabase
      .from('news')
      .select('*')
      .eq('id', params.id as string)
      .single()
      .then(({ data }) => {
        setItem(data);
        setIsLoading(false);
        if (data) {
          supabase.from('news').update({ view_count: (data.view_count ?? 0) + 1 }).eq('id', data.id);
        }
      });
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 pb-24">
        <Skeleton className="w-full aspect-[16/9]" />
        <div className="px-4 pt-4 space-y-3">
          <Skeleton className="h-6 w-full rounded" />
          <Skeleton className="h-6 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
          <div className="pt-4 space-y-2">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4 w-full rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-neutral-950 p-8">
        <p className="text-5xl mb-4">😢</p>
        <h1 className="text-lg font-black text-neutral-900 dark:text-white mb-2">找不到這篇文章</h1>
        <Link href="/news" className="text-primary font-bold text-sm">回到情報首頁</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 pb-28">

      {/* ── 主圖 ── */}
      {item.image_url && (
        <div className="relative w-full aspect-[16/9] bg-neutral-100 dark:bg-neutral-900">
          <Image src={item.image_url} alt={item.title} fill className="object-cover" unoptimized />
        </div>
      )}

      <article className="px-4 pt-4">
        {/* 分類 + 時間 */}
        <div className="flex items-center gap-2 mb-3">
          {item.category && (
            <span className={cn(
              'px-2 py-0.5 rounded text-[11px] font-black',
              'bg-primary/10 text-primary'
            )}>
              {CATEGORY_LABELS[item.category] ?? item.category}
            </span>
          )}
          <div className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
            <Clock className="w-3 h-3" />
            <span>{formatDate(item.created_at)}</span>
          </div>
        </div>

        {/* 標題 */}
        <h1 className="text-[20px] font-black text-neutral-900 dark:text-white leading-[1.3] mb-4">
          {item.title}
        </h1>

        {/* ── 文章內容（HTML）── */}
        {item.content ? (
          <div
            className="news-content text-[15px] text-neutral-700 dark:text-neutral-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: item.content }}
          />
        ) : (
          <p className="text-neutral-400 text-sm">暫無內容</p>
        )}

        {/* 標籤 */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <Tag className="w-3.5 h-3.5 text-neutral-400 mt-0.5" />
            {item.tags.map(tag => (
              <span key={tag}
                className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-[11px] font-bold rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
