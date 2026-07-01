import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Prize } from '@/components/GachaMachine';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface GachaResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: Prize[];
}

const ITEM_DEFAULT_IMG = '/images/item_defaulet.png';

export function GachaResultModal({ isOpen, onClose, results }: GachaResultModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
  const hasMultiple = results.length > 1;
  const activePrize = results[activeIndex] || results[0];
  const resultSoundRef = React.useRef<HTMLAudioElement | null>(null);
  const touchStartXRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio('/audio/getpopup.mp3');
    audio.preload = 'auto';
    resultSoundRef.current = audio;

    return () => {
      if (resultSoundRef.current) {
        resultSoundRef.current.pause();
        resultSoundRef.current.src = '';
        resultSoundRef.current.load();
      }
    };
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    const audio = resultSoundRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      setActiveIndex(0);
      return;
    }
    if (!results[activeIndex]) {
      setActiveIndex(0);
    }
  }, [isOpen, results, activeIndex]);

  const showPrev = () => {
    if (!hasMultiple) return;
    setImgError(false);
    setActiveIndex((prev) => {
      const nextIndex = prev - 1;
      if (nextIndex < 0) return results.length - 1;
      return nextIndex;
    });
  };

  const showNext = () => {
    if (!hasMultiple) return;
    setImgError(false);
    setActiveIndex((prev) => {
      const nextIndex = prev + 1;
      if (nextIndex >= results.length) return 0;
      return nextIndex;
    });
  };

  const activeGrade = activePrize ? activePrize.grade || activePrize.rarity : undefined;

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!hasMultiple) return;
    const touch = e.touches[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!hasMultiple) return;
    const startX = touchStartXRef.current;
    const touch = e.changedTouches[0];
    if (startX == null || !touch) return;
    const diffX = touch.clientX - startX;
    const threshold = 40;
    if (Math.abs(diffX) < threshold) return;
    if (diffX < 0) {
      showNext();
    } else {
      showPrev();
    }
    touchStartXRef.current = null;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
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
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <h3 className="text-base font-black text-neutral-900 dark:text-white mb-4 tracking-tight">
                恭喜獲得
              </h3>

              {activePrize && (
                <>
                  <motion.div
                    key={activePrize.id ?? activeIndex}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className="w-40 h-auto rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 mb-3 flex items-center justify-center"
                  >
                    <Image
                      src={
                        imgError
                          ? ITEM_DEFAULT_IMG
                          : activePrize.image_url ||
                            `/images/item/${(activePrize.id ?? '').toString().padStart(5, '0')}.jpg`
                      }
                      alt={activePrize.name}
                      width={160}
                      height={160}
                      className="w-full h-auto object-contain"
                      unoptimized
                      onError={() => setImgError(true)}
                    />
                  </motion.div>

                  {activeGrade && (
                    <div className="mb-2">
                      <span className="inline-flex items-center px-3 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-black text-neutral-700 dark:text-neutral-200 tracking-tight">
                        {activeGrade}
                      </span>
                    </div>
                  )}

                  <div className="mb-6 w-full px-2">
                    <div className="flex items-center justify-center gap-3">
                      {hasMultiple && (
                        <button
                          type="button"
                          onClick={showPrev}
                          className="flex items-center justify-center p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-transform"
                          aria-label="上一個"
                        >
                          <ChevronLeft className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                        </button>
                      )}
                      <p
                        className="flex-1 text-neutral-900 dark:text-white font-bold text-[16px] text-center"
                        style={{
                          lineHeight: '1.25rem',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          wordBreak: 'break-word',
                        }}
                      >
                        {activePrize.name}
                      </p>
                      {hasMultiple && (
                        <button
                          type="button"
                          onClick={showNext}
                          className="flex items-center justify-center p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-transform"
                          aria-label="下一個"
                        >
                          <ChevronRight className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                        </button>
                      )}
                    </div>
                    {hasMultiple && (
                      <div className="mt-2 text-xs font-medium text-neutral-400">
                        {activeIndex + 1} / {results.length}
                      </div>
                    )}
                  </div>
                </>
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
      )}
    </AnimatePresence>
  );
}
