import React from 'react';
import { cn } from '@/lib/utils';

interface NavbarLayoutProps {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  leftClassName?: string;
  centerClassName?: string;
  rightClassName?: string;
  innerClassName?: string;
  isSticky?: boolean;
  /**
   * 底色與下緣分隔線。預設白底（深色模式深灰）。
   * 首頁手機端傳主題色進來 —— 不用 className 疊 `bg-primary` 是因為
   * 兩個都是同一組 tailwind 工具類，誰贏取決於樣式表順序，賭不得。
   */
  surfaceClassName?: string;
}

export default function NavbarLayout({
  left,
  center,
  right,
  className,
  leftClassName,
  centerClassName,
  rightClassName,
  innerClassName,
  isSticky = true,
  surfaceClassName = "bg-white dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800",
}: NavbarLayoutProps) {
  return (
    <nav className={cn(
      /* pt-[env(...)]：App 滿版模式（v2026.08.21c）下導航列白底延伸到動態島，
         內容從安全區下開始；網頁與偽 app env=0，完全無感 */
      "border-b top-0 z-50 transition-colors pt-[env(safe-area-inset-top)]",
      surfaceClassName,
      isSticky ? "sticky" : "relative",
      className
    )}>
      <div className={cn("max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 h-[57px] flex items-center justify-between relative", innerClassName)}>
        {/* Left Slot - Always on left */}
        <div className={cn("flex items-center gap-0 md:gap-8 min-w-0 relative z-20 shrink-0", leftClassName)}>
          {left}
        </div>

        {/* Center Slot - Absolute centered on mobile, or flexible in desktop */}
        <div className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-10 w-full pointer-events-none md:static md:translate-x-0 md:translate-y-0 md:w-auto md:justify-start md:flex-1 md:pl-4",
          centerClassName
        )}>
          <div className="pointer-events-auto max-w-full flex justify-center md:justify-start w-full">
            {center}
          </div>
        </div>

        {/* Right Slot - Always on right */}
        <div className={cn("flex items-center gap-0.5 lg:gap-2 shrink-0 z-20 ml-auto pl-2", rightClassName)}>
          {right}
        </div>
      </div>
    </nav>
  );
}
