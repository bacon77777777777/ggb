'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ImageButton } from '@/components/ui/ImageButton';

// ─── layout (750×932 design) ─────────────────────────────────────────────────
const BOX_DESIGN_W = 100;
const BOX_STEP     = 128;
const ROW0_TOP     = 166;
const ROW1_TOP     = 373;
const BACK_CSS_PX  = 12;
const BACK_CSS_X   = 0;
const BACK_SCALE   = 0.90;
const SHELF_SCALE  = 0.82; // shelf display scale — boxes slightly smaller than physics size
const COL0_LEFT    = 71;

const HOLE_LEFT = 120;
const HOLE_TOP  = 570;
const HOLE_W    = 510;
const HOLE_H    = 167;

const CSS_W = 375;
const CSS_H = CSS_W * (932 / 750);
const TO_CSS = CSS_W / 750;

// ─── 3D box dimensions (CSS px) ──────────────────────────────────────────────
const BOX_W = BOX_DESIGN_W * TO_CSS; // 50
const BOX_H = 61;
const BOX_D = 44;
const BOX_R = 20; // physics collision radius

const HOLE_L = HOLE_LEFT * TO_CSS;
const HOLE_R = HOLE_L + HOLE_W * TO_CSS;
const HOLE_T = (HOLE_TOP / 932) * CSS_H;
const HOLE_B = HOLE_T + (HOLE_H / 932) * CSS_H;
const PHYS_L = HOLE_L - 10;
const PHYS_R = HOLE_R + 10;
const FRONT_FLOOR = HOLE_B + BOX_R * 0.5;
const BACK_FLOOR  = HOLE_B - BOX_R * 1.2;

// ─── 6-face image paths ───────────────────────────────────────────────────────
const FACES = {
  front:  '/images/blindbox/mode3/box/4.png',
  back:   '/images/blindbox/mode3/box/6.png',
  left:   '/images/blindbox/mode3/box/3.png',
  right:  '/images/blindbox/mode3/box/5.png',
  top:    '/images/blindbox/mode3/box/2.png', // 交換：原 bottom 圖
  bottom: '/images/blindbox/mode3/box/1.png', // 交換：原 top 圖
} as const;

// Resting viewing angle when box is settled
const BASE_AX = -20; // deg — tilt back to show top face
const BASE_AY =   0; // deg

// ─── Slots ────────────────────────────────────────────────────────────────────
const SLOTS = Array.from({ length: 20 }, (_, i) => {
  const shelf  = Math.floor(i / 10) as 0 | 1;
  const within = i % 10;
  const depth  = (Math.floor(within / 5)) as 0 | 1;
  const col    = within % 5;
  const t750   = shelf === 0 ? ROW0_TOP : ROW1_TOP;
  const leftPx = (COL0_LEFT + col * BOX_STEP) * TO_CSS + (depth === 1 ? BACK_CSS_X : 0);
  const topPx  = (t750 / 932) * CSS_H - (depth === 1 ? BACK_CSS_PX : 0);
  return { leftPx, topPx, centerX: leftPx + BOX_W / 2, centerY: topPx + BOX_H / 2, depth, col };
});

// col 0 (左) → -10°, col 2 (中) → 0°, col 4 (右) → +10°
const colRotY = (col: number) => (col - 2) * 5;

function rand(min: number, max: number) { return min + Math.random() * (max - min); }

