'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Box, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { hapticLight } from '@/lib/haptics';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';

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
                <Skeleton className="w-6 h-6 rounded-md" />
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
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();

  const mainTabPaths = ['/', '/news', '/exchange', '/market', '/profile', '/mission', '/ranking'];
  // 文章內頁 /news/[id] 不在 mainTabPaths，但 MobileTabbar 仍要顯示（讓使用者可以切回情報）
  const isNewsDetail = pathname.startsWith('/news/') && pathname !== '/news';
  const isMainTabPath = mainTabPaths.includes(pathname);
  const isSecondaryPage = (!isMainTabPath && !isNewsDetail) || (pathname === '/profile' && !!activeTab);

  const { theme } = useTheme();

  if (isSecondaryPage || isNewsDetail) {
    return null;
  }

  const centerTab = (() => {
    if (isFlagsLoading) return null;
    if (flags.exchange && !flags.market) return { name: '交換', href: '/exchange', icon: Box, isCenter: true };
    if (flags.market && !flags.exchange) return { name: '交易所', href: '/market', icon: Store, isCenter: true };
    return null;
  })();

  const tabImgMap: Record<string, number> = {
    '/': 1,
    '/ranking': 2,
    '/news': 3,
    '/mission': 4,
    '/profile': 5,
  };

  const tabs: Array<{ name: string; href: string; isCenter?: boolean }> = [
    { name: '首頁', href: '/' },
    { name: '排行榜', href: '/ranking' },
    { name: '情報', href: '/news' },
    { name: '簽到', href: '/mission' },
    { name: '會員', href: '/profile' },
  ];

  const handleTabClick = () => {
    hapticLight();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 md:hidden z-50 pb-[env(safe-area-inset-bottom)] bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 transition-colors" data-testid="mobile-tabbar">
      <div className="relative h-[60px] w-full flex items-end">
        <div className="absolute bottom-0 left-0 right-0 h-[56px] bg-white dark:bg-neutral-900 transition-colors" />

        <div className={cn("relative w-full grid px-2 h-[56px]", tabs.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || (tab.href === '/profile' && pathname.startsWith('/profile'));
            const imgIdx = tabImgMap[tab.href] || 1;
            const imgSrc = `/images/topbar/${imgIdx}${isActive ? 'b' : 'a'}.png`;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center justify-end pb-1.5 gap-0 h-full relative"
                onClick={() => handleTabClick()}
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
                    className="transition-opacity duration-300"
                  />
                </motion.div>
                <span className={cn(
                  "text-[11px] font-black transition-colors duration-300",
                  isActive ? "text-primary" : "text-neutral-400 dark:text-neutral-500"
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
