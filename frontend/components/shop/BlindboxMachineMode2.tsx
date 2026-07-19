'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ImageButton } from '@/components/ui/ImageButton';

// ─── layout (750×932 design) ─────────────────────────────────────────────────
const BOX_DESIGN_W   = 100;
const BOX_STEP       = 128;   // 100px wide + 28px gap
const ROW0_TOP       = 166;   // upper shelf front row — y in design units
const ROW1_TOP       = 373;   // lower shelf front row
const BACK_CSS_PX    = 12;    // CSS px: back boxes shift up (depth illusion)
const BACK_CSS_X     = 4;     // CSS px: back boxes shift right (depth illusion)
const BACK_SCALE     = 0.90;  // back boxes appear slightly smaller (further back)
const COL0_LEFT      = 71;

const HOLE_LEFT = 120;
const HOLE_TOP  = 570;
const HOLE_W    = 510;
const HOLE_H    = 167;

const CSS_W = 375;
const CSS_H = CSS_W * (932 / 750);   // ≈ 466 px
const TO_CSS = CSS_W / 750;          // 0.5

const BOX_CSS_W     = BOX_DESIGN_W * TO_CSS;   // 50 px
const BOX_CSS_H_EST = 55;
const BOX_R = 20;   // collision radius (smaller → 5 boxes fit across hole width)

// Visual hole bounds
const HOLE_L = HOLE_LEFT * TO_CSS;
const HOLE_R = HOLE_L + HOLE_W * TO_CSS;
const HOLE_T = (HOLE_TOP / 932) * CSS_H;
const HOLE_B = HOLE_T + (HOLE_H / 932) * CSS_H;

// Physics wall bounds — 10px outside the visual hole mask
const PHYS_L = HOLE_L - 10;
const PHYS_R = HOLE_R + 10;

// Two depth layers in the retrieval slot.
// depth=0 (front): z=10, floor at/below hole bottom.
// depth=1 (back):  z=8,  floor slightly higher (appears further back).
const FRONT_FLOOR = HOLE_B + BOX_R * 0.5;
const BACK_FLOOR  = HOLE_B - BOX_R * 1.2;

// 20 slots total: upper shelf (0-9) + lower shelf (10-19).
// Within each shelf: front (depth=0, i%10 < 5) + back (depth=1, i%10 >= 5).
// Back boxes sit BACK_CSS_PX higher than front (depth illusion).
const SLOTS = Array.from({ length: 20 }, (_, i) => {
  const shelf  = Math.floor(i / 10) as 0 | 1;  // 0=upper, 1=lower
  const within = i % 10;
  const depth  = (Math.floor(within / 5)) as 0 | 1;  // 0=front, 1=back
  const col    = within % 5;
  const t750   = shelf === 0 ? ROW0_TOP : ROW1_TOP;
  const leftPx = (COL0_LEFT + col * BOX_STEP) * TO_CSS + (depth === 1 ? BACK_CSS_X : 0);
  const topPx  = (t750 / 932) * CSS_H - (depth === 1 ? BACK_CSS_PX : 0);
  return {
    leftPx,
    topPx,
    centerX: leftPx + BOX_CSS_W / 2,
    centerY: topPx  + BOX_CSS_H_EST / 2,
    depth,
  };
});

function rand(min: number, max: number) { return min + Math.random() * (max - min); }

// ─── physics particle ─────────────────────────────────────────────────────────
interface PhysBox {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  angle: number; av: number;
  depth: 0 | 1;   // 0=front row, 1=back row
}

// ─── props ────────────────────────────────────────────────────────────────────
export interface BlindboxMachineMode2Props {
  machineState: 'idle' | 'animating';
  drawCount:    number;
  boxImageUrl?: string;
  remaining:    number;
  onAnimationComplete?: () => void;
  onPush?:      () => void;
  onPurchase?:  () => void;
  onTrial?:     () => void;
  isSoldOut?:   boolean;
  onLoaded?:    () => void;
}

