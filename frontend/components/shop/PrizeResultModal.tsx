import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import { X } from 'lucide-react';
import { IpLoader } from '@/components/ui/IpLoader';
import PrizeDetailSheet from '@/components/ui/PrizeDetailSheet';
import { gradeStyle } from '@/lib/prizeGrade';

export interface ResultPrize {
  id: string;
  name: string;
  grade: string;
  image_url?: string;
  is_last_one?: boolean;
  ticket_number?: number;
}

interface PrizeResultModalProps {
  isOpen?: boolean;
  prizes?: ResultPrize[];
  results?: {
    grade: string;
    name: string;
    isOpened: boolean;
    image_url: string;
    is_last_one: boolean;
    ticket_number: number;
  }[];
  onClose: () => void;
  onGoToWarehouse?: () => void;
  onPlayAgain?: () => void;
  onBackToProduct?: () => void;
  isLoading?: boolean;
  skipRevealAnimation?: boolean;
}

const ITEM_DEFAULT_IMG = '/images/item_defaulet.png';

function prizeImage(p: ResultPrize, failed: boolean): string {
  if (failed) return ITEM_DEFAULT_IMG;
  return p.image_url || ITEM_DEFAULT_IMG;
}

export const PrizeResultModal: React.FC<PrizeResultModalProps> = ({
  isOpen = true,
  prizes,
  results,
  onGoToWarehouse,
  onPlayAgain,
  onBackToProduct,
  onClose,
  isLoading = false,
  skipRevealAnimation = false,
}) => {
  const [showContent, setShowContent] = useState(skipRevealAnimation);
  /** 被點開看大圖的那一項（走總覽同一個全螢幕 sheet） */
  const [detail, setDetail] = useState<ResultPrize | null>(null);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});
  const hasFooterActions = !!(onGoToWarehouse || onBackToProduct || onPlayAgain);
  const markFailed = (key: string) => setFailedIds(prev => ({ ...prev, [key]: true }));

  // Normalize prizes from either `prizes` or `results` prop
  const displayPrizes: ResultPrize[] = React.useMemo(() => {
    const list = prizes || (results ? results.map((r, i) => ({
      id: String(i),
      name: r.name,
      grade: r.grade,
      image_url: r.image_url,
      is_last_one: r.is_last_one,
      ticket_number: r.ticket_number
    })) : []);
    
    // Sort: Normal prizes first, Last One last
    return [...list].sort((a, b) => {
      // If skipRevealAnimation is true (Check Results mode), sort by ticket number
      if (skipRevealAnimation) {
         if (a.is_last_one) return 1;
         if (b.is_last_one) return -1;
         return (a.ticket_number || 0) - (b.ticket_number || 0);
      }
      
      // Default behavior for draw results (Last One last)
      if (a.is_last_one && !b.is_last_one) return 1;
      if (!a.is_last_one && b.is_last_one) return -1;
      return 0;
    });
  }, [prizes, results, skipRevealAnimation]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (!skipRevealAnimation) {
        // Reset state and start loading timer
        setShowContent(false);
        const timer = setTimeout(() => {
          setShowContent(true);
        }, 2000);
        return () => clearTimeout(timer);
      } else {
        setShowContent(true);
      }
    } else {
      document.body.style.overflow = '';
      setShowContent(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, skipRevealAnimation]);

  useEffect(() => {
    if (!isOpen) { setDetail(null); setFailedIds({}); }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={cn(
              "relative w-full h-full bg-white dark:bg-neutral-900 flex flex-col shadow-2xl overflow-hidden",
              "md:max-w-[640px] md:h-[85vh] md:rounded-2xl md:mx-auto"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 z-10 shrink-0">
              <h3 className="text-lg font-black text-neutral-900 dark:text-white">抽獎結果一覽</h3>
              <button 
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
              </button>
            </div>
            {/* Loading View */}
            {isLoading || !showContent ? (
               <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                 <IpLoader />
               </div>
            ) : (
              /* Result View */
              <>
                {/* 條列（可捲動）：籤號 ＋ 小圖 ＋ 賞等 ＋ 名稱，點一列開全螢幕大圖 */}
                <div className={cn(
                  "flex-1 overflow-y-auto custom-scrollbar px-3.5 py-4 bg-white dark:bg-neutral-900",
                  hasFooterActions ? "pb-20" : "pb-4"
                )}>
                  <div className="space-y-1.5">
                    {displayPrizes.map((prize, idx) => {
                      const isLastOne = prize.is_last_one;
                      const gs = gradeStyle(isLastOne ? '最後賞' : prize.grade);

                      return (
                        <motion.button
                          key={`${prize.id}-${idx}`}
                          type="button"
                          onClick={() => setDetail(prize)}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.03, 0.4), duration: 0.2 }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl border p-1.5 text-left transition-colors",
                            "border-neutral-100 bg-neutral-50 hover:bg-neutral-100 active:scale-[0.99]",
                            "dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:bg-neutral-800",
                            isLastOne && "border-yellow-300 bg-yellow-50 dark:border-yellow-700/60 dark:bg-yellow-900/20"
                          )}
                        >
                          {/* 籤號：一番賞玩家對號用的，擺最前面 */}
                          <span
                            className={cn(
                              "w-9 shrink-0 text-center text-[13px] font-black tabular-nums",
                              isLastOne
                                ? "text-yellow-600 dark:text-yellow-500"
                                : "text-neutral-400 dark:text-neutral-500"
                            )}
                          >
                            {isLastOne ? '—' : String(prize.ticket_number ?? '').padStart(2, '0')}
                          </span>

                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white dark:bg-neutral-900">
                            <Image
                              src={prizeImage(prize, !!failedIds[`l${idx}`])}
                              alt={prize.name}
                              width={36}
                              height={36}
                              className="h-full w-full object-contain"
                              unoptimized
                              onError={() => markFailed(`l${idx}`)}
                            />
                          </div>

                          <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-black', gs.bg, gs.text)}>
                            {isLastOne ? '最後賞' : `${prize.grade.replace('賞', '')}賞`}
                          </span>

                          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-neutral-900 dark:text-white">
                            {prize.name}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Action Bar */}
                {hasFooterActions && (
                  <div className="min-h-16 px-4 pt-3 pb-[env(safe-area-inset-bottom)] border-t border-neutral-100 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 flex items-center justify-end gap-3 shrink-0">
                    {onGoToWarehouse && (
                      <Button
                        onClick={onGoToWarehouse}
                        className="h-[40px] px-4 rounded-xl text-sm font-black bg-neutral-200 hover:bg-neutral-300 text-neutral-700 shadow-sm whitespace-nowrap"
                      >
                        前往倉庫
                      </Button>
                    )}
                    {onBackToProduct && (
                      <Button
                        onClick={onBackToProduct}
                        className="h-[40px] px-4 rounded-xl text-sm font-black bg-neutral-200 hover:bg-neutral-300 text-neutral-700 shadow-sm whitespace-nowrap"
                      >
                        回商品頁
                      </Button>
                    )}
                    {onPlayAgain && (
                      <Button
                        onClick={onPlayAgain}
                        className="h-[40px] px-4 rounded-xl text-sm font-black bg-accent-red hover:bg-accent-red/90 text-white shadow-md whitespace-nowrap"
                      >
                        再抽一次
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>

          {/* 大圖走總覽同一個元件：全螢幕黑遮罩 ＋ 大圖 ＋ 賞等 ＋ 品名 */}
          <PrizeDetailSheet
            prize={detail ? {
              name: detail.name,
              image_url: detail.image_url ?? null,
              level: detail.is_last_one ? '最後賞' : detail.grade,
            } : null}
            onClose={() => setDetail(null)}
          />
        </div>
      )}
    </AnimatePresence>
  );
};
