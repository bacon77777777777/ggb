'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Home, User, Gift, Box, Trophy, Store } from 'lucide-react';
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
      <div className="relative h-16 w-full flex items-end">
        <div className="absolute bottom-0 left-0 right-0 h-[56px] bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 transition-colors" />
        <div className="relative w-full grid grid-cols-5 px-2 h-[56px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="relative h-full flex items-center justify-center">
              <div className="flex flex-col items-center justify-end h-full w-full pb-1.5 relative gap-1">
                {i === 2 ? (
                  <div className="absolute -top-6">
                    <Skeleton className="w-11 h-11 rounded-full border-[3px] border-white dark:border-neutral-900" />
                  </div>
                ) : (
                  <>
                    <Skeleton className="w-6 h-6 rounded-md" />
                    <Skeleton className="w-8 h-2 rounded-sm" />
                  </>
                )}
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
  const isMainTabPath = mainTabPaths.includes(pathname);
  const isSecondaryPage = !isMainTabPath || (pathname === '/profile' && !!activeTab);

  const { theme } = useTheme();

  if (isSecondaryPage) {
    return null;
  }

  const centerTab = (() => {
    if (isFlagsLoading) return { name: '交換', href: '/exchange', icon: Box, isCenter: true };
    if (flags.exchange && !flags.market) return { name: '交換', href: '/exchange', icon: Box, isCenter: true };
    if (flags.market && !flags.exchange) return { name: '交易所', href: '/market', icon: Store, isCenter: true };
    return null;
  })();

  const tabs: Array<{ name: string; href: string; icon: any; isCenter?: boolean }> = [
    { name: '首頁', href: '/', icon: Home },
    { name: '排行榜', href: '/ranking', icon: Trophy },
    ...(centerTab ? [centerTab] : []),
    { name: '簽到', href: '/mission', icon: Gift },
    { name: '會員', href: '/profile', icon: User },
  ];

  const handleTabClick = () => {
    hapticLight();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 md:hidden z-50 pb-[env(safe-area-inset-bottom)] bg-white dark:bg-neutral-900" data-testid="mobile-tabbar">
      <div className="relative h-16 w-full flex items-end">
        <div className="absolute bottom-0 left-0 right-0 h-[56px] bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 transition-colors" />

        <div className={cn("relative w-full grid px-2 h-[56px]", tabs.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || (tab.href === '/profile' && pathname.startsWith('/profile'));
            const Icon = tab.icon;
            
            if (tab.isCenter) {
              return (
                <div key={tab.href} className="relative h-full flex items-center justify-center">
                  <Link
                    href={tab.href}
                    className="flex flex-col items-center justify-end h-full w-full pb-1.5 relative"
                    onClick={() => handleTabClick()}
                  >
                    <motion.div
                      whileTap={{ scale: 0.9 }}
                      initial={false}
                      animate={{
                        x: '-50%',
                        y: isActive ? -22 : -18,
                      }}
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center absolute left-1/2 border border-white/60 dark:border-neutral-900 bg-gradient-to-t from-[#EE4D2D] to-[#FF7043] text-white",
                        theme === 'dark' && "border-neutral-800"
                      )}
                    >
                      <div className="flex items-center justify-center w-8 h-8">
                        <Icon
                          size={22}
                          strokeWidth={1.6}
                          className="text-white"
                        />
                      </div>
                    </motion.div>
                    <span
                      className={cn(
                        "text-[11px] font-black transition-colors duration-300",
                        isActive ? "text-primary" : "text-neutral-400 dark:text-neutral-500"
                      )}
                    >
                      {tab.name}
                    </span>
                  </Link>
                </div>
              );
            }

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
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-2xl transition-colors duration-300 w-8 h-8",
                      isActive ? "bg-primary/10" : ""
                    )}
                  >
                    <Icon
                      size={22}
                      strokeWidth={1.6}
                      className={cn(
                        "transition-colors duration-300",
                        isActive ? "text-primary" : "text-neutral-400 dark:text-neutral-500"
                      )}
                    />
                  </div>
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