// ─── CSS 3D box (6 faces) ────────────────────────────────────────────────────
// Face coordinate math:
//   Front/Back : W×H, rotateY(0/180) translateZ(D/2)
//   Right/Left : D×H, centered at X=±W/2 via rotateY(±90) translateZ(W/2)
//   Top/Bottom : W×D, centered at Y=∓H/2 via rotateX(∓90) translateZ(H/2)
function Box3DFaces() {
  const hw = BOX_W / 2, hh = BOX_H / 2, hd = BOX_D / 2;
  // left/top offsets keep face-div center aligned with box-div center before rotation
  const sideLeft = (BOX_W - BOX_D) / 2;
  const capTop   = (BOX_H - BOX_D) / 2;

  const face = (
    key: string, src: string,
    transform: string,
    w: number, h: number, left: number, top: number,
  ) => (
    <div key={key} style={{
      position: 'absolute', left, top, width: w, height: h,
      transform, backfaceVisibility: 'hidden',
    }}>
      <Image src={src} alt="" fill sizes={`${w}px`}
        style={{ objectFit: 'fill' }} unoptimized />
    </div>
  );

  return (
    <div style={{ position: 'relative', width: BOX_W, height: BOX_H, transformStyle: 'preserve-3d' }}>
      {face('f', FACES.front,  `translateZ(${hd}px)`,                  BOX_W, BOX_H, 0,        0)}
      {face('k', FACES.back,   `rotateY(180deg) translateZ(${hd}px)`,  BOX_W, BOX_H, 0,        0)}
      {face('r', FACES.right,  `rotateY(90deg) translateZ(${hw}px)`,   BOX_D, BOX_H, sideLeft, 0)}
      {face('l', FACES.left,   `rotateY(-90deg) translateZ(${hw}px)`,  BOX_D, BOX_H, sideLeft, 0)}
      {face('t', FACES.top,    `rotateX(-90deg) translateZ(${hh}px)`,  BOX_W, BOX_D, 0,        capTop)}
      {face('b', FACES.bottom, `rotateX(90deg) translateZ(${hh}px)`,   BOX_W, BOX_D, 0,        capTop)}
    </div>
  );
}

