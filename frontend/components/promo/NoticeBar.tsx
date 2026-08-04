'use client';

/**
 * 底部警語列 —— 貼在 MobileTabbar 上緣
 *
 * 樣式沿用倉庫頂部那條深底淺字警語（profile 頁），差別是右邊多一個叉叉，
 * 關掉後依後台設定的天數才會再出現。
 *
 * 桌機的 MobileTabbar 是 md:hidden，所以這條也只在手機顯示；
 * 桌機版的公平性露出走首頁區塊，不做浮動列（桌機沒有底部導航可以貼）。
 */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { usePromos } from './usePromos';
import { dismiss } from '@/lib/promoDismiss';

/**
 * 把自己的實際高度掛到 --promo-notice-h，讓頁面既有的浮動按鈕
 * （首頁的上架、排行榜）跟著上移。用量測而不是寫死高度，
 * 因為文案長度由後台決定，兩行與一行差 16px。
 */
function usePublishHeight(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!active || !ref.current) {
      root.style.setProperty('--promo-notice-h', '0px');
      return;
    }
    const el = ref.current;
    const sync = () => root.style.setProperty('--promo-notice-h', `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--promo-notice-h', '0px');
    };
  }, [active]);

  return ref;
}

export default function NoticeBar({ placement }: { placement: string }) {
  const { promos } = usePromos('notice', placement);
  const promo = promos[0];   // 同一位置只顯示排序最前的一則，疊兩條會吃掉內容高度
  const ref = usePublishHeight(Boolean(promo));
  if (!promo) return null;

  const body = (
    <>
      <p className="text-[11px] text-neutral-300 leading-relaxed flex-1">
        {promo.body}
        {promo.cta_href && promo.cta_text && (
          /* 用 primary-light 而非 primary：#EE4D2D 壓在深底上偏濁，淺一階才讀得出來 */
          <span className="ml-1 text-primary-light underline underline-offset-2 font-bold whitespace-nowrap">
            {promo.cta_text}
          </span>
        )}
      </p>
    </>
  );

  return (
    <div
      ref={ref}
      className="fixed left-0 right-0 md:hidden z-40"
      style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
      data-testid="promo-notice-bar"
    >
      <div className="bg-neutral-800 dark:bg-neutral-900 border-t border-white/5 px-4 py-2.5 flex items-start gap-2">
        {promo.cta_href ? (
          <Link href={promo.cta_href} className="flex items-start gap-2 flex-1 min-w-0">
            {body}
          </Link>
        ) : (
          <div className="flex items-start gap-2 flex-1 min-w-0">{body}</div>
        )}
        <button
          type="button"
          onClick={() => dismiss(promo.id)}
          aria-label="關閉提示"
          className="flex-shrink-0 -mr-1 -mt-0.5 p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
