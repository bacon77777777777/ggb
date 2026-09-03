import { ArrowLeft, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * 搜尋頁的路由載入殼（老闆 2026-09-03）
 *
 * 從首頁點搜尋框換到 /search 時，Next 會在新頁程式與 RSC 到之前先畫 `app/loading.tsx`——
 * 那是滿版的載入動畫，玩家看到的是「先整頁 loading、再突然變成搜尋頁」，體驗很差。
 * 這裡給搜尋頁自己一個殼：頂部的返回鍵＋搜尋框照真頁的版型畫好，下面關鍵字區塊用骨架，
 * 「先有畫面」。真頁一到，輸入框由 ?focus=1 自動聚焦（鍵盤靠 lib/keyboardRelay 接力）。
 * 殼是 server component，畫不了可聚焦的輸入框，所以這裡的輸入框只是外觀。
 */
export default function SearchLoading() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20 transition-colors">
      <div className="sticky top-0 z-50 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 md:hidden pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-2 relative">
          <div className="flex items-center gap-3 h-[57px]">
            <span className="p-2 rounded-full text-neutral-700 dark:text-neutral-200 shrink-0">
              <ArrowLeft className="w-5 h-5 stroke-[2]" />
            </span>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 stroke-[2.5]" />
              <div className="w-full h-10 bg-neutral-100 dark:bg-neutral-800 rounded-full pl-9 pr-[86px] flex items-center text-[16px] font-black text-neutral-400 dark:text-neutral-500">
                曾經搜尋平凡的商品
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 關鍵字區塊骨架：搜尋紀錄一排、熱門搜尋兩排 */}
      <div className="max-w-7xl mx-auto px-4 pt-4 space-y-6 md:hidden">
        <section>
          <Skeleton className="h-4 w-16 rounded mb-3" />
          <div className="flex flex-wrap gap-2">
            {[64, 80, 56, 72].map((w, i) => <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />)}
          </div>
        </section>
        <section>
          <Skeleton className="h-4 w-16 rounded mb-3" />
          <div className="flex flex-wrap gap-2">
            {[72, 56, 88, 64, 60, 76, 52, 68].map((w, i) => <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
