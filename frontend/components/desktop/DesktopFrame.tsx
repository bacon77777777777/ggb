'use client';

/**
 * 把 <main> 與頁尾往右推、讓出側欄的寬度（≥1024 才推，768 以下側欄不存在）。
 * 導覽列不在這層裡面：它跟 cardx 一樣橫跨整個視窗，側欄從它下緣開始。
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import { useDesktopShell } from '@/contexts/DesktopShellContext';
import { isCardxRoute } from '@/lib/cardxRoutes';

export default function DesktopFrame({ children }: { children: React.ReactNode }) {
  const { collapsed } = useDesktopShell();
  const pathname = usePathname();
  // cardx 的頁面（768 以上）自己有側欄，不用讓位
  const cardx = isCardxRoute(pathname);
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col transition-[padding-left] duration-200', !cardx && (collapsed ? 'lg:pl-14' : 'lg:pl-[230px]'))}>
      {children}
    </div>
  );
}
