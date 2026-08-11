'use client';

import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import PinchZoomImage from '@/components/ui/PinchZoomImage';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export interface PrizeInfo {
  name: string;
  image_url?: string | null;
  level?: string | null;
  total?: number;
  remaining?: number;
  recycle_value?: number | null;
}

interface Props {
  prize: PrizeInfo | null;
  onClose: () => void;
  /**
   * 一番賞／抽卡／自製賞這類「開賣前排定籤號」的玩法傳 true。
   * 只有這幾種會顯示「剩餘」—— 它們的商品頁配率表本來就公開張數，這裡是同一份資訊。
   * 轉蛋／盒玩不顯示：那些數字站上任何地方都沒公開，只在這個彈窗漏出來。
   */
  sealed?: boolean;
  /** 疊在別的彈窗之上時要拉高（例：中獎結果彈窗是 3000，這裡要更高） */
  zIndex?: number;
  /**
   * 上一項／下一項。有給才會顯示左右箭頭，圖片也才吃左右滑手勢。
   * 品項總覽與配率表都是一整份清單，看完一項自然想看下一項 ——
   * 關掉再點下一列太囉唆。
   */
  onPrev?: () => void;
  onNext?: () => void;
}

function getLevelStyle(level: string): string {
  const l = level.toUpperCase();
  if (l === 'GOD') return 'text-violet-600';
  if (l === 'LEGEND') return 'text-amber-500';
  if (l === 'STAR') return 'text-blue-500';
  if (l === 'CORE') return 'text-neutral-500';
  if (l.includes('LAST') || l.includes('最後')) return 'text-yellow-500';
  if (l === 'A賞' || l === 'A') return 'text-red-500';
  if (l === 'B賞' || l === 'B') return 'text-orange-500';
  if (l === 'C賞' || l === 'C') return 'text-amber-500';
  if (l === 'D賞' || l === 'D') return 'text-green-500';
  if (l === 'E賞' || l === 'E') return 'text-blue-500';
  return 'text-neutral-500';
}

export default function PrizeDetailSheet({ prize, onClose, sealed = false, zIndex = 2700, onPrev, onNext }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const rows: { label: string; value: React.ReactNode }[] = [];
  if (prize?.level && prize.level !== prize.name) {
    rows.push({
      label: '賞等',
      value: <span className={`font-black ${getLevelStyle(prize.level)}`}>{prize.level}</span>,
    });
  }
  // 剩餘只給封存制的玩法看：它們的商品頁配率表本來就公開張數，這裡是同一份資訊。
  // 轉蛋／盒玩的收藏列表只列品名與圖，張數站上沒有任何地方公開
  if (sealed && prize?.remaining !== undefined && prize?.total !== undefined) {
    rows.push({
      label: '剩餘',
      value: (
        <span className="font-black text-neutral-800 dark:text-neutral-200">
          {prize.remaining.toLocaleString()}
          <span className="text-neutral-300 dark:text-neutral-600 mx-1">/</span>
          {prize.total.toLocaleString()}
        </span>
      ),
    });
  }
  if (prize?.recycle_value !== undefined && prize.recycle_value !== null && prize.recycle_value > 0) {
    rows.push({
      label: '回收幣值',
      value: (
        <span className="font-black text-amber-500 flex items-center gap-1">
          <span>{prize.recycle_value.toLocaleString()}</span>
          <span className="text-xs">G</span>
        </span>
      ),
    });
  }
  // 機率一律不顯示。
  // 封存制的玩法本來就不是靠機率決定（決定結果的是開賣前排好的籤號），
  // 轉蛋／盒玩則是平台不對外公開單品機率 —— 兩邊都沒有該露出的理由。

  return createPortal(
    <AnimatePresence>
      {prize && (
        <motion.div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/60" />

          {/* bottom sheet */}
          <motion.div
            className="relative w-full max-w-[560px] bg-white dark:bg-neutral-900 rounded-t-3xl overflow-y-auto max-h-[88dvh] shadow-2xl pb-[env(safe-area-inset-bottom)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
          >
            {/* header */}
            <div className="sticky top-0 bg-white dark:bg-neutral-900 flex items-center justify-between px-5 pt-4 pb-2 z-10">
              <span className="font-black text-sm text-neutral-900 dark:text-neutral-100 tracking-wide">品項詳情</span>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 圖片：雙指縮放／拖移（放開彈回），沒放大時左右滑切換品項 */}
            <div className="relative px-5 pt-1 pb-2">
              <PinchZoomImage
                key={prize?.name ?? ''}
                src={prize?.image_url || '/images/item_defaulet.png'}
                alt={prize?.name ?? ''}
                className="mx-auto h-[36dvh] max-h-[320px] w-full rounded-xl"
                onSwipeLeft={onNext}
                onSwipeRight={onPrev}
              />
              {onPrev && (
                <button
                  type="button"
                  onClick={onPrev}
                  aria-label="上一項"
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition-opacity hover:bg-black/40 active:scale-95"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {onNext && (
                <button
                  type="button"
                  onClick={onNext}
                  aria-label="下一項"
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition-opacity hover:bg-black/40 active:scale-95"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* name */}
            <div className="px-5 pb-2 text-center">
              <p className="font-black text-sm text-neutral-900 dark:text-neutral-100 leading-snug">{prize?.name}</p>
            </div>

            {/* detail rows */}
            {rows.length > 0 && (
              <>
                <div className="h-px bg-neutral-100 dark:bg-neutral-800 mx-5" />
                <div className="px-5 pt-1 pb-4 flex flex-col gap-0">
                  {rows.map((row, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-neutral-50 dark:border-neutral-800 last:border-0">
                      <span className="text-[13px] text-neutral-400 dark:text-neutral-500">{row.label}</span>
                      <span className="text-[13px]">{row.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
