'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import Image from 'next/image';
import type { Prize } from '@/components/GachaMachine';
import BoosterPackOpenEffect from './BoosterPackOpenEffect';

type CardDrawAnimationProps = {
  isOpen: boolean;
  prizes: Prize[];
  onGoToWarehouse: () => void;
  onContinue: () => void;
  packImage?: string;
};

type Phase = 'pack' | 'swipe';

function getCardImage(prize: Prize) {
  if (prize.image_url) return prize.image_url;
  const raw = (prize.grade || prize.rarity || '').toUpperCase();
  if (raw.includes('SSR') || raw.includes('超稀有')) return '/images/card/00001.png';
  if (raw.includes('SR')) return '/images/card/00002.png';
  if (raw.includes('R') || raw.includes('稀有')) return '/images/card/00003.png';
  return '/images/card/00004.png';
}


function getRarity(prize: Prize) {
  const raw = (prize.grade || prize.rarity || '').toUpperCase();
  if (raw.includes('SSR') || raw.includes('超稀有')) return 'SSR';
  if (raw.includes('SR')) return 'SR';
  if (raw.includes('R') || raw.includes('稀有')) return 'R';
  return 'N';
}

const RARITY_STYLE = {
  SSR: { label: 'SSR', bg: '#FFD700', text: '#000', glow: 'rgba(255,215,0,0.5)' },
  SR:  { label: 'SR',  bg: '#C084FC', text: '#fff', glow: 'rgba(192,132,252,0.45)' },
  R:   { label: 'R',   bg: '#60A5FA', text: '#fff', glow: 'rgba(96,165,250,0.4)' },
  N:   { label: 'N',   bg: '#475569', text: '#fff', glow: 'rgba(71,85,105,0.3)' },
};

// Card width in px — stack cards behind scale down from this
const CARD_W = 230;
const CARD_RATIO = 63 / 88; // standard card aspect ratio (width / height)
const CARD_H = CARD_W / CARD_RATIO;

// ── Draggable top card ────────────────────────────────────────────────────────
interface TopCardProps {
  prize: Prize;
  current: number;
  total: number;
  onSwiped: () => void;
  showHint: boolean;
}

