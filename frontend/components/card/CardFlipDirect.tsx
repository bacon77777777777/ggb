'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import type { Prize } from '@/components/GachaMachine';

type CardFlipDirectProps = {
  isOpen: boolean;
  prizes: Prize[];
  onGoToWarehouse: () => void;
  onContinue: () => void;
};

function normalizeRank(grade?: string, rarity?: string): 'SSR' | 'SR' | 'R' | 'N' {
  const raw = (grade || rarity || '').toUpperCase();
  if (raw.includes('SSR') || raw.includes('超稀有')) return 'SSR';
  if (raw.includes('SR')) return 'SR';
  if (raw.includes('R') || raw.includes('稀有')) return 'R';
  return 'N';
}

function getCardFront(grade?: string, rarity?: string) {
  const r = normalizeRank(grade, rarity);
  return r === 'SSR' ? '/images/card/00001.png'
    : r === 'SR'  ? '/images/card/00002.png'
    : r === 'R'   ? '/images/card/00003.png'
    : '/images/card/00004.png';
}

function getCardBack(grade?: string, rarity?: string) {
  const r = normalizeRank(grade, rarity);
  return r === 'SSR' ? '/images/card/cardback1.png'
    : r === 'SR'  ? '/images/card/cardback2.png'
    : r === 'R'   ? '/images/card/cardback3.png'
    : '/images/card/cardback4.png';
}

export default function CardFlipDirect({
  isOpen,
  prizes,
  onGoToWarehouse,
  onContinue,
}: CardFlipDirectProps) {
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [shakingId, setShakingId] = useState<string | null>(null);

  const ranks = useMemo(() => prizes.map(p => normalizeRank(p.grade, p.rarity)), [prizes]);
  const allRevealed = prizes.length > 0 && prizes.every(p => revealedIds.has(p.id));

  useEffect(() => {
    if (!isOpen) {
      setRevealedIds(new Set());
      setShakingId(null);
    }
  }, [isOpen]);

  const reveal = (id: string) => setRevealedIds(prev => new Set([...prev, id]));

  const handleCardClick = (id: string, rank: 'SSR' | 'SR' | 'R' | 'N') => {
    if (revealedIds.has(id)) return;
    if (rank === 'SSR' && shakingId !== id) {
      setShakingId(id);
      setTimeout(() => { setShakingId(null); reveal(id); }, 380);
      return;
    }
    reveal(id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <Image src="/images/gacha_bg.png" alt="" fill className="object-cover brightness-[0.25] blur-[8px]" unoptimized />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      <motion.div
        className="w-full flex flex-col gap-4 pb-24 px-3"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex flex-col items-center gap-1">
          <p className="text-xs font-black text-neutral-300 tracking-[0.3em] uppercase">card revealed</p>
          <p className="text-base font-black text-white">共抽到 {prizes.length} 張卡牌</p>
        </div>

        <div className={cn('grid gap-2', prizes.length <= 2 ? 'grid-cols-2' : 'grid-cols-3')}>
          {prizes.map((prize, idx) => {
            const rank = ranks[idx];
            const isRevealed = revealedIds.has(prize.id);
            const isSSR = rank === 'SSR';
            const isShaking = shakingId === prize.id;

            return (
              <button
                key={prize.id}
                type="button"
                onClick={() => handleCardClick(prize.id, rank)}
                className="relative aspect-[650/930] rounded-xl bg-transparent focus:outline-none"
              >
                <motion.div
                  className="w-full h-full rounded-xl"
                  animate={
                    isRevealed
                      ? isSSR
                        ? { scale: [0.96, 1.1, 0.98, 1.14, 1], rotate: [0, -2, 2, -1, 0], y: [0, -3, 1, -4, 0], opacity: 1 }
                        : { scale: [0.96, 1.03, 1], y: [0, -1, 0], opacity: 1 }
                      : isShaking
                        ? { scale: [0.98, 1.05, 0.99], rotate: [0, -3, 3, -2, 2, 0], opacity: 1 }
                        : { scale: 0.98, opacity: 1 }
                  }
                  initial={{ scale: 0.94, opacity: 0 }}
                  transition={
                    isRevealed
                      ? { duration: isSSR ? 0.6 : 0.4, ease: 'easeOut' }
                      : isShaking
                        ? { duration: 0.35 }
                        : { duration: 0.3 }
                  }
                >
                  {!isRevealed ? (
                    <div className="w-full h-full rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.8)] border border-neutral-700/70 bg-black">
                      <div className="relative w-full h-full">
                        <Image src={getCardBack(prize.grade, prize.rarity)} alt="card back" fill className="object-cover" unoptimized />
                      </div>
                    </div>
                  ) : (
                    <motion.div className="w-full h-full rounded-xl overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.9)] bg-black"
                      animate={isSSR ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                      transition={isSSR ? { duration: 1.1, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' } : undefined}
                    >
                      <div className="relative w-full h-full">
                        {isSSR && (
                          <motion.div
                            className="pointer-events-none absolute inset-[-18%] rounded-[32px] bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.9),rgba(24,16,0,0)_60%)] blur-xl"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.4, repeat: Infinity, repeatType: 'reverse' }}
                          />
                        )}
                        <Image src={getCardFront(prize.grade, prize.rarity)} alt={prize.name} fill className="object-cover" unoptimized />
                        {(rank === 'SSR' || rank === 'SR') && (
                          <motion.div
                            className="pointer-events-none absolute inset-[-10%] bg-gradient-to-b from-white/60 via-white/0 to-transparent mix-blend-screen"
                            initial={{ opacity: 0, y: '-120%' }}
                            animate={{ opacity: [0, 1, 0], y: ['-120%', '120%'] }}
                            transition={{ duration: 0.7, ease: 'easeInOut' }}
                          />
                        )}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Bottom action bar */}
      <AnimatePresence>
        <motion.div
          className="absolute bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 z-[1300] pb-[env(safe-area-inset-bottom)]"
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="h-16 px-4 flex items-center justify-center w-full">
            {!allRevealed ? (
              <Button
                onClick={() => setRevealedIds(new Set(prizes.map(p => p.id)))}
                size="lg"
                className="w-full md:w-[320px] h-[44px] rounded-xl text-base font-black bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-xl shadow-blue-500/20"
              >
                全部開啟
              </Button>
            ) : (
              <div className="flex gap-3 w-full max-w-[360px]">
                <Button onClick={onGoToWarehouse} size="lg"
                  className="flex-1 h-[44px] rounded-xl text-base font-black bg-neutral-200 hover:bg-neutral-300 text-neutral-700 whitespace-nowrap">
                  前往倉庫
                </Button>
                <Button onClick={onContinue} size="lg"
                  className="flex-1 h-[44px] rounded-xl text-base font-black bg-accent-red hover:bg-accent-red/90 text-white shadow-xl shadow-accent-red/20 whitespace-nowrap">
                  繼續開抽
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