// ─── component ────────────────────────────────────────────────────────────────
export function BlindboxMachineMode2({
  machineState,
  drawCount,
  boxImageUrl,
  onAnimationComplete,
  onPush,
  onPurchase,
  onTrial,
  isSoldOut,
  onLoaded,
}: BlindboxMachineMode2Props) {
  const boxSrc = boxImageUrl || '/images/blindbox/mode2/box.png';

  const [slotState, setSlotState]   = useState<('present' | 'nudging' | 'gone')[]>(Array(20).fill('present'));
  const [physBoxes, setPhysBoxes]   = useState<PhysBox[]>([]);

  const physRef        = useRef<PhysBox[]>([]);
  const frameRef       = useRef<number | undefined>(undefined);
  const physActiveRef  = useRef(false);
  const doneCalledRef  = useRef(false);
  const prevMachineState = useRef<'idle' | 'animating'>('idle');
  const timerRefs      = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Physics loop ─────────────────────────────────────────────────────────
  const stopPhysics = useCallback(() => {
    physActiveRef.current = false;
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
  }, []);

  const startPhysicsLoop = useCallback((onSettled: () => void) => {
    if (physActiveRef.current) return;
    physActiveRef.current = true;

    const GRAVITY     = 1200;
    const BOX_RES     = 0.12;   // box-to-box: absorb most energy
    const FLOOR_RES   = 0.30;   // floor bounce: visible hop, not too high
    const FRICTION    = 0.975;
    const ANG_FRIC    = 0.84;   // damp spin quickly so boxes don't keep rotating
    const SETTLE_V    = 1.2;

    let lastTime: number | null = null;
    let settledCalled = false;

    const step = (time: number) => {
      if (lastTime === null) lastTime = time;
      const dt = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;

      const cur = physRef.current.map(b => ({ ...b }));

      for (const b of cur) {
        b.vy += GRAVITY * dt;
        b.vx *= FRICTION; b.vy *= FRICTION;
        b.x  += b.vx * dt; b.y += b.vy * dt;
        b.angle += b.av * dt; b.av *= ANG_FRIC;

        // Depth-specific floor (front row sits lower, back row sits higher)
        const floorY = b.depth === 0 ? FRONT_FLOOR : BACK_FLOOR;
        if (b.y + BOX_R > floorY) {
          b.y  = floorY - BOX_R;
          b.vy = -Math.abs(b.vy) * FLOOR_RES;   // visible bounce, not high
          b.vx *= 0.85;
          b.av  = b.av * 0.4 + rand(-0.5, 0.5);  // damp existing spin + small tipping nudge
        }

        // Side walls — only enforce inside hole zone
        if (b.y + BOX_R > HOLE_T) {
          if (b.x - BOX_R < PHYS_L) { b.x = PHYS_L + BOX_R; b.vx =  Math.abs(b.vx) * BOX_RES; }
          if (b.x + BOX_R > PHYS_R) { b.x = PHYS_R - BOX_R; b.vx = -Math.abs(b.vx) * BOX_RES; }
        }
      }

      // Pairwise collision — only same-depth boxes interact
      for (let i = 0; i < cur.length; i++) {
        for (let j = i + 1; j < cur.length; j++) {
          if (cur[i].depth !== cur[j].depth) continue;
          const a = cur[i], b = cur[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          const minD = BOX_R * 2;
          if (d2 === 0 || d2 >= minD * minD) continue;
          const d = Math.sqrt(d2), ov = minD - d;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * ov * 0.5; a.y -= ny * ov * 0.5;
          b.x += nx * ov * 0.5; b.y += ny * ov * 0.5;
          const [avx, avy] = [a.vx, a.vy];
          a.vx = b.vx * BOX_RES; a.vy = b.vy * BOX_RES;
          b.vx = avx  * BOX_RES; b.vy = avy  * BOX_RES;
          const spin = rand(-0.6, 0.6);
          a.av += spin; b.av -= spin;
        }
      }

      // Post-collision ceiling clamp: boxes that entered hole cannot be pushed back above it
      for (const b of cur) {
        if (b.y + BOX_R > HOLE_T && b.y - BOX_R < HOLE_T) {
          b.y = HOLE_T + BOX_R;
          if (b.vy < 0) { b.vy = 0; b.vx *= 0.5; }
        }
      }

      physRef.current = cur;
      setPhysBoxes([...cur]);

      if (!settledCalled && cur.length > 0 && cur.every(b => Math.abs(b.vx) < SETTLE_V && Math.abs(b.vy) < SETTLE_V && Math.abs(b.av) < 0.3)) {
        settledCalled = true;
        physActiveRef.current = false;
        onSettled();
        return;
      }

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => stopPhysics(), [stopPhysics]);

  // ── Reset on idle ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (machineState === 'idle' && prevMachineState.current === 'animating') {
      setSlotState(Array(20).fill('present'));
      stopPhysics();
      physRef.current = [];
      setPhysBoxes([]);
      doneCalledRef.current = false;
      prevMachineState.current = 'idle';
    }
  }, [machineState, stopPhysics]);

  // ── Trigger draw ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (machineState !== 'animating' || prevMachineState.current === 'animating') return;
    prevMachineState.current = 'animating';
    doneCalledRef.current = false;

    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];

    const presentIdxs = slotState
      .map((s, i) => (s === 'present' ? i : -1))
      .filter(i => i >= 0);
    const count = Math.min(drawCount, presentIdxs.length);
    // Front boxes (depth=0) dispense before back boxes (depth=1), like a real vending machine
    const frontIdxs = presentIdxs.filter(i => SLOTS[i].depth === 0).sort(() => Math.random() - 0.5);
    const backIdxs  = presentIdxs.filter(i => SLOTS[i].depth === 1).sort(() => Math.random() - 0.5);
    const selected  = [...frontIdxs, ...backIdxs].slice(0, count);

    // Companion back boxes: for each selected front box, the back box at (idx+5) nudges
    // forward WITH it but stays on the shelf (returns to present after the drop).
    const companions = selected
      .filter(i => SLOTS[i].depth === 0)
      .map(i => i + 5)
      .filter(i => i < 20 && slotState[i] === 'present');

    // Phase 1: nudge selected + companions forward
    setSlotState(prev => {
      const n = [...prev];
      selected.forEach(idx    => { n[idx] = 'nudging'; });
      companions.forEach(idx  => { n[idx] = 'nudging'; });
      return n;
    });

    // Phase 2: physics drop after 1s — selected fall, companions return to shelf
    const tDrop = setTimeout(() => {
      setSlotState(prev => {
        const n = [...prev];
        selected.forEach(idx => { n[idx] = 'gone'; });
        // companions stay 'nudging' (at front-row position) until idle resets everything
        return n;
      });

      // Boxes spawn at shelf positions and physically fall into the hole.
      // depth comes from the slot itself (front/back row).
      const newBoxes: PhysBox[] = selected.map((slotIdx, i) => ({
        id:    Date.now() + i,
        x:     SLOTS[slotIdx].centerX,
        y:     SLOTS[slotIdx].centerY,
        vx:    rand(-20, 20),
        vy:    rand(40, 80),
        angle: 0,
        av:    rand(-0.08, 0.08),
        depth: SLOTS[slotIdx].depth,
      }));

      physRef.current = newBoxes;
      setPhysBoxes(newBoxes);

      const callDone = () => {
        if (doneCalledRef.current) return;
        doneCalledRef.current = true;
        onAnimationComplete?.();
      };

      // Physics settle detection just stops the rAF loop; timing is driven by fixed timer.
      startPhysicsLoop(() => {});
      // Boxes reach hole in ~0.4s; fire popup ~1s after that → 1500ms total from drop.
      const tSafe = setTimeout(callDone, 1500);
      timerRefs.current.push(tSafe);
    }, 1000);

    timerRefs.current.push(tDrop);

    return () => { timerRefs.current.forEach(clearTimeout); timerRefs.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineState]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full" style={{ touchAction: 'pan-y' }}>

      {/* Background */}
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

      {/* Shelf boxes — back row (depth=1) rendered first so front (depth=0) appears on top.
          Back boxes: scale BACK_SCALE, shifted up BACK_CSS_PX, z=4.
          Front boxes: scale 1.0, z=5. */}
      {[1, 0].flatMap(renderDepth =>
        SLOTS.map((slot, i) => {
          if (slot.depth !== renderDepth) return null;
          const s = slotState[i];
          if (s === 'gone') return null;
          const isBack    = renderDepth === 1;
          const baseScale = isBack ? BACK_SCALE : 1.0;
          return (
            <motion.div
              key={i}
              style={{
                position:        'absolute',
                left:            slot.leftPx,
                top:             slot.topPx,
                width:           BOX_CSS_W,
                zIndex:          isBack ? 4 : 5,
                transformOrigin: 'bottom center',
              }}
              animate={
                s === 'nudging'
                  // front boxes nudge 16px forward; back boxes slide + scale up to front-row original size
                  ? { y: isBack ? BACK_CSS_PX : 16, x: isBack ? -BACK_CSS_X : 0, scale: isBack ? 1.0 : 1.02 }
                  : { y: 0, x: 0, scale: baseScale }
              }
              transition={
                s === 'nudging'
                  ? { duration: 1.0, ease: 'easeOut' }
                  : { duration: 0.3, ease: 'easeOut' }
              }
            >
              <Image
                src={boxSrc}
                alt="blindbox"
                width={BOX_CSS_W}
                height={BOX_CSS_H_EST}
                style={{ width: '100%', height: 'auto', display: 'block' }}
                unoptimized
              />
            </motion.div>
          );
        })
      )}

      {/* Physics boxes — fall from shelf through machine into hole.
          z=8 (back row) and z=10 (front row): both below hole_bg z=12,
          visible through the transparent oval in hole_bg. */}
      {physBoxes.map(b => (
        <div
          key={b.id}
          style={{
            position:   'absolute',
            left:       b.x - BOX_CSS_W / 2,
            top:        b.y - BOX_CSS_H_EST / 2,
            width:      BOX_CSS_W,
            zIndex:     b.depth === 0 ? 10 : 8,
            transform:  `rotate(${b.angle}rad)${b.depth === 1 ? ' scale(0.9)' : ''}`,
            willChange: 'transform',
          }}
        >
          <Image
            src={boxSrc}
            alt="box"
            width={BOX_CSS_W}
            height={BOX_CSS_H_EST}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            unoptimized
          />
        </div>
      ))}

      {/* hole_bg (z=12): full-size overlay same as main.png.
          Opaque everywhere except the transparent oval — reveals physics boxes below. */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 12 }}>
        <Image
          src="/images/blindbox/mode2/hole_bg.png"
          alt=""
          fill
          className="object-fill"
          unoptimized
        />
      </div>

      {/* Buttons (z=20) */}
      <ImageButton
        src="/images/blindbox/mode2/btn2.png" alt="換一盒" text="換一盒"
        className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '5.33%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
        onClick={() => onPush?.()} />
      <ImageButton
        src="/images/blindbox/mode2/btn1.png" alt="立即開盒" text="立即開盒"
        className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '31.73%', top: '84.5%', width: '36.53%', height: '11.2%', zIndex: 20 }}
        onClick={() => onPurchase?.()} />
      <ImageButton
        src="/images/blindbox/mode2/btn2.png" alt="試試看" text="試試看"
        className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '69.6%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
        onClick={() => onTrial?.()} />

      {isSoldOut && (
        <div
          className="pointer-events-none absolute inset-0 flex justify-center items-start pt-16 bg-black/60"
          style={{ zIndex: 25 }}
        >
          <div className="inline-flex h-8 items-center px-4 rounded-full bg-black/90 shadow-lg">
            <span className="text-[14px] font-black tracking-widest text-yellow-300">該商品已完抽</span>
          </div>
        </div>
      )}
    </div>
  );
}
