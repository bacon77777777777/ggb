'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import type { Prize } from '@/components/GachaMachine';
import BoosterPackOpenEffect from './BoosterPackOpenEffect';

type CardDrawAnimationProps = {
  isOpen: boolean;
  prizes: Prize[];
  onGoToWarehouse: () => void;
  onContinue: () => void;
};

type Phase = 'pack' | 'spread';

function getRankCardImage(grade?: string, rarity?: string) {
  const raw = (grade || rarity || '').toUpperCase();
  if (!raw) return '/images/card/00004.png';
  if (raw.includes('SSR') || raw.includes('超稀有')) return '/images/card/00001.png';
  if (raw.includes('SR')) return '/images/card/00002.png';
  if (raw.includes('R') || raw.includes('稀有')) return '/images/card/00003.png';
  return '/images/card/00004.png';
}

function getRankCardBackImage(grade?: string, rarity?: string) {
  const raw = (grade || rarity || '').toUpperCase();
  if (!raw) return '/images/card/cardback4.png';
  if (raw.includes('SSR') || raw.includes('超稀有')) return '/images/card/cardback1.png';
  if (raw.includes('SR')) return '/images/card/cardback2.png';
  if (raw.includes('R') || raw.includes('稀有')) return '/images/card/cardback3.png';
  return '/images/card/cardback4.png';
}

function isPremiumCard(grade?: string, rarity?: string) {
  const raw = (grade || rarity || '').toUpperCase();
  if (!raw) return false;
  if (raw.includes('SSR') || raw.includes('超稀有')) return true;
  if (raw.includes('SR')) return true;
  if (raw.includes('R') || raw.includes('稀有')) return true;
  return false;
}

function isShinyCard(grade?: string, rarity?: string) {
  const raw = (grade || rarity || '').toUpperCase();
  if (!raw) return false;
  if (raw.includes('SSR') || raw.includes('超稀有')) return true;
  if (raw.includes('SR')) return true;
  return false;
}

function normalizeCardRank(grade?: string, rarity?: string): 'SSR' | 'SR' | 'R' | 'N' {
  const raw = (grade || rarity || '').toUpperCase();
  if (!raw) return 'N';
  if (raw.includes('SSR') || raw.includes('超稀有')) return 'SSR';
  if (raw.includes('SR')) return 'SR';
  if (raw.includes('R') || raw.includes('稀有')) return 'R';
  return 'N';
}

function isSSRFace(grade?: string, rarity?: string) {
  return normalizeCardRank(grade, rarity) === 'SSR';
}

function pickBackRankForPrize(grade?: string, rarity?: string): 'SSR' | 'SR' | 'R' | 'N' {
  const face = normalizeCardRank(grade, rarity);
  const r = Math.random();
  if (face === 'N') {
    return r < 0.75 ? 'N' : 'R';
  }
  if (face === 'R') {
    return r < 0.7 ? 'R' : 'SR';
  }
  if (face === 'SR') {
    return r < 0.6 ? 'SR' : 'SSR';
  }
  return 'SSR';
}