// ─── Physics particle ─────────────────────────────────────────────────────────
interface PhysBox {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  angleZ: number; avZ: number;
  angleX: number; avX: number;
  angleY: number; avY: number;
  depth: 0 | 1;
  landed: boolean;
  landedAt: number; // ms timestamp of first floor contact, 0 = not yet
  targetAngleZ: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface BlindboxMachineMode3Props {
  machineState: 'idle' | 'animating';
  drawCount:    number;
  boxImageUrl?: string; // unused — faces are fixed per mode
  remaining:    number;
  onAnimationComplete?: () => void;
  onPush?:      () => void;
  onPurchase?:  () => void;
  onTrial?:     () => void;
  isSoldOut?:   boolean;
  onLoaded?:    () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function BlindboxMachineMode3({
  machineState,
  drawCount,
  onAnimationComplete,
  onPurchase,
  onTrial,
  isSoldOut,
  onLoaded,
}: BlindboxMachineMode3Props) {

  const [slotState, setSlotState]       = useState<('present' | 'nudging' | 'gone' | 'shuffling')[]>(Array(20).fill('present'));
  const [physBoxes, setPhysBoxes]       = useState<PhysBox[]>([]);
  const [isShuffling, setIsShuffling]   = useState(false);
  const [showGhostBack, setShowGhostBack] = useState(false);
  const [shelfKey, setShelfKey]         = useState(0);
  const [readyToPick, setReadyToPick]   = useState(false);

  const physRef          = useRef<PhysBox[]>([]);
  const frameRef         = useRef<number | undefined>(undefined);
  const physActiveRef    = useRef(false);
  const doneCalledRef    = useRef(false);
  const prevMachineState = useRef<'idle' | 'animating'>('idle');
  const timerRefs        = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Shuffle ────────────────────────────────────────────────────────────────
  const handleShuffle = useCallback(() => {
    if (isShuffling || machineState === 'animating') return;
    setIsShuffling(true);
    setSlotState(prev => prev.map(s => s === 'present' ? 'shuffling' : s) as typeof slotState);
    const t1 = setTimeout(() => setShowGhostBack(true), 600);
    const t2 = setTimeout(() => {
      setShelfKey(k => k + 1);
      setSlotState(Array(20).fill('present'));
      setShowGhostBack(false);
      setIsShuffling(false);
    }, 1400);
    timerRefs.current.push(t1, t2);
  }, [isShuffling, machineState]);

  // ── Physics loop ────────────────────────────────────────────────────────────
  const stopPhysics = useCallback(() => {
    physActiveRef.current = false;
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
  }, []);

  const startPhysicsLoop = useCallback((onSettled: () => void) => {
    if (physActiveRef.current) return;
    physActiveRef.current = true;

    const GRAVITY      = 1200;
    const BOX_RES      = 0.12;
    const FLOOR_RES    = 0.18;
    const FRICTION     = 0.975;
    const ANG_FRIC_AIR = 0.92;  // avZ decay in air
    const ROT_FRIC     = 0.97;  // avX/avY decay per frame
    const SETTLE_V     = 1.5;

    let lastTime: number | null = null;
    let settledCalled = false;

    const step = (time: number) => {
      if (lastTime === null) lastTime = time;
      const dt = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;

      const cur = physRef.current.map(b => ({ ...b }));

      for (const b of cur) {
        // Translation
        b.vy += GRAVITY * dt;
        b.vx *= FRICTION; b.vy *= FRICTION;
        b.x  += b.vx * dt; b.y += b.vy * dt;

        if (!b.landed) {
          b.angleZ += b.avZ * dt;
          b.avZ    *= ANG_FRIC_AIR;
          b.angleX += b.avX * dt;
          b.avX    *= ROT_FRIC;
          b.angleY += b.avY * dt;
          b.avY    *= ROT_FRIC;
        } else {
          // Hard-snap after 500ms to prevent endless micro-rotation
          if (Date.now() - b.landedAt > 500) {
            b.angleZ = b.targetAngleZ;
            b.angleX = BASE_AX;
            b.angleY = BASE_AY;
            b.avX = 0; b.avY = 0; b.avZ = 0;
            b.vx = 0; b.vy = 0;
          } else {
            const dz = b.targetAngleZ - b.angleZ;
            b.angleZ = Math.abs(dz) < 0.02 ? b.targetAngleZ : b.angleZ + dz * 0.25;
            b.angleX += (BASE_AX - b.angleX) * 0.20;
            b.angleY += (BASE_AY - b.angleY) * 0.20;
            b.avX = 0; b.avY = 0;
          }
        }

        // Floor collision
        const floorY = b.depth === 0 ? FRONT_FLOOR : BACK_FLOOR;
        if (b.y + BOX_R > floorY) {
          b.y  = floorY - BOX_R;
          b.vy = -Math.abs(b.vy) * FLOOR_RES;
          b.vx *= 0.80;

          if (!b.landed) {
            b.landed    = true;
            b.landedAt  = Date.now();
            const tipRight = b.avZ >= 0;
            b.targetAngleZ = tipRight ? Math.PI / 2 : -Math.PI / 2;
            b.avX += rand(-25, 25);
            b.avY += rand(-15, 15);
          }
        }

        // Side walls (hole zone only)
        if (b.y + BOX_R > HOLE_T) {
          if (b.x - BOX_R < PHYS_L) { b.x = PHYS_L + BOX_R; b.vx =  Math.abs(b.vx) * BOX_RES; }
          if (b.x + BOX_R > PHYS_R) { b.x = PHYS_R - BOX_R; b.vx = -Math.abs(b.vx) * BOX_RES; }
        }
      }

      // Pairwise collision (same depth only)
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
          b.vx = avx * BOX_RES;  b.vy = avy * BOX_RES;
          // 3D angular impulse from collision — each box tumbles in a different direction
          const spinZ = rand(-1.0, 1.0);
          const spinX = rand(-35, 35);
          const spinY = rand(-50, 50);
          a.avZ += spinZ; b.avZ -= spinZ;
          a.avX += spinX; b.avX -= spinX;
          a.avY += spinY; b.avY -= spinY;
        }
      }

      // Ceiling clamp: boxes that entered hole can't be pushed back above it
      for (const b of cur) {
        if (b.y + BOX_R > HOLE_T && b.y - BOX_R < HOLE_T) {
          b.y = HOLE_T + BOX_R;
          if (b.vy < 0) { b.vy = 0; b.vx *= 0.5; }
        }
      }

      physRef.current = cur;
      setPhysBoxes([...cur]);

      // Settle: all boxes landed AND either snapped (>500ms) or fully at rest
      const now = Date.now();
      const allSettled = cur.length > 0 && cur.every(b => {
        if (!b.landed) return false;
        if (b.landedAt > 0 && now - b.landedAt > 500) return true; // hard-snap already applied
        const slow = Math.abs(b.vx) < SETTLE_V && Math.abs(b.vy) < SETTLE_V;
        const atZ  = b.angleZ === b.targetAngleZ;
        const atX  = Math.abs(b.angleX - BASE_AX) < 1.5;
        const atY  = Math.abs(b.angleY - BASE_AY) < 1.5;
        return slow && atZ && atX && atY;
      });

      if (!settledCalled && allSettled) {
        settledCalled = true;
        physRef.current = cur.map(b => ({
          ...b,
          angleZ: b.landed ? b.targetAngleZ : b.angleZ,
          angleX: BASE_AX, angleY: BASE_AY,
          avZ: 0, avX: 0, avY: 0, vx: 0, vy: 0,
        }));
        setPhysBoxes([...physRef.current]);
        physActiveRef.current = false;
        onSettled();
        return;
      }

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => stopPhysics(), [stopPhysics]);

  // ── Reset on idle ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (machineState === 'idle' && prevMachineState.current === 'animating') {
      setShelfKey(k => k + 1);
      setSlotState(Array(20).fill('present'));
      stopPhysics();
      physRef.current = [];
      setPhysBoxes([]);
      doneCalledRef.current = false;
      prevMachineState.current = 'idle';
      setIsShuffling(false);
      setShowGhostBack(false);
      setReadyToPick(false);
    }
  }, [machineState, stopPhysics]);

  // ── Trigger draw ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (machineState !== 'animating' || prevMachineState.current === 'animating') return;
    prevMachineState.current = 'animating';
    doneCalledRef.current = false;

    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];

    const presentIdxs = slotState
      .map((s, i) => (s === 'present' ? i : -1))
      .filter(i => i >= 0);
    const count      = Math.min(drawCount, presentIdxs.length);
    const frontIdxs  = presentIdxs.filter(i => SLOTS[i].depth === 0).sort(() => Math.random() - 0.5);
    const backIdxs   = presentIdxs.filter(i => SLOTS[i].depth === 1).sort(() => Math.random() - 0.5);
    const selected   = [...frontIdxs, ...backIdxs].slice(0, count);
    const companions = selected
      .filter(i => SLOTS[i].depth === 0)
      .map(i => i + 5)
      .filter(i => i < 20 && slotState[i] === 'present');

    // Phase 1: shelf nudge + companion forward slide
    setSlotState(prev => {
      const n = [...prev];
      selected.forEach(idx   => { n[idx] = 'nudging'; });
      companions.forEach(idx => { n[idx] = 'nudging'; });
      return n;
    });

    // Phase 2: CSS animation ends → physics boxes take over
    // CSS ggb-3d-tip ends at: rotateX(45deg) rotateY(20deg) rotateZ(-5deg) translateY(18px)
    // Physics boxes spawn to seamlessly continue from that pose
    const tDrop = setTimeout(() => {
      setSlotState(prev => {
        const n = [...prev];
        selected.forEach(idx => { n[idx] = 'gone'; });
        return n;
      });

      const newBoxes: PhysBox[] = selected.map((slotIdx, i) => {
        const tipRight = i % 2 === 0; // alternate tip direction for variety in multi-draw
        return {
          id:       Date.now() + i,
          x:        SLOTS[slotIdx].centerX,
          y:        SLOTS[slotIdx].centerY + 18,   // match translateY(18px) end state
          vx:       rand(-10, 10),
          vy:       rand(100, 150),
          angleZ:   -0.087,                         // matches rotateZ(-5deg)
          avZ:      tipRight ? rand(1.5, 3.5) : rand(-3.5, -1.5),
          angleX:   22,                             // matches rotateX(22deg)
          avX:      rand(-70, -40),                 // deg/s — tumbles forward during fall
          angleY:   20,                             // matches rotateY(20deg)
          avY:      rand(-30, 30),
          depth:    SLOTS[slotIdx].depth,
          landed:   false,
          landedAt: 0,
          targetAngleZ: 0,
        };
      });

      physRef.current = newBoxes;
      setPhysBoxes(newBoxes);

      const callDone = () => {
        if (doneCalledRef.current) return;
        doneCalledRef.current = true;
        // Stop loop + freeze all boxes before showing click prompt
        stopPhysics();
        const snapped = physRef.current.map(b => ({
          ...b,
          angleZ: b.landed ? b.targetAngleZ : b.angleZ,
          angleX: BASE_AX, angleY: BASE_AY,
          avZ: 0, avX: 0, avY: 0, vx: 0, vy: 0,
        }));
        physRef.current = snapped;
        setPhysBoxes([...snapped]);
        setReadyToPick(true);
      };

      startPhysicsLoop(() => callDone());
      const tSafe = setTimeout(callDone, 1500);
      timerRefs.current.push(tSafe);
    }, 1000);

    timerRefs.current.push(tDrop);

    return () => { timerRefs.current.forEach(clearTimeout); timerRefs.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineState]);

  const handleSlotClick = () => {
    if (!readyToPick) return;
    setReadyToPick(false);
    onAnimationComplete?.();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const shelfBase3D = (extraScale = 1, col = 2) =>
    `perspective(300px) scale(${SHELF_SCALE * extraScale}) rotateX(${BASE_AX}deg) rotateY(${colRotY(col)}deg)`;

  return (
    <div className="relative w-full h-full" style={{ touchAction: 'pan-y' }}>

      {/* Background */}
      <div className="absolute inset-0">
        <Image
          src="/images/blindbox/mode3/main.png" alt="blindbox machine"
          fill className="object-fill" unoptimized
          onLoad={() => onLoaded?.()}
        />
      </div>

      {/* CSS keyframes — per-column eject/shuffle so start angle matches idle */}
      <style>{`
        @keyframes ggb-slot-pulse {
          0%, 100% { background: rgba(255,220,50,0.0); box-shadow: none; }
          50%       { background: rgba(255,220,50,0.18); box-shadow: 0 0 24px 10px rgba(255,200,50,0.30); }
        }
        @keyframes ggb-slot-text {
          0%, 100% { opacity: 0.6; transform: scale(0.96); }
          50%       { opacity: 1.0; transform: scale(1.04); }
        }
        ${[0,1,2,3,4].map(c => {
          const ry = colRotY(c);
          const ry68 = (ry + 20) / 2;
          return `
        @keyframes ggb-3d-eject-c${c} {
          0%   { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-20deg) rotateY(${ry}deg); }
          40%  { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-20deg) rotateY(${ry}deg) translateY(14px); }
          68%  { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-8deg)  rotateY(${ry68}deg) translateY(15px); }
          100% { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(22deg)  rotateY(20deg) rotateZ(-5deg) translateY(18px); }
        }
        @keyframes ggb-3d-shuffle-transform-c${c} {
          0%   { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-20deg) rotateY(${ry}deg); }
          38%  { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-20deg) rotateY(${ry}deg) translateY(12px); }
          62%  { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-5deg)  rotateY(${ry68}deg) translateY(15px); }
          100% { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(25deg)  rotateY(20deg) translateY(22px); }
        }`;}).join('')}
        @keyframes ggb-3d-shuffle-fade {
          0%, 55% { opacity: 1; }
          100%    { opacity: 0; }
        }
      `}</style>

      {/* Shelf boxes — back row rendered first (lower z-index) */}
      {[1, 0].flatMap(renderDepth =>
        SLOTS.map((slot, i) => {
          if (slot.depth !== renderDepth) return null;
          const s = slotState[i];
          if (s === 'gone') return null;
          const isBack = renderDepth === 1;

          const ry = colRotY(slot.col);

          // Outer div: position + opacity (no preserve-3d — opacity breaks 3D context)
          // Inner div: preserve-3d + transform (no opacity here)
          let innerTransform: string;
          let innerTransition: string;
          let innerAnimation: string | undefined;
          let outerAnimation: string | undefined;

          if (s === 'nudging') {
            if (isBack) {
              innerTransform    = `perspective(300px) scale(${SHELF_SCALE}) rotateX(${BASE_AX}deg) rotateY(${ry}deg) translateY(${BACK_CSS_PX}px) translateX(${-BACK_CSS_X}px)`;
              innerTransition   = 'transform 1.0s ease-out';
            } else {
              innerAnimation    = `ggb-3d-eject-c${slot.col} 1s cubic-bezier(0.3,0,0.7,1) forwards`;
              innerTransform    = `perspective(300px) scale(${SHELF_SCALE}) rotateX(22deg) rotateY(20deg) rotateZ(-5deg) translateY(18px)`;
              innerTransition   = 'none';
            }
          } else if (s === 'shuffling') {
            if (isBack) {
              innerTransform    = `perspective(300px) scale(${SHELF_SCALE}) rotateX(${BASE_AX}deg) rotateY(${ry}deg) translateY(${BACK_CSS_PX}px) translateX(${-BACK_CSS_X}px)`;
              innerTransition   = 'transform 0.8s ease-out';
            } else {
              // Opacity goes on outer div so it never touches the preserve-3d context
              outerAnimation    = 'ggb-3d-shuffle-fade 0.9s cubic-bezier(0.4,0,0.6,1) forwards';
              innerAnimation    = `ggb-3d-shuffle-transform-c${slot.col} 0.9s cubic-bezier(0.4,0,0.6,1) forwards`;
              innerTransform    = `perspective(300px) scale(${SHELF_SCALE}) rotateX(25deg) rotateY(20deg) translateY(22px)`;
              innerTransition   = 'none';
            }
          } else {
            innerTransform    = shelfBase3D(isBack ? BACK_SCALE : 1, slot.col);
            innerTransition   = 'transform 0.3s ease-out';
          }

          return (
            <div
              key={`${i}-${shelfKey}`}
              style={{
                position: 'absolute',
                left:     slot.leftPx,
                top:      slot.topPx,
                width:    BOX_W,
                height:   BOX_H,
                zIndex:   isBack ? 4 : 5,
                ...(outerAnimation ? { animation: outerAnimation } : {}),
              }}
            >
              <div style={{
                width: '100%', height: '100%',
                transformStyle: 'preserve-3d',
                transform: innerTransform,
                transition: innerTransition !== 'none' ? innerTransition : undefined,
                ...(innerAnimation ? { animation: innerAnimation } : {}),
              }}>
                <Box3DFaces />
              </div>
            </div>
          );
        })
      )}

      {/* Physics (falling + settled) boxes */}
      {physBoxes.map(b => (
        <div
          key={b.id}
          style={{
            position: 'absolute',
            left:     b.x - BOX_W / 2,
            top:      b.y - BOX_H / 2,
            width:    BOX_W,
            height:   BOX_H,
            zIndex:   b.depth === 0 ? 10 : 8,
            transformStyle: 'preserve-3d',
            transform: [
              `perspective(300px)`,
              `scale(${SHELF_SCALE * (b.depth === 1 ? BACK_SCALE : 1)})`,
              `rotateX(${b.angleX}deg)`,
              `rotateY(${b.angleY}deg)`,
              `rotateZ(${b.angleZ}rad)`,
            ].join(' '),
            willChange: 'transform',
          }}
        >
          <Box3DFaces />
        </div>
      ))}

      {/* Ghost back row fading in during 換一批 */}
      {showGhostBack && SLOTS.map((slot, slotIdx) => {
        if (slot.depth !== 1) return null;
        return (
          <motion.div
            key={`ghost-${slotIdx}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: slot.col * 0.04 }}
            style={{
              position: 'absolute',
              left: slot.leftPx, top: slot.topPx,
              width: BOX_W, height: BOX_H,
              zIndex: 3,
              transformStyle: 'preserve-3d',
              transform: shelfBase3D(BACK_SCALE, slot.col),
            }}
          >
            <Box3DFaces />
          </motion.div>
        );
      })}

      {/* hole_bg (z=12): opaque overlay with transparent oval — reveals physics boxes */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 12 }}>
        <Image src="/images/blindbox/mode3/hole_bg.png" alt="" fill className="object-fill" unoptimized />
      </div>

      {/* Retrieval slot click area — appears after boxes settle (z=13) */}
      {readyToPick && (
        <div
          onClick={handleSlotClick}
          style={{
            position: 'absolute',
            left: HOLE_L, top: HOLE_T,
            width: HOLE_R - HOLE_L,
            height: HOLE_B - HOLE_T,
            zIndex: 13,
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'ggb-slot-pulse 1.1s ease-in-out infinite',
          }}
        >
          <span style={{
            color: '#fff8c0',
            fontWeight: 900,
            fontSize: '15px',
            letterSpacing: '0.12em',
            textShadow: '0 0 8px rgba(255,200,0,0.9), 0 1px 3px rgba(0,0,0,0.6)',
            animation: 'ggb-slot-text 1.1s ease-in-out infinite',
          }}>點擊取物</span>
        </div>
      )}

      {/* Buttons (z=20) */}
      <ImageButton
        src="/images/blindbox/mode3/btn2.png" alt="換一批" text="換一批"
        className={`absolute ${isSoldOut || isShuffling || machineState !== 'idle' ? 'grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '5.33%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
        onClick={handleShuffle} />
      <ImageButton
        src="/images/blindbox/mode3/btn1.png" alt="立即開盒" text="立即開盒"
        className={`absolute ${isSoldOut || machineState !== 'idle' || readyToPick ? 'grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '31.73%', top: '84.5%', width: '36.53%', height: '11.2%', zIndex: 20 }}
        onClick={() => { if (machineState === 'idle' && !readyToPick) onPurchase?.(); }} />
      <ImageButton
        src="/images/blindbox/mode3/btn2.png" alt="試試看" text="試試看"
        className={`absolute ${isSoldOut || machineState !== 'idle' || readyToPick ? 'grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '69.6%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
        onClick={() => { if (machineState === 'idle' && !readyToPick) onTrial?.(); }} />

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
