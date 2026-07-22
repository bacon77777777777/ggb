'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

// Scene design coords at DW=393 base (same scene as charge screen)
const DW = 393;
const CX = 94;   // card left (centered for CW=205)
const CY = 150;  // card top
const CW = 205;  // card width
const CH = 286;  // card height (≈ CW * 88/63)
const CR = -2;   // card rotation degrees
const H1_TOP = 230;  // hand1 top
const H1_W = 490;    // hand1 width

// ── Draggable top card ────────────────────────────────────────────────────────
interface TopCardProps {
  prize: Prize;
  current: number;
  onSwiped: () => void;
  s: number;
}

function TopCard({ prize, current, onSwiped, s }: TopCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [CR - 12, CR, CR + 12]);
  const rarity = getRarity(prize);
  const rs = RARITY_STYLE[rarity];
  const isSSR = rarity === 'SSR';
  // Track drag distance to distinguish real click from drag-end
  const dragDeltaRef = useRef(0);

  const cardW = CW * s;
  const cardH = CH * s;

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      dragDeltaRef.current = Math.abs(info.offset.x);
      if (info.offset.x > 35 || info.velocity.x > 80) {
        animate(x, 900, { duration: 0.22, ease: [0.2, 0, 0.4, 1], onComplete: onSwiped });
      }
    },
    [x, onSwiped],
  );

  const handleClick = useCallback(() => {
    // Ignore if this click was actually the end of a drag
    if (dragDeltaRef.current > 10) {
      dragDeltaRef.current = 0;
      return;
    }
    animate(x, 900, { duration: 0.22, ease: [0.2, 0, 0.4, 1], onComplete: onSwiped });
  }, [x, onSwiped]);

  return (
    <motion.div
      key={`top-${current}`}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.03, right: 1.1 }}
      dragTransition={{ bounceStiffness: 450, bounceDamping: 24 }}
      style={{
        x,
        rotate,
        position: 'absolute',
        top: CY * s,
        left: CX * s,
        zIndex: 12,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      draggable={false}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="cursor-pointer"
    >
      <div
        style={{
          width: cardW,
          height: cardH,
          borderRadius: 14 * s,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: isSSR
            ? `0 0 12px ${rs.glow}, 0 0 5px ${rs.glow}, 0 6px 15px rgba(0,0,0,0.85)`
            : `0 0 6px ${rs.glow}, 0 5px 12px rgba(0,0,0,0.8)`,
        }}
      >
        <Image src={getCardImage(prize)} alt={prize.name} fill className="object-cover" unoptimized priority />

        {isSSR && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), transparent 60%)' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

      </div>

    </motion.div>
  );
}

