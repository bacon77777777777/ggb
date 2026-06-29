'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { ArrowLeft, Calendar, ChevronRight, Share2 } from 'lucide-react';

export default function NewsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [newsItem, setNewsItem] = useState<Database['public']['Tables']['news']['Row'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    const fetchNewsItem = async () => {
      if (!params.id) return;
      try {
        const { data, error } = await supabase
          .from('news')
          .select('*')
          .eq('id', params.id)
          .single();
        
        if (error) throw error;
        setNewsItem(data);
      } catch (error) {
        console.error('Error fetching news item:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchNewsItem();
  }, [params.id, supabase]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20 transition-colors">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-3 md:py-8 mt-14">
           <div className="bg-white dark:bg-neutral-900 rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
             <div className="relative aspect-[21/9] bg-neutral-100 dark:bg-neutral-800">
               <Skeleton className="w-full h-full" />
             </div>
             <div className="p-4 sm:p-8 space-y-4">
               <div className="flex justify-between">
                 <Skeleton className="h-6 w-24 rounded-xl" />
                 <Skeleton className="h-4 w-32" />
               </div>
               <Skeleton className="h-10 w-3/4" />
               <div className="space-y-2 pt-4">
                 <Skeleton className="h-4 w-full" />
                 <Skeleton className="h-4 w-full" />
                 <Skeleton className="h-4 w-2/3" />
               </div>
             </div>
           </div>
        </div>
      </div>
    );
  }

  if (!newsItem) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-4 transition-colors">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white mb-2">找不到消息</h1>
        <p className="text-neutral-500 dark:text-neutral-400 font-bold mb-6">您查看的消息可能已經刪除或不存在。</p>
        <Link href="/">
          <Button size="lg">返回首頁</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20 transition-colors">
      {/* Breadcrumb - Hidden on mobile */}
      <div className="hidden md:block bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 sticky top-14 z-30 transition-colors">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center">
            <button 
              onClick={() => router.back()}
              className="mr-3 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Link href="/" className="hover:text-primary font-black transition-colors uppercase tracking-wider text-sm">首頁</Link>
            <ChevronRight className="w-3.5 h-3.5 mx-2 text-neutral-300 dark:text-neutral-600" />
            <span className="text-neutral-900 dark:text-white font-black truncate max-w-[200px] md:max-w-[400px]">{newsItem.title}</span>
          </div>
          <button className="p-2.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-2xl transition-colors">
            <Share2 className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-2 sm:px-4 py-3 md:py-8">
        <article className="bg-white dark:bg-neutral-900 rounded-3xl md:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden transition-colors">
          {/* News Banner */}
          <div className="relative aspect-[21/9] bg-[#28324E]">
            <Image 
              src={newsItem.image_url || '/images/banner.png'} 
              alt={newsItem.title}
              fill
              className="object-cover"
              unoptimized
            />
          </div>

          <div className="p-5 md:p-12">
            <div className="flex flex-wrap items-center gap-3 md:gap-4 mb-4 md:mb-8">
              <span className="px-3 py-1 md:px-4 md:py-1.5 bg-primary/5 text-primary rounded-xl md:rounded-2xl text-[11px] md:text-[13px] font-black uppercase tracking-widest border border-primary/10">
                {newsItem.category || '公告'}
              </span>
              <div className="flex items-center text-[11px] md:text-[13px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
                <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                {new Date(newsItem.published_at || newsItem.created_at).toLocaleDateString()}
              </div>
            </div>

            <h1 className="text-2xl md:text-4xl font-black text-neutral-900 dark:text-white mb-4 md:mb-8 leading-tight tracking-tight">
              {newsItem.title}
            </h1>

            <div className="prose prose-neutral max-w-none space-y-6">
              {(newsItem.content || '').split('\n\n').map((paragraph, index) => (
                <React.Fragment key={index}>
                  <p className="text-base md:text-lg text-neutral-600 dark:text-neutral-300 font-bold leading-relaxed whitespace-pre-wrap">
                    {paragraph}
                  </p>
                </React.Fragment>
              ))}
              
              <div className="mt-8 md:mt-12 p-5 md:p-8 bg-neutral-50 dark:bg-neutral-800 rounded-2xl md:rounded-3xl border border-neutral-100 dark:border-neutral-700">
                <p className="text-[13px] md:text-sm text-neutral-500 dark:text-neutral-400 font-bold leading-relaxed">
                  感謝您對一番賞線上的支持。我們會持續為您提供最新、最優質的商品情報。如有任何問題，歡迎隨時聯繫客服。
                </p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
