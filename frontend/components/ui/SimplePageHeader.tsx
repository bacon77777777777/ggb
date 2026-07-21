'use client';

import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SimplePageHeaderProps {
  title: string;
  onBack: () => void;
  /** 右側插槽（選填），不傳時自動補同等寬的空白以使標題居中 */
  right?: React.ReactNode;
  /** 內容最大寬度 class，如 "max-w-[960px]"（rules pages 用） */
  maxWidth?: string;
  /**
   * dark mode 背景：
   *   'surface'（預設）= dark:bg-neutral-900，與 Navbar 一致
   *   'page' = dark:bg-neutral-950，與全頁背景融合（auth 頁面用）
   */
  darkBg?: 'surface' | 'page';
  className?: string;
}

export default function SimplePageHeader({
  title,
  onBack,
  right,
  maxWidth,
  darkBg = 'surface',
  className,
}: SimplePageHeaderProps) {
  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 h-14 bg-white border-b border-neutral-100 dark:border-neutral-800 z-50',
        darkBg === 'surface' ? 'dark:bg-neutral-900' : 'dark:bg-neutral-950',
        className,
      )}
    >
      <div className={cn('h-full flex items-center px-2', maxWidth && `${maxWidth} mx-auto`)}>
        <button
          onClick={onBack}
          className="p-2 -ml-1 text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors shrink-0"
          aria-label="返回"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="flex-1 text-center text-[17px] font-black text-neutral-900 dark:text-white">
          {title}
        </span>
        {right != null ? (
          <div className="flex items-center shrink-0">{right}</div>
        ) : (
          <div className="w-10 shrink-0" />
        )}
      </div>
    </div>
  );
}
