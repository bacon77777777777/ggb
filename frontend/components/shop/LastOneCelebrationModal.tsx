'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';

interface LastOneCelebrationModalPrize {
  name: string;
  grade?: string;
  image_url?: string;
}

interface LastOneCelebrationModalProps {
  onClose: () => void;
  prize?: LastOneCelebrationModalPrize | null;
}

export function LastOneCelebrationModal({ onClose, prize }: LastOneCelebrationModalProps) {
  const activePrize = prize || null;
  const activeGrade = activePrize?.grade || '最後賞';

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            'relative w-full overflow-hidden bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl shadow-modal',
            'flex flex-col items-center text-center p-6'
          )}
        >
          <h3 className="text-base font-black text-neutral-900 dark:text-white mb-4 tracking-tight">
            恭喜獲得最後賞
          </h3>

          {activePrize && (
            (() => {
              const imageSrc =
                activePrize.image_url && !activePrize.image_url.startsWith('blob:')
                  ? activePrize.image_url
                  : '/images/item.png';

              return (
            <>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 mb-3 flex items-center justify-center"
              >
                <Image
                  src={imageSrc}
                  alt={activePrize.name}
                  width={160}
                  height={160}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </motion.div>

              <div className="mb-2">
                <span className="inline-flex items-center px-3 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-black text-neutral-700 dark:text-neutral-200 tracking-tight">
                  {activeGrade}
                </span>
              </div>

              <div className="mb-6 w-full px-2">
                <p
                  className="text-neutral-900 dark:text-white font-bold text-[16px] leading-snug"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                    lineHeight: '1.25rem',
                  }}
                >
                  {activePrize.name}
                </p>
              </div>
            </>
              );
            })()
          )}

          <div className="w-full mt-2">
            <Button
              onClick={onClose}
              size="lg"
              className="w-full rounded-[8px] h-[40px] px-6 text-[15px] font-semibold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 text-white"
            >
              確定
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
