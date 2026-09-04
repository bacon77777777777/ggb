'use client';

/**
 * 把 <main> 與頁尾往右推、讓出側欄的寬度（≥1024 才推，768 以下側欄不存在）。
 * 導覽列不在這層裡面：它跟 cardx 一樣橫跨整個視窗，側欄從它下緣開始。
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useDesktopShell } from '@/contexts/DesktopShellContext';

export default function DesktopFrame({ children }: { children: React.ReactNode }) {
  const { collapsed } = useDesktopShell();
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col transition-[padding-left] duration-200', collapsed ? 'lg:pl-14' : 'lg:pl-[230px]')}>
      {children}
    </div>
  );
}