export default function CardDrawAnimation({
  isOpen,
  prizes,
  onGoToWarehouse,
  onContinue,
}: CardDrawAnimationProps) {
  const [phase, setPhase] = useState<Phase>('pack');
  // const [showBooster, setShowBooster] = useState(true); // Unused state
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [shakingIds, setShakingIds] = useState<string[]>([]);

  const prizeBackLevels = useMemo(
    () => prizes.map(p => pickBackRankForPrize(p.grade, p.rarity)),
    [prizes]
  );

  const boosterBackImages = useMemo(
    () => prizeBackLevels.map(level => getRankCardBackImage(level, level)),
    [prizeBackLevels]
  );

  const allRevealed = useMemo(() => {
    if (!prizes.length) return false;
    return prizes.every(p => revealedIds.includes(p.id));
  }, [prizes, revealedIds]);

  useEffect(() => {
    if (!isOpen) return;
    setPhase('pack');
    // setShowBooster(true);
    setRevealedIds([]);
    setShakingIds([]);
  }, [isOpen, prizes]);

  const handleReveal = (id: string) => {
    if (!revealedIds.includes(id)) {
      setRevealedIds(prev => [...prev, id]);
    }
  };

  const handleCardClick = (id: string, backRank: 'SSR' | 'SR' | 'R' | 'N') => {
    if (revealedIds.includes(id)) return;
    if (backRank === 'SSR') {
      if (!shakingIds.includes(id)) {
        setShakingIds(prev => [...prev, id]);
      }
      return;
    }
    handleReveal(id);
  };

  const handleRevealAll = () => {
    setRevealedIds(prizes.map(p => p.id));
  };

  const [isLoading, setIsLoading] = useState(true);

  // Preload images or wait a small delay to simulate loading
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 1500); // Simulate resource loading time
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[1200] bg-black flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-white">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full" />
          </motion.div>
          <p className="text-white font-bold tracking-widest text-lg animate-pulse">
            資源下載中...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1200] bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Global Background */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/gacha_bg.png"
          alt=""
          fill
          className="object-cover filter brightness-[0.3] blur-[10px]"
          unoptimized
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      <AnimatePresence mode="wait">
        {phase === 'pack' && (
          <motion.div
            key="pack"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex items-center justify-center"
          >
            <BoosterPackOpenEffect
              cardBackImages={boosterBackImages}
              onComplete={() => {
                // setShowBooster(false); // Removed unused state setter
                setPhase('spread');
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {phase === 'spread' && (
          <motion.div
                key="spread"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -40 }}
                transition={{ duration: 0.4 }}
                className="relative w-full flex flex-col gap-4 pb-24"
              >
                <div className="flex flex-col items-center gap-1">
                  <p className="text-xs font-black text-neutral-300 tracking-[0.3em] uppercase">
                    card revealed
                  </p>
                  <p className="text-base font-black text-white">
                    共抽到 {prizes.length} 張卡牌
                  </p>
                </div>

                <div
                  className={cn(
                    'grid gap-2',
                    prizes.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'
                  )}
                >
                  {prizes.map((prize, index) => {
                    const isRevealed = revealedIds.includes(prize.id);
                    const isPremium = isPremiumCard(prize.grade, prize.rarity);
                    const isShiny = isShinyCard(prize.grade, prize.rarity);
                    const isSSR = isSSRFace(prize.grade, prize.rarity);
                    const backRank = prizeBackLevels[index];
                    const isSSRBack = backRank === 'SSR';
                    const isShaking = shakingIds.includes(prize.id);

                    return (
                      <button
                        key={prize.id}
                        type="button"
                        onClick={() => handleCardClick(prize.id, backRank)}
                        className="relative aspect-[650/930] rounded-xl bg-transparent focus:outline-none"
                      >
                        <motion.div
                          className="w-full h-full rounded-xl"
                          initial={{ scale: 0.96, opacity: 0 }}
                          animate={
                            isRevealed
                              ? isPremium
                                ? {
                                    opacity: 1,
                                    scale: [0.96, 1.08, 0.98, 1.12, 1],
                                    rotate: [0, -2, 2, -1.5, 0],
                                    y: [0, -2, 1, -4, 0],
                                  }
                                : {
                                    opacity: 1,
                                    scale: [0.96, 1.02, 0.99, 1],
                                    y: [0, -1, 0.5, 0],
                                  }
                              : isSSRBack && isShaking
                                ? {
                                    opacity: 1,
                                    scale: [0.98, 1.04, 0.99],
                                    rotate: [0, -3, 3, -2, 2, 0],
                                  }
                                : { scale: 0.98, opacity: 1 }
                          }
                          transition={
                            isRevealed
                              ? isPremium
                                ? { duration: 0.6, ease: 'easeOut' }
                                : { duration: 0.4, ease: 'easeOut' }
                              : isSSRBack && isShaking
                                ? { duration: 0.35, ease: 'easeInOut' }
                                : { duration: 0.25 }
                          }
                          onAnimationComplete={() => {
                            if (isSSRBack && isShaking && !isRevealed) {
                              setShakingIds(prev => prev.filter(x => x !== prize.id));
                              handleReveal(prize.id);
                            }
                          }}
                        >
                          {!isRevealed ? (
                            <div className="w-full h-full rounded-xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.8)] border border-neutral-700/80 bg-black">
                              <div className="relative w-full h-full">
                                <Image
                                  src={getRankCardBackImage(backRank, backRank)}
                                  alt="card back"
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                            </div>
                          ) : (
                            <motion.div
                              className="w-full h-full rounded-xl overflow-hidden shadow-[0_18px_40px_rgba(0,0,0,0.9)] bg-black"
                              animate={isSSR ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                              transition={
                                isSSR
                                  ? {
                                      duration: 1.1,
                                      repeat: Infinity,
                                      repeatType: 'reverse',
                                      ease: 'easeInOut',
                                    }
                                  : undefined
                              }
                            >
                              <div className="relative w-full h-full">
                                {isSSR && (
                                  <motion.div
                                    className="pointer-events-none absolute inset-[-18%] rounded-[32px] bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.9),rgba(24,16,0,0)_60%)] blur-xl"
                                    initial={{ opacity: 0.7 }}
                                    animate={{ opacity: [0.5, 1, 0.5] }}
                                    transition={{
                                      duration: 1.4,
                                      repeat: Infinity,
                                      repeatType: 'reverse',
                                      ease: 'easeInOut',
                                    }}
                                  />
                                )}
                                <div className="relative w-full h-full">
                                  <Image
                                    src={getRankCardImage(prize.grade, prize.rarity)}
                                    alt={prize.name}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                  />
                                  {isShiny && (
                                    <motion.div
                                      className="pointer-events-none absolute inset-[-10%] bg-gradient-to-b from-white/70 via-white/0 to-transparent mix-blend-screen"
                                      initial={{ opacity: 0, y: '-120%' }}
                                      animate={{ opacity: [0, 1, 0], y: ['-120%', '120%'] }}
                                      transition={{ duration: 0.7, ease: 'easeInOut' }}
                                    />
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </motion.div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
      <AnimatePresence>
        {phase === 'spread' && (
          <motion.div 
            className="absolute bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 z-[1300] pb-[env(safe-area-inset-bottom)]"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
          >
            <div className="h-16 px-4 flex items-center justify-center w-full">
              {!allRevealed ? (
                <Button
                  onClick={handleRevealAll}
                  size="lg"
                  className="w-full md:w-[320px] h-[44px] md:h-[52px] rounded-xl text-base md:text-lg font-black bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-xl shadow-blue-500/20"
                >
                  全部開啟
                </Button>
              ) : (
                <div className="flex gap-3 w-full max-w-[360px]">
                  <Button
                    onClick={onGoToWarehouse}
                    size="lg"
                    className="flex-1 h-[44px] md:h-[52px] rounded-xl text-base md:text-lg font-black bg-neutral-200 hover:bg-neutral-300 text-neutral-700 shadow-sm whitespace-nowrap"
                  >
                    前往倉庫
                  </Button>
                  <Button
                    onClick={onContinue}
                    size="lg"
                    className="flex-1 h-[44px] md:h-[52px] rounded-xl text-base md:text-lg font-black bg-accent-red hover:bg-accent-red/90 text-white shadow-xl shadow-accent-red/20 whitespace-nowrap"
                  >
                    繼續開抽
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
