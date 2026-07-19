'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageButton } from '@/components/ui/ImageButton';

// ─── layout constants (750×932 design) ───────────────────────────────────────
const BOX_W    = 149;   // box width  in 750-px canvas
const BOX_H    = 149;   // box height in 750-px canvas (square)
const BOX_STEP = 127;   // = BOX_W - 22 (22px overlap)
const ROW0_TOP = 148;
const ROW1_TOP = 356;
const COL0_LEFT = 46;

// Hole: (120, 570), svg 510×167
const HOLE_LEFT   = 120;
const HOLE_TOP    = 570;
const HOLE_W      = 510;
const HOLE_H      = 167;
const HOLE_CTR_X  = HOLE_LEFT + HOLE_W / 2;   // 375
const HOLE_CTR_Y  = HOLE_TOP  + HOLE_H / 2;   // 653.5

// Container rendered at CSS width=375, height=375*(932/750)≈466.5
const CSS_W = 375;
const CSS_H = CSS_W * (932 / 750);
const TO_CSS = CSS_W / 750;   // 0.5

// Pre-compute slot positions (% of container) + fly offsets (CSS px)
const SLOTS = Array.from({ length: 10 }, (_, i) => {
  const row  = Math.floor(i / 5);
  const col  = i % 5;
  const l750 = COL0_LEFT + col * BOX_STEP;
  const t750 = row === 0 ? ROW0_TOP : ROW1_TOP;

  const cssLeft   = l750 * TO_CSS;
  const cssTop    = t750 * (CSS_H / 932);
  const cssW      = BOX_W * TO_CSS;
  const cssCtrX   = cssLeft + cssW / 2;
  const cssCtrY   = cssTop  + cssW / 2;

  return {
    leftPct:   (l750 / 750) * 100,
    topPct:    (t750 / 932) * 100,
    widthPct:  (BOX_W / 750) * 100,
    heightPct: (BOX_H / 932) * 100,
    // pixel offset to bring box center to top edge of hole
    dx: HOLE_CTR_X * TO_CSS - cssCtrX,
    dy: (HOLE_TOP - 10) * (CSS_H / 932) - cssCtrY,
  };
});

// ─── types ───────────────────────────────────────────────────────────────────
export interface BlindboxMachineMode2Props {
  machineState: 'idle' | 'animating';
  drawCount: number;
  boxImageUrl?: string;
  remaining: number;
  onAnimationComplete?: () => void;
  onPush?: () => void;
  onPurchase?: () => void;
  onTrial?: () => void;
  isSoldOut?: boolean;
  onLoaded?: () => void;
}

