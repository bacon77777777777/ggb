'use client';

import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 全站統一的內頁頂部導航（老闆 2026-08-20：跟商品頁同元件，只有右邊配的東西不同）
 *
 * 兩個出口：
 * - `PageHeaderBack`：返回鈕＋標題合成的那一顆按鈕（按文字也能返回）。
 *   全站 Navbar 的內頁模式吃這顆；樣式以商品內頁為準。
 * - `PageHeader`：整條 57px 的頁頭（左：返回鈕；右：`right` 插槽）。
 *   會員中心那批整頁覆蓋層（倉庫／配送／紀錄／關注／優惠券／設定／交易所）用這條。
 *
 * ⚠️ 樣式改這裡就是改全站，不要在頁面裡另外手刻同款的 bar。
 */

export function PageHeaderBack({
  title,
  onBack,
  className,
}: {
  title: React.ReactNode;
  onBack: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onBack}
      className={cn(
        'flex items-center gap-0.5 -ml-2 pl-1 pr-3 py-2 rounded-xl text-neutral-900 dark:text-neutral-100 active:opacity-70 transition-opacity min-w-0',
        className,
      )}
    >
      <ChevronLeft className="w-7 h-7 stroke-[2.5] shrink-0" />
      <span className="text-[18px] font-black truncate">{title}</span>
    </button>
  );
}

export default function PageHeader({
  title,
  onBack,
  right,
  className,
}: {
  title: React.ReactNode;
  onBack: () => void;
  /** 右側插槽：各頁自己配（分解紀錄、交易紀錄、輸入優惠代碼…），沒有就留空 */
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      /* 下拉刷新要靠這個標記找到「頁面自己的頂欄」，把空隙開在它下面。
         這一列不是 sticky（它在 flex 版面裡佔位），所以 PwaPullToRefresh
         的 navBottom() 光看 position 認不出來 —— 認不出來就會把轉蛋球畫到
         畫面最頂端，被這條白底蓋掉大半（老闆 2026-08-20 登入頁截圖）。 */
      data-page-header=""
      className={cn(
        'bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-2 h-[57px] flex items-center justify-between shrink-0',
        className,
      )}
    >
      <PageHeaderBack title={title} onBack={onBack} className="flex-1" />
      {right != null && <div className="flex items-center shrink-0 pr-1">{right}</div>}
    </div>
  );
}
