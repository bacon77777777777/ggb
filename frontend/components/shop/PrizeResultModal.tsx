import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import { X, Loader2 } from 'lucide-react';

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

const HIGH_TIER_GRADES = ['A', 'B', 'C', 'Last One', 'LAST ONE', 'SP'];

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
  const hasFooterActions = !!(onGoToWarehouse || onBackToProduct || onPlayAgain);

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

  const isHighTier = (grade: string) => HIGH_TIER_GRADES.some(tier => grade.includes(tier));

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
                 <Loader2 className="w-8 h-8 text-neutral-500 dark:text-neutral-400 animate-spin" />
                 <p className="mt-4 text-sm font-bold text-neutral-500 dark:text-neutral-400">正在載入抽獎結果...</p>
               </div>
            ) : (
              /* Result View */
              <>
                {/* Grid Content */}
                <div className={cn(
                  "flex-1 overflow-y-auto custom-scrollbar p-4 bg-white dark:bg-neutral-900",
                  hasFooterActions ? "pb-20" : "pb-4"
                )}>
                  <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2 content-start">
                    {displayPrizes.map((prize, idx) => {
                      const isSpecial = isHighTier(prize.grade);
                      const isLastOne = prize.is_last_one;
                      
                      return (
                        <motion.div
                          key={`${prize.id}-${idx}`}
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ 
                            delay: idx * 0.03,
                            type: "spring",
                            stiffness: 200,
                            damping: 15
                          }}
                          className={cn(
                            "aspect-square rounded-[8px] border-2 flex flex-col items-center justify-center gap-0.5 transition-all duration-200",
                            isSpecial 
                              ? "border-transparent bg-neutral-200 dark:bg-neutral-800" 
                              : "border-transparent bg-neutral-200 dark:bg-neutral-800",
                            isLastOne && "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 ring-2 ring-yellow-400 ring-offset-2 dark:ring-offset-neutral-900 shadow-sm"
                          )}
                        >
                          <span
                            className={cn(
                              "font-amount font-black leading-none tracking-wider text-xs",
                              "font-[Chiron_GoRound_TC]",
                              isLastOne
                                ? "text-yellow-600 dark:text-yellow-500"
                                : "text-neutral-400 dark:text-neutral-600"
                            )}
                          >
                            {isLastOne ? "Last One" : String(prize.ticket_number).padStart(2, "0")}
                          </span>
                          <span
                            className={cn(
                              "text-xs font-black font-amount leading-none text-center mt-1",
                              "font-[\"Chiron_GoRound_TC\"]",
                              isSpecial ? "text-accent-red" : "text-neutral-400 dark:text-neutral-600",
                              isLastOne && "text-yellow-600 dark:text-yellow-500"
                            )}
                          >
                            {isLastOne ? "最後賞" : `${prize.grade.replace("賞", "")}賞`}
                          </span>
                        </motion.div>
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
        </div>
      )}
    </AnimatePresence>
  );
};
