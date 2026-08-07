'use client';

import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X } from 'lucide-react';
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

export default function PrizeDetailSheet({ prize, onClose, sealed = false }: Props) {
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
          className="fixed inset-0 z-[2700] flex items-end justify-center"
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

            {/* image：容器貼合圖片本身比例，不留白邊 */}
            <div className="px-5 pt-1 pb-2 flex justify-center">
              <Image
                src={prize?.image_url || '/images/item_defaulet.png'}
                alt={prize?.name ?? ''}
                width={480}
                height={480}
                className="h-[36dvh] max-h-[320px] w-auto max-w-full object-contain rounded-xl"
                unoptimized
              />
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