function TopCard({ prize, current, total, onSwiped, showHint }: TopCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-14, 0, 14]);
  const rarity = getRarity(prize);
  const rs = RARITY_STYLE[rarity];
  const isSSR = rarity === 'SSR';

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      if (info.offset.x > 65 || info.velocity.x > 240) {
        animate(x, 900, { duration: 0.22, ease: [0.2, 0, 0.4, 1], onComplete: onSwiped });
      }
      // else: dragConstraints + dragTransition handle snap-back automatically
    },
    [x, onSwiped],
  );

  return (
    <motion.div
      key={`top-${current}`}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.15, right: 0.9 }}
      dragTransition={{ bounceStiffness: 650, bounceDamping: 38 }}
      style={{ x, rotate, position: 'absolute', zIndex: 12, touchAction: 'none', userSelect: 'none' }}
      onDragEnd={handleDragEnd}
      initial={{ scale: 0.88, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="cursor-grab active:cursor-grabbing"
    >
      {/* Card */}
      <div
        style={{
          width: CARD_W,
          height: CARD_H,
          borderRadius: 14,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: isSSR
            ? `0 0 50px ${rs.glow}, 0 0 20px ${rs.glow}, 0 24px 60px rgba(0,0,0,0.85)`
            : `0 0 24px ${rs.glow}, 0 20px 50px rgba(0,0,0,0.8)`,
        }}
      >
        <Image src={getCardImage(prize)} alt={prize.name} fill className="object-cover" unoptimized priority />

        {/* SSR pulse overlay */}
        {isSSR && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), transparent 60%)' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Rarity badge */}
        <div
          className="absolute top-2 right-2 px-2 py-[2px] rounded-full text-[11px] font-black"
          style={{ background: rs.bg, color: rs.text, boxShadow: `0 0 10px ${rs.glow}` }}
        >
          {rs.label}
        </div>
      </div>

      {/* Card name */}
      <div className="mt-3 text-center">
        <p className="text-white text-sm font-bold drop-shadow-md px-2 line-clamp-1">{prize.name}</p>
      </div>

      {/* Counter */}
      <div className="mt-1 text-center">
        <span className="text-white/40 text-xs tracking-widest">{current + 1} / {total}</span>
      </div>

      {/* Swipe hint (first 2 cards) */}
      {showHint && (
        <motion.div
          className="absolute -right-10 top-1/2 -translate-y-1/2 pointer-events-none"
          animate={{ x: [0, 8, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 14h16M16 8l6 6-6 6" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CardDrawAnimation({
  isOpen,
  prizes,
  onGoToWarehouse,
  onContinue,
  packImage,
}: CardDrawAnimationProps) {
  const [phase, setPhase] = useState<Phase>('pack');
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);


  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setPhase('pack');
    setSwipeIndex(0);
    setIsLoading(true);
  }, [isOpen, prizes]);

  // 1.2s loading
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(t);
  }, [isOpen]);

  const handleSwiped = useCallback(() => {
    const next = swipeIndex + 1;
    if (next >= prizes.length) {
      onGoToWarehouse();
    } else {
      setSwipeIndex(next);
    }
  }, [swipeIndex, prizes.length, onGoToWarehouse]);

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[1200] bg-black flex flex-col items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full" />
        </motion.div>
        <p className="text-white font-bold tracking-widest text-lg animate-pulse mt-4">資源下載中...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1200] bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/gacha_bg.png"
          alt=""
          fill
          className="object-cover brightness-[0.28] blur-[10px]"
          unoptimized
        />
        <div className="absolute inset-0 bg-black/45" />
      </div>

      <AnimatePresence mode="wait">
        {/* ── Phase 1: Pack opening ── */}
        {phase === 'pack' && (
          <motion.div
            key="pack"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex items-center justify-center"
          >
            <BoosterPackOpenEffect
              packImage={packImage}
              onComplete={() => setPhase('swipe')}
            />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-end">
              <button
                onClick={onGoToWarehouse}
                className="shrink-0 px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em] active:scale-95 transition-transform"
              >
                SKIP
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Phase 2: Swipe reveal ── */}
        {phase === 'swipe' && prizes.length > 0 && (
          <motion.div
            key="swipe"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full h-full flex items-center justify-center"
          >
            {/* Card stack container */}
            <div
              style={{ position: 'relative', width: CARD_W, height: CARD_H + 60 }}
              className="flex items-center justify-center"
            >
              {/* Cards behind top (static, depth 2 then 1) */}
              {[2, 1].map(depth => {
                const idx = swipeIndex + depth;
                if (idx >= prizes.length) return null;
                return (
                  <motion.div
                    key={idx}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: CARD_W,
                      height: CARD_H,
                      borderRadius: 14,
                      overflow: 'hidden',
                      zIndex: 12 - depth,
                      pointerEvents: 'none',
                    }}
                    animate={{
                      y: depth * 10,
                      scale: 1 - depth * 0.06,
                      opacity: 1 - depth * 0.18,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  >
                    <Image
                      src={getCardImage(prizes[idx])}
                      alt=""
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {/* Darkening overlay for depth */}
                    <div
                      className="absolute inset-0"
                      style={{ background: `rgba(0,0,0,${depth * 0.22})` }}
                    />
                  </motion.div>
                );
              })}

              {/* Top draggable card */}
              <AnimatePresence>
                <TopCard
                  key={swipeIndex}
                  prize={prizes[swipeIndex]}
                  current={swipeIndex}
                  total={prizes.length}
                  onSwiped={handleSwiped}
                  showHint={swipeIndex < 2}
                />
              </AnimatePresence>
            </div>

            {/* SKIP button — same style as 自製賞 */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-end">
              <button
                onClick={onGoToWarehouse}
                className="shrink-0 px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em] active:scale-95 transition-transform"
              >
                SKIP
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
