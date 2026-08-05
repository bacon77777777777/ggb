'use client';

/**
 * 抽籤販售的抽獎彈窗
 *
 * 不用 PurchaseConfirmationModal：那支整個是繞著「要付多少錢、用不用點數、
 * 有沒有優惠券、餘額夠不夠」在轉，而這裡一毛錢都不收，唯一的限制是
 * 每人可抽次數。硬套過去只會變成一堆 disabled 的欄位。
 *
 * 付錢的時機是之後申請寄出的時候，所以這裡要把「中籤要付多少」講清楚，
 * 不然玩家會以為抽到就是免費拿走。
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (count: number) => void;
  isProcessing: boolean;
  productName: string;
  /** 每人可抽次數上限 */
  perUserLimit: number;
  /** 這個玩家已經抽掉幾次 */
  usedByMe: number;
  /** 整檔還剩幾張籤 */
  remainingTickets: number;
  /** 各品項中籤後寄出要付的金額，用來顯示區間 */
  salePrices: number[];
}

export default function LotteryDrawModal({
  isOpen, onClose, onConfirm, isProcessing,
  productName, perUserLimit, usedByMe, remainingTickets, salePrices,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [count, setCount] = useState(1);

  useEffect(() => { setMounted(true); }, []);

  const myRemaining = Math.max(0, perUserLimit - usedByMe);
  const maxDraw = Math.min(myRemaining, remainingTickets, 10);

  // 每次打開重設，否則上次抽 5 次這次一進來就停在 5
  useEffect(() => { if (isOpen) setCount(Math.min(1, maxDraw)); }, [isOpen, maxDraw]);

  if (!mounted) return null;

  const prices = salePrices.filter(p => p > 0);
  const priceLabel = prices.length === 0
    ? null
    : prices.length === 1 || Math.min(...prices) === Math.max(...prices)
      ? `${prices[0].toLocaleString()} G`
      : `${Math.min(...prices).toLocaleString()}～${Math.max(...prices).toLocaleString()} G`;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[2600] flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => !isProcessing && onClose()}
        >
          <div className="absolute inset-0 bg-black/60" />

          <motion.div
            className="relative w-full sm:max-w-[420px] bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl shadow-2xl pb-[env(safe-area-inset-bottom)]"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="font-black text-sm text-neutral-900 dark:text-neutral-100 tracking-wide">
                免費抽籤
              </span>
              <button
                type="button"
                onClick={() => !isProcessing && onClose()}
                className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                aria-label="關閉"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-4">
              <p className="text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                {productName}
              </p>

              <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-800 p-4 space-y-2">
                <Row label="你還可以抽" value={`${myRemaining} 次`} strong />
                <Row label="這一檔剩餘" value={`${remainingTickets} 張`} />
                {priceLabel && <Row label="中籤後寄出應付" value={priceLabel} />}
              </div>

              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                抽籤免費。抽中的商品會先放進你的倉庫，申請寄送時才需要付上面的金額。
                抽中的商品不能回收成 G 幣，30 天內沒有申請寄送就會失效。
              </p>

              {maxDraw > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-black text-neutral-700 dark:text-neutral-200">抽幾次</span>
                    <div className="flex items-center gap-3">
                      <StepBtn onClick={() => setCount(c => Math.max(1, c - 1))} disabled={count <= 1 || isProcessing}>−</StepBtn>
                      <span className="w-8 text-center font-black tabular-nums text-neutral-900 dark:text-neutral-50">
                        {count}
                      </span>
                      <StepBtn onClick={() => setCount(c => Math.min(maxDraw, c + 1))} disabled={count >= maxDraw || isProcessing}>＋</StepBtn>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onConfirm(count)}
                    disabled={isProcessing}
                    className="w-full py-3.5 rounded-2xl bg-primary text-white text-sm font-black hover:bg-primary/90 disabled:opacity-60 transition-colors"
                  >
                    {isProcessing ? '抽籤中…' : `免費抽 ${count} 次`}
                  </button>
                </>
              ) : (
                <div className="py-3 text-center text-sm font-black text-neutral-400">
                  {remainingTickets <= 0 ? '這一檔已經抽完了' : '你的抽籤次數已用完'}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={`tabular-nums ${strong
        ? 'font-black text-primary'
        : 'font-black text-neutral-800 dark:text-neutral-100'}`}>
        {value}
      </span>
    </div>
  );
}

function StepBtn({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-black disabled:opacity-40 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
    >
      {children}
    </button>
  );
}
