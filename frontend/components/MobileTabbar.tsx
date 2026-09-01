'use client';

import React, { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { hapticLight } from '@/lib/haptics';
import { asset } from '@/lib/asset';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { prefetch } from '@/lib/swr';
import { HOME_KEY, fetchHomeCatalog } from '@/lib/queries/home';
import { newsListKey, fetchNewsList } from '@/lib/queries/news';
import { rankingKey, fetchRanking } from '@/lib/queries/ranking';
import { useHideOnScroll } from '@/lib/useHideOnScroll';

/**
 * 往下滑會把底部欄收起來的頁面（老闆 2026-08-29：先只有首頁，那裡才是長長的商品列表）。
 */
const HIDE_ON_SCROLL_PATHS = ['/'];

export default function MobileTabbar() {
  return (
    <Suspense fallback={<MobileTabbarSkeleton />}>
      <MobileTabbarInner />
    </Suspense>
  );
}

function MobileTabbarSkeleton() {
  return (
    <div className="fixed bottom-0 left-0 right-0 md:hidden z-50 pb-[env(safe-area-inset-bottom)]" data-testid="mobile-tabbar">
      <div className="relative h-[60px] w-full flex items-end">
        <div className="absolute bottom-0 left-0 right-0 h-[56px] bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 transition-colors" />
        <div className="relative w-full grid grid-cols-4 px-2 h-[56px]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="relative h-full flex items-center justify-center">
              <div className="flex flex-col items-center justify-end h-full w-full pb-1.5 relative gap-1">
                <Skeleton className="w-6 h-6 rounded-xl" />
                <Skeleton className="w-8 h-2 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileTabbarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab');

  // /challenge 不在裡面：它已不是頁籤，改用頂部導航返回（同常見問題那類內頁）
  // /market 不在裡面：交易所 2026-09-01 改版後有自己的底部分頁列（逛街／我的上架／交易紀錄），
  // 跟商城 /sell 一樣。兩排底欄疊在一起沒得看，離開靠它頂欄的返回鍵
  const mainTabPaths = ['/', '/ranking', '/news', '/exchange', '/profile', '/mission'];
  // 文章內頁 /news/[id] 不在 mainTabPaths，但 MobileTabbar 仍要顯示（讓使用者可以切回情報）
  const isNewsDetail = pathname.startsWith('/news/') && pathname !== '/news';
  const isMainTabPath = mainTabPaths.includes(pathname);
  const isSecondaryPage = (!isMainTabPath && !isNewsDetail) || (pathname === '/profile' && !!activeTab);

  const { theme } = useTheme();

  /*
   * 首頁往下滑收起底部欄（老闆 2026-08-29）：底欄連同掛在它上緣的公平性警語列
   * 一起推出畫面，商品列表就多出一整條的高度；手指往回撥 2px 立刻回來。
   *
   * 收起的距離是「自己的高度（含安全區）＋ 警語列高度」——
   * 警語列是 portal 進來的 `absolute bottom-full`，只推 100% 的話它會剛好停在
   * 畫面底部整條露出來。
   */
  const collapsed = useHideOnScroll({ enabled: HIDE_ON_SCROLL_PATHS.includes(pathname) });

  /*
   * 把收起的距離發佈成 `--bottom-nav-shift`，讓首頁那兩顆懸浮按鈕（扇形選單、
   * 商城上架）跟著往下坐 —— 底欄走了它們還浮在原位，下面會空一塊。
   * 這裡不含安全區：那兩顆自己的算式已經有 env(safe-area-inset-bottom)。
   * 變數沒設時是 0px，也就是完全照舊，所以其他頁不受影響。
   */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      '--bottom-nav-shift',
      collapsed ? 'calc(3.75rem + var(--promo-notice-h, 0px))' : '0px',
    );
    return () => { root.style.removeProperty('--bottom-nav-shift'); };
  }, [collapsed]);

  /*
   * 按下就預取（老闆 2026-08-22 頁面加載優化 ⑤）：touchstart 時先把目標頁的主資料
   * （跟各頁 swrLoad 同一個 key）與路由 JS 抓起來，切到那頁直接有東西。
   */
  const queryClient = useQueryClient();
  const router = useRouter();
  const warm = (href: string) => {
    if (href === '/') prefetch(queryClient, HOME_KEY, fetchHomeCatalog);
    else if (href === '/news') prefetch(queryClient, newsListKey('all'), () => fetchNewsList('all'));
    else if (href === '/ranking') prefetch(queryClient, rankingKey('reward', 'day'), () => fetchRanking('reward', 'day'));
    router.prefetch(href);
  };

  if (isSecondaryPage || isNewsDetail || pathname.startsWith('/events/')) {
    return null;
  }

  /*
   * 中央那格已經不放東西了。
   *
   * 販售、交易所、卡牌交換以前要搶這唯一一格，所以只能二選一，
   * 後台的開關甚至會在你開一個時自動關掉另一個。三個入口都搬到首頁右下角的
   * 懸浮按鈕之後，開幾個就疊幾顆，這格自然就空出來了。
   */
  const centerTab: { name: string; href: string; isCenter: boolean } | null = null;

  const tabImgMap: Record<string, number> = {
    '/': 1,
    '/ranking': 2,
    '/news': 3,
    '/mission': 4,
    '/profile': 5,
    '/challenge': 6,
  };

  // 排行榜回到這一格（挑戰改成首頁右下角的懸浮入口，與販售／交易所同一排）
  const tabs: Array<{ name: string; href: string; isCenter?: boolean }> = [
    { name: '首頁', href: '/' },
    { name: '排行榜', href: '/ranking' },
    { name: '情報', href: '/news' },
    { name: '簽到', href: '/mission' },
    { name: '會員', href: '/profile' },
  ];

  const handleTabClick = (href: string) => {
    hapticLight();
    if (href === '/' && pathname === '/') {
      window.dispatchEvent(new CustomEvent('ggb:resetHome'));
    }
  };

  /*
   * 排行榜頁底部改毛玻璃（老闆 2026-08-22）：那頁整片是深色 #232429 的畫布，
   * 白色底欄像貼了一塊膠帶。樣式照排行榜自己頂欄捲動後的那組
   * （app/ranking/page.tsx：`bg-[#1b2148]/80 backdrop-blur-md border-b border-white/10`）
   * 換成 border-t。其他頁維持白底不動。
   */
  const isRankingGlass = pathname === '/ranking';

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 md:hidden z-50 pb-[env(safe-area-inset-bottom)]',
        'transition-[transform,background-color,border-color] duration-200 ease-out',
        isRankingGlass
          ? 'bg-[#1b2148]/80 backdrop-blur-md border-t border-white/10'
          : 'bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800',
      )}
      style={collapsed ? { transform: 'translateY(calc(100% + var(--promo-notice-h, 0px)))' } : undefined}
      data-testid="mobile-tabbar"
    >
      <div className="relative h-[60px] w-full flex items-end">
        {!isRankingGlass && (
          <div className="absolute bottom-0 left-0 right-0 h-[56px] bg-white dark:bg-neutral-900 transition-colors" />
        )}

        <div className={cn("relative w-full grid px-2 h-[56px]", tabs.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || (tab.href === '/profile' && pathname.startsWith('/profile'));
            const imgIdx = tabImgMap[tab.href] || 1;
            const imgSrc = asset(`/images/topbar/${imgIdx}${isActive ? 'b' : 'a'}.png`);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center justify-end pb-1.5 gap-0 h-full relative"
                onTouchStart={() => warm(tab.href)}
                onMouseEnter={() => warm(tab.href)}
                onClick={() => handleTabClick(tab.href)}
              >
                <motion.div
                  whileTap={{ scale: 0.85 }}
                  className="relative z-10 flex items-center justify-center"
                >
                  <Image
                    src={imgSrc}
                    alt={tab.name}
                    width={37}
                    height={37}
                    className={cn("transition-opacity duration-300", !isActive && "opacity-70")}
                  />
                </motion.div>
                <span className={cn(
                  "text-[11px] font-black transition-colors duration-300",
                  // 排行榜頁 active 文字用白（老闆 2026-08-22：先試了頂欄下底線的藍 #577fe5，
                  // 在深色毛玻璃上不夠清楚，改白）；其他頁維持主題色
                  isActive
                    ? (isRankingGlass ? "text-white" : "text-primary")
                    : "text-neutral-400 dark:text-neutral-500"
                )}>
                  {tab.name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
