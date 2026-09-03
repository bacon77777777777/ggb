'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogIn, type LucideIcon } from 'lucide-react';

interface LoginRequiredProps {
  /** 主標，例：登入後才看得到通知 */
  title: string;
  /** 一句補充，說明為什麼要登入 */
  description?: string;
  /** 登入完要回哪裡；不給就回目前這一頁 */
  next?: string;
  icon?: LucideIcon;
}

/**
 * 「這頁要登入才看得到」的整頁提示
 *
 * 樣式沿用會員中心的訪客畫面（圖示＋主標＋說明＋膠囊按鈕）。
 * 登入頁只認 `?next=`（站內路徑），不是 `?redirect=`——
 * 帶錯參數登完會被丟回首頁。
 *
 * ⚠️ 呼叫端要先等 AuthContext 的 isLoading 結束再判斷 user，
 * 不然已登入的玩家刷新時會先閃一下這張提示。
 */
export function LoginRequired({ title, description, next, icon: Icon = LogIn }: LoginRequiredProps) {
  const pathname = usePathname();
  const target = next ?? pathname ?? '/';
  const href = `/login?next=${encodeURIComponent(target)}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-neutral-950 p-8 text-center">
      <Icon className="w-10 h-10 text-neutral-300 mb-4" />
      <p className="text-base font-black text-neutral-600 dark:text-neutral-200 mb-2">{title}</p>
      {description && (
        <p className="text-sm text-neutral-400 mb-6">{description}</p>
      )}
      <Link
        href={href}
        className="inline-flex items-center justify-center px-6 h-11 rounded-full bg-primary text-white text-sm font-black shadow-lg shadow-primary/30 active:scale-95 transition-transform"
      >
        前往登入
      </Link>
    </div>
  );
}