// ─── component ───────────────────────────────────────────────────────────────
export function BlindboxMachineMode2({
  machineState,
  drawCount,
  boxImageUrl,
  remaining,
  onAnimationComplete,
  onPush,
  onPurchase,
  onTrial,
  isSoldOut,
  onLoaded,
}: BlindboxMachineMode2Props) {
  const boxSrc = boxImageUrl || '/images/blindbox/mode2/box.png';

  // slot state: 'present' | 'flying' | 'gone'
  const [slotState, setSlotState] = useState<('present' | 'flying' | 'gone')[]>(
    Array(10).fill('present'),
  );

  // hole drop: list of keys so multiple drops can queue
  const [holeDropKeys, setHoleDropKeys] = useState<number[]>([]);

  const prevMachineState = useRef<'idle' | 'animating'>('idle');
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reset shelf when returning to idle (modal closed)
  useEffect(() => {
    if (machineState === 'idle' && prevMachineState.current === 'animating') {
      setSlotState(Array(10).fill('present'));
      prevMachineState.current = 'idle';
    }
  }, [machineState]);

  // Trigger animation
  useEffect(() => {
    if (machineState !== 'animating' || prevMachineState.current === 'animating') return;
    prevMachineState.current = 'animating';

    // clear any stale timers
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];

    // pick random present slots
    const presentIdxs = slotState
      .map((s, i) => (s === 'present' ? i : -1))
      .filter(i => i >= 0);
    const count = Math.min(drawCount, presentIdxs.length, 10);
    const shuffled = [...presentIdxs].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    const STAGGER     = 180;  // ms between boxes
    const FLY_MS      = 850;  // fly from shelf to hole
    const DROP_MS     = 500;  // fall through hole

    selected.forEach((slotIdx, i) => {
      // start flying
      const t1 = setTimeout(() => {
        setSlotState(prev => {
          const next = [...prev];
          next[slotIdx] = 'flying';
          return next;
        });
      }, i * STAGGER);

      // arrive at hole → hole drop
      const t2 = setTimeout(() => {
        setSlotState(prev => {
          const next = [...prev];
          next[slotIdx] = 'gone';
          return next;
        });
        const dropKey = Date.now() + i;
        setHoleDropKeys(prev => [...prev, dropKey]);
        const t3 = setTimeout(
          () => setHoleDropKeys(prev => prev.filter(k => k !== dropKey)),
          DROP_MS + 100,
        );
        timerRefs.current.push(t3);
      }, i * STAGGER + FLY_MS);

      timerRefs.current.push(t1, t2);
    });

    // 2 s after last box exits → callback
    const totalWait = (count - 1) * STAGGER + FLY_MS + DROP_MS + 2000;
    const tDone = setTimeout(() => {
      onAnimationComplete?.();
    }, totalWait);
    timerRefs.current.push(tDone);

    return () => {
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineState]);

  return (
    <div className="relative w-full h-full" style={{ touchAction: 'pan-y' }}>

      {/* ── Background ── */}
      <div className="absolute inset-0">
        <Image
          src="/images/blindbox/mode2/main.png"
          alt="blindbox machine"
          fill
          className="object-fill"
          unoptimized
          onLoad={() => onLoaded?.()}
        />
      </div>

      {/* ── Shelf boxes ── */}
      {SLOTS.map((slot, i) => {
        const s = slotState[i];
        if (s === 'gone') return null;
        return (
          <motion.div
            key={i}
            className="absolute"
            style={{
              left:   `${slot.leftPct}%`,
              top:    `${slot.topPct}%`,
              width:  `${slot.widthPct}%`,
              height: `${slot.heightPct}%`,
              zIndex: s === 'flying' ? 15 : 5,
            }}
            animate={
              s === 'flying'
                ? {
                    scale:   [1, 1.45, 1.45, 0.85],
                    x:       [0, 0,    slot.dx * 0.4, slot.dx],
                    y:       [0, -18,  slot.dy * 0.35, slot.dy],
                    rotate:  [0, 6,    -12,  20],
                    opacity: [1, 1,    1,    1],
                  }
                : { scale: 1, x: 0, y: 0, rotate: 0, opacity: 1 }
            }
            transition={{ duration: 0.85, ease: 'easeInOut' }}
          >
            <Image
              src={boxSrc}
              alt="blindbox"
              fill
              className="object-contain"
              unoptimized
            />
          </motion.div>
        );
      })}

      {/* ── hole_bg overlay (z above flying boxes, hides overflow) ── */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          top:    `${(HOLE_TOP - 50) / 932 * 100}%`,
          zIndex: 12,
        }}
      >
        <Image
          src="/images/blindbox/mode2/hole_bg.png"
          alt=""
          fill
          className="object-fill"
          unoptimized
        />
      </div>

      {/* ── Hole drop area (clipped by hole.svg) ── */}
      <div
        className="absolute overflow-hidden"
        style={{
          left:   `${(HOLE_LEFT / 750) * 100}%`,
          top:    `${(HOLE_TOP  / 932) * 100}%`,
          width:  `${(HOLE_W   / 750) * 100}%`,
          height: `${(HOLE_H   / 932) * 100}%`,
          zIndex: 13,
          WebkitMaskImage: 'url(/images/blindbox/mode2/hole.svg)',
          WebkitMaskSize:  '100% 100%',
          maskImage:       'url(/images/blindbox/mode2/hole.svg)',
          maskSize:        '100% 100%',
        }}
      >
        <AnimatePresence>
          {holeDropKeys.map(key => (
            <motion.div
              key={key}
              initial={{ y: '-130%', rotate: -15, opacity: 1 }}
              animate={{ y:  '90%',  rotate:  25, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeIn' }}
              className="absolute inset-0 flex items-start justify-center"
            >
              <div className="relative w-[60%] aspect-square mt-2">
                <Image src={boxSrc} alt="box" fill className="object-contain" unoptimized />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Buttons ── */}
      <ImageButton
        src="/images/blindbox/mode2/btn2.png"
        alt="換一盒"
        text="換一盒"
        className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '5.33%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
        onClick={() => onPush?.()}
      />
      <ImageButton
        src="/images/blindbox/mode2/btn1.png"
        alt="立即開盒"
        text="立即開盒"
        className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '31.73%', top: '84.5%', width: '36.53%', height: '11.2%', zIndex: 20 }}
        onClick={() => onPurchase?.()}
      />
      <ImageButton
        src="/images/blindbox/mode2/btn2.png"
        alt="試試看"
        text="試試看"
        className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '69.6%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
        onClick={() => onTrial?.()}
      />

      {/* ── Sold out overlay ── */}
      {isSoldOut && (
        <div
          className="pointer-events-none absolute inset-0 flex justify-center items-start pt-16 bg-black/60"
          style={{ zIndex: 25 }}
        >
          <div className="inline-flex h-8 items-center px-4 rounded-full bg-black/90 shadow-lg">
            <span className="text-[14px] font-black tracking-widest text-yellow-300">
              該商品已完抽
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