// ── IP character cycling loader ───────────────────────────────────────────────
const LOADER_CHARS = [
  '/loading/1.svg','/loading/2.svg','/loading/3.svg','/loading/4.svg',
  '/loading/5.svg','/loading/6.svg','/loading/7.svg','/loading/8.svg',
];
function CardLoadingOverlay() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % LOADER_CHARS.length), 200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="fixed inset-0 z-[1200] bg-black flex flex-col items-center justify-center gap-4">
      <AnimatePresence mode="wait">
        <motion.img
          key={idx}
          src={LOADER_CHARS[idx]}
          width={80}
          height={90}
          alt=""
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.08, ease: 'easeOut' }}
        />
      </AnimatePresence>
      <p className="text-white/60 text-xs font-black tracking-widest">資源下載中</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CardDrawAnimation({
  isOpen,
  prizes,
  onGoToWarehouse,
  onContinue: _onContinue,
  packImage,
}: CardDrawAnimationProps) {
  const [phase, setPhase] = useState<Phase>('pack');
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Responsive scale for swipe scene
  const swipeSceneRef = useRef<HTMLDivElement>(null);
  const [sceneDimW, setSceneDimW] = useState(DW);
  const s = sceneDimW / DW;

  useEffect(() => {
    if (phase !== 'swipe') return;
    const el = swipeSceneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSceneDimW(el.clientWidth));
    ro.observe(el);
    setSceneDimW(el.clientWidth);
    return () => ro.disconnect();
  }, [phase]);

  useEffect(() => {
    if (!isOpen) return;
    setPhase('pack');
    setSwipeIndex(0);
    setIsLoading(true);
  }, [isOpen, prizes]);

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
    return <CardLoadingOverlay />;
  }

  return (
    <div className="fixed inset-0 z-[1200] bg-black flex flex-col items-center justify-center overflow-hidden">
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
            {/* wrapper 寬度與 BoosterPackOpenEffect / Phase 2 swipe 相同，SKIP 定位在此容器內 */}
            <div className="relative w-screen md:w-[calc(100dvh_*_393_/_852)] h-[100dvh] flex items-center justify-center">
              <BoosterPackOpenEffect
                packImage={packImage}
                onComplete={() => setPhase('swipe')}
              />
              <div className="absolute bottom-4 left-4 right-4 z-30 flex items-center justify-end">
                <button
                  onClick={onGoToWarehouse}
                  className="shrink-0 px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em] active:scale-95 transition-transform"
                >
                  SKIP
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Phase 2: Immersive card reveal ── */}
        {phase === 'swipe' && prizes.length > 0 && (
          <motion.div
            key="swipe"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex items-center justify-center"
          >
            {/* Scene container — same responsive sizing as charge screen */}
            <div
              ref={swipeSceneRef}
              className="relative overflow-hidden w-screen md:w-[calc(100dvh_*_393_/_852)] h-[100dvh]"
              style={{
                WebkitTouchCallout: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              } as React.CSSProperties}
              onContextMenu={e => e.preventDefault()}
            >
              {/* Background */}
              <Image
                src="/images/card/charge/bg.png"
                alt=""
                fill
                className="object-cover"
                unoptimized
                priority
                draggable={false}
                style={{ WebkitTouchCallout: 'none', userSelect: 'none', pointerEvents: 'none' } as React.CSSProperties}
                onContextMenu={e => e.preventDefault()}
              />

              {/* hand1 — open palm, behind cards */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/card/charge/hand1.png"
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: H1_TOP * s,
                  width: H1_W * s,
                  zIndex: 1,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />

              {/* Depth cards — fanned slightly behind top card */}
              {[2, 1].map(depth => {
                const idx = swipeIndex + depth;
                if (idx >= prizes.length) return null;
                return (
                  <motion.div
                    key={`depth-${idx}`}
                    style={{
                      position: 'absolute',
                      top: (CY + depth * 6) * s,
                      left: (CX - depth * 8) * s,
                      width: CW * s,
                      height: CH * s,
                      borderRadius: 14 * s,
                      overflow: 'hidden',
                      zIndex: 2 - depth,
                      pointerEvents: 'none',
                      rotate: CR + depth * 4,
                      scale: 1 - depth * 0.04,
                      opacity: 1 - depth * 0.22,
                    }}
                    animate={{
                      scale: 1 - depth * 0.04,
                      opacity: 1 - depth * 0.22,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  >
                    <Image
                      src={getCardImage(prizes[idx])}
                      alt=""
                      fill
                      className="object-cover"
                      unoptimized
                      draggable={false}
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: `rgba(0,0,0,${depth * 0.25})` }}
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
                  onSwiped={handleSwiped}
                  s={s}
                />
              </AnimatePresence>

              {/* hand2 — in front of card, same position as charge screen */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/card/charge/hand2.png"
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: H1_TOP * s,
                  width: H1_W * s,
                  zIndex: 20,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />

              {/* SKIP button */}
              <div className="absolute bottom-4 left-4 right-4 z-30 flex items-center justify-end">
                <button
                  onClick={onGoToWarehouse}
                  className="shrink-0 px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em] active:scale-95 transition-transform"
                >
                  SKIP
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
