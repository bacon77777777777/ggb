'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { playSfx, SFX } from '@/lib/sfx';
import { isSoundMuted } from '@/lib/soundPrefs';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ImageButton } from '@/components/ui/ImageButton';
import { hapticMedium } from '@/lib/haptics';

// ─── layout (750×932 design) ─────────────────────────────────────────────────
const BOX_DESIGN_W = 100;
const BOX_STEP     = 128;
const ROW0_TOP     = 166;
const ROW1_TOP     = 373;
const BACK_CSS_PX  = 12;
const BACK_CSS_X   = 0;
const BACK_SCALE   = 0.90;
const SHELF_SCALE  = 0.82;
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
const BOX_R = 20;

const HOLE_L = HOLE_LEFT * TO_CSS;
const HOLE_R = HOLE_L + HOLE_W * TO_CSS;
const HOLE_T = (HOLE_TOP / 932) * CSS_H;
const HOLE_B = HOLE_T + (HOLE_H / 932) * CSS_H;
const PHYS_L = HOLE_L - 10;
const PHYS_R = HOLE_R + 10;
const CENTER_X = (HOLE_L + HOLE_R) / 2;   // 落地後箱子往這裡集中
const FRONT_FLOOR = HOLE_B + BOX_R * 0.5;
const BACK_FLOOR  = HOLE_B - BOX_R * 1.2;

// ─── 6-face image paths (shared with mode3) ───────────────────────────────────
const FACES = {
  front:  '/images/blindbox/mode3/box/4.webp',
  back:   '/images/blindbox/mode3/box/6.webp',
  left:   '/images/blindbox/mode3/box/3.webp',
  right:  '/images/blindbox/mode3/box/5.webp',
  top:    '/images/blindbox/mode3/box/2.webp', // 交換：原 bottom 圖
  bottom: '/images/blindbox/mode3/box/1.webp', // 交換：原 top 圖
} as const;

const BASE_AX = -20;
const BASE_AY =   0;

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
function Box3DFaces() {
  const hw = BOX_W / 2, hh = BOX_H / 2, hd = BOX_D / 2;
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
  landedAt: number;
  targetAngleZ: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────
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

function useBoxSounds() {
  const shuffleRef = useRef<HTMLAudioElement | null>(null);
  const machineRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    shuffleRef.current = new Audio('/audio/changebox.mp3');
    machineRef.current = new Audio('/audio/gacha.mp3');
    machineRef.current.loop = true;
    [shuffleRef, machineRef].forEach(r => { if (r.current) r.current.preload = 'auto'; });
    return () => {
      [shuffleRef, machineRef].forEach(r => {
        if (r.current) { r.current.pause(); r.current.src = ''; }
      });
    };
  }, []);

  // 這兩個音檔沒走 lib/sfx（機台嗡鳴要 loop、換箱要能重疊），所以靜音開關
  // 得在這裡自己擋一次，不然玩家按了靜音機台還是在響。
  const play = (ref: React.MutableRefObject<HTMLAudioElement | null>, volume = 1) => {
    const a = ref.current;
    if (!a || isSoundMuted()) return;
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => {});
  };

  const startMachine = () => {
    const a = machineRef.current;
    if (!a || isSoundMuted()) return;
    a.volume = 0.55;
    a.currentTime = 0;
    void a.play().catch(() => {});
  };

  const stopMachine = () => {
    const a = machineRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  };

  return {
    playShuffle:  () => play(shuffleRef, 0.7),
    // 掉落音效走共用播放器：音檔長 1.12 秒，原本沒有任何防重複，
    // 多抽時一箱接一箱會把還在播的攔腰截斷重來
    playDrop:     () => playSfx(SFX.eggDrop, { volume: 0.8 }),
    startMachine,
    stopMachine,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function BlindboxMachineMode2({
  machineState,
  drawCount,
  onAnimationComplete,
  onPurchase,
  onTrial,
  isSoldOut,
  onLoaded,
}: BlindboxMachineMode2Props) {

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
  const { playShuffle, playDrop, startMachine, stopMachine } = useBoxSounds();

  // Web Audio impact thud — throttled to avoid overlapping
  const lastImpactRef = useRef(0);
  const impactRef = useRef(() => {
    if (isSoundMuted()) return;
    const now = Date.now();
    if (now - lastImpactRef.current < 120) return;
    lastImpactRef.current = now;
    try {
      const ctx = new AudioContext();
      // Noise burst
      const bufLen = Math.floor(ctx.sampleRate * 0.07);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.22, ctx.currentTime);
      ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      noise.connect(ng); ng.connect(ctx.destination);
      noise.start();
      // Low thud
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(22, ctx.currentTime + 0.2);
      og.gain.setValueAtTime(0.55, ctx.currentTime);
      og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(og); og.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.25);
      osc.onended = () => ctx.close();
    } catch {}
  });

  // ── Shuffle ────────────────────────────────────────────────────────────────
  const handleShuffle = useCallback(() => {
    if (isShuffling || machineState === 'animating') return;
    playShuffle();
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
    const FLOOR_RES    = 0.06;
    // 每「秒」保留的比例（原本是每幀 0.975，@60fps ≈ 每秒 0.22）
    const FRICTION_PER_SEC     = 0.22;
    const GROUND_DAMP_PER_SEC  = 0.05;
    // 同樣改成「每秒保留比例」（原每幀 0.92 / 0.97 @60fps）
    const ANG_FRIC_AIR_PER_SEC = 0.0068;
    const ROT_FRIC_PER_SEC     = 0.16;
    const SETTLE_V      = 1.5;

    let lastTime: number | null = null;
    let settledCalled = false;

    const step = (time: number) => {
      if (lastTime === null) lastTime = time;
      const dt = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;

      const cur = physRef.current.map(b => ({ ...b }));

      for (const b of cur) {
        b.vy += GRAVITY * dt;
        /*
         * 阻力一律以 dt 為基準（每幀固定乘一個係數的話，120Hz 螢幕
         * 上的衰減是 60Hz 的兩倍，同一段動畫在不同機器上快慢不同）。
         * 落地後再疊一層地面摩擦，讓箱子滑一小段自然停住，
         * 而不是「還在動 → 瞬間定格」。
         */
        const airDamp = Math.pow(FRICTION_PER_SEC, dt);
        b.vx *= airDamp; b.vy *= airDamp;
        if (b.landed) b.vx *= Math.pow(GROUND_DAMP_PER_SEC, dt);
        b.x  += b.vx * dt; b.y += b.vy * dt;

        if (!b.landed) {
          const angDamp = Math.pow(ANG_FRIC_AIR_PER_SEC, dt);
          const rotDamp = Math.pow(ROT_FRIC_PER_SEC, dt);
          b.angleZ += b.avZ * dt;
          b.avZ    *= angDamp;
          b.angleX += b.avX * dt;
          b.avX    *= rotDamp;
          b.angleY += b.avY * dt;
          b.avY    *= rotDamp;
        } else {
          /*
           * 落地後的角速度靠地面摩擦衰減。
           * 用 dt 為基準（每秒衰減到 2%）而不是每幀 ×0.80 ——
           * 後者在 120Hz 螢幕上衰減速度是 60Hz 的兩倍，看起來就是
           * 「轉一下突然定住」。低於門檻直接歸零，免得殘留抖動。
           */
          b.avZ *= Math.pow(0.02, dt);
          if (Math.abs(b.avZ) < 0.05) b.avZ = 0;
          b.angleZ += b.avZ * dt;
          b.angleX += (BASE_AX - b.angleX) * 0.35;
          b.angleY += (BASE_AY - b.angleY) * 0.35;
          b.avX = 0;
          b.avY = 0;
          // 落地後往中間滾一小段。多抽時箱子會散在取物口兩側，
          // 集中起來才好點；用 angleZ 跟著位移轉，看起來是滾不是滑。
          // 往中間的路被別的箱子擋住就不滾：硬滾的位移每幀都被碰撞
          // 分離推回原位，位移歸零但 angleZ 持續累積 —— 10 抽時就是
          // 「只有搶到正中央那一箱不轉、其他九箱原地瘋狂旋轉」的來源。
          const dxToCenter = CENTER_X - b.x;
          if (Math.abs(dxToCenter) > 1.5) {
            const dir = Math.sign(dxToCenter);
            const blocked = cur.some(o =>
              o !== b && o.depth === b.depth &&
              Math.sign(o.x - b.x) === dir &&
              Math.abs(o.x - b.x) < BOX_R * 2 + 2 &&
              Math.abs(o.y - b.y) < BOX_R * 1.5
            );
            if (!blocked) {
              const roll = dir * Math.min(Math.abs(dxToCenter) * 3.2, 90) * dt;
              b.x      += roll;
              // angleZ 是**弧度**（transform 用 rotateZ(...rad)）。
              // 原本這裡多乘了 180/π 把弧度當角度換算 —— 一幀就轉
              // 1.8 弧度（每秒約 6400 度），這才是「落地後瘋狂旋轉」
              // 的真正原因，跟被不被擋住無關。滾動角度 = 位移 / 半徑。
              b.angleZ += (roll / BOX_R) * 0.45;
            }
          }
        }

        const floorY = b.depth === 0 ? FRONT_FLOOR : BACK_FLOOR;
        if (b.y + BOX_R > floorY) {
          b.y  = floorY - BOX_R;
          b.vy = -Math.abs(b.vy) * FLOOR_RES;
          b.vx *= 0.80;

          if (!b.landed) {
            b.landed   = true;
            b.landedAt = Date.now();
            b.avZ *= 0.30;
            b.avX = 0;
            b.avY = 0;
            impactRef.current();
          }
        }

        // Stacking landing: box resting on another box, never touched floor
        if (!b.landed && Math.abs(b.vx) < 10 && Math.abs(b.vy) < 20) {
          b.landed   = true;
          b.landedAt = Date.now();
          b.avZ *= 0.30;
          b.avX = 0;
          b.avY = 0;
          impactRef.current();
        }

        if (b.y + BOX_R > HOLE_T) {
          if (b.x - BOX_R < PHYS_L) { b.x = PHYS_L + BOX_R; b.vx =  Math.abs(b.vx) * BOX_RES; }
          if (b.x + BOX_R > PHYS_R) { b.x = PHYS_R - BOX_R; b.vx = -Math.abs(b.vx) * BOX_RES; }
        }
      }

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
          const spinZ = rand(-1.0, 1.0);
          const spinX = rand(-35, 35);
          const spinY = rand(-50, 50);
          if (!a.landed) { a.avZ += spinZ; a.avX += spinX; a.avY += spinY; }
          if (!b.landed) { b.avZ -= spinZ; b.avX -= spinX; b.avY -= spinY; }
        }
      }

      for (const b of cur) {
        if (b.y + BOX_R > HOLE_T && b.y - BOX_R < HOLE_T) {
          b.y = HOLE_T + BOX_R;
          if (b.vy < 0) { b.vy = 0; b.vx *= 0.5; }
        }
      }

      physRef.current = cur;
      setPhysBoxes([...cur]);

      const now = Date.now();
      const allSettled = cur.length > 0 && cur.every(b => {
        if (!b.landed) return false;
        if (b.landedAt > 0 && now - b.landedAt > 2000) return true;
        const posSlow = Math.abs(b.vx) < SETTLE_V && Math.abs(b.vy) < SETTLE_V;
        const angDone = Math.abs(b.avZ) < 0.05 && Math.abs(b.angleX - BASE_AX) < 1.0 && Math.abs(b.angleY - BASE_AY) < 1.0;
        return posSlow && angDone;
      });

      if (!settledCalled && allSettled) {
        settledCalled = true;
        physRef.current = cur.map(b => ({
          ...b,
          angleZ: b.angleZ,
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
      stopMachine();
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
    startMachine();

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

    setSlotState(prev => {
      const n = [...prev];
      selected.forEach(idx   => { n[idx] = 'nudging'; });
      companions.forEach(idx => { n[idx] = 'nudging'; });
      return n;
    });

    const tDrop = setTimeout(() => {
      playDrop(); // 盒子掉落音效
      hapticMedium(); // 盒子落地：畫面在震，手也要震
      setSlotState(prev => {
        const n = [...prev];
        selected.forEach(idx => { n[idx] = 'gone'; });
        return n;
      });

      const newBoxes: PhysBox[] = selected.map((slotIdx, i) => {
        const tipRight = i % 2 === 0;
        return {
          id:       Date.now() + i,
          x:        SLOTS[slotIdx].centerX,
          y:        SLOTS[slotIdx].centerY + 18,
          vx:       rand(-10, 10),
          vy:       rand(100, 150),
          angleZ:   -0.087,
          avZ:      tipRight ? rand(1.5, 3.5) : rand(-3.5, -1.5),
          angleX:   -52,
          avX:      rand(-38, -18),
          angleY:   20,
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
        stopPhysics();
        stopMachine();
        const snapped = physRef.current.map(b => ({
          ...b,
          angleZ: b.angleZ,
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
          src="/images/blindbox/mode2/main.webp" alt="blindbox machine"
          fill className="object-fill" unoptimized
          priority
          /* priority 一定要留著。
             盒玩頁在機台回報載入完成前是 visibility:hidden，而 Next/Image 預設
             lazy —— 瀏覽器看它不在畫面上就不下載，圖不下載就永遠不會回報，
             結果只能等頁面那道 3 秒保險計時器。變成「網路再快也是 3 秒起跳」的死結。
             priority 讓它無視可視範圍立刻下載，同時解掉死結。 */
          onLoad={() => onLoaded?.()}
        />
      </div>

      {/* CSS keyframes — per-column eject/shuffle */}
      <style>{`
        @keyframes ggb-slot-pulse-m2 {
          0%, 100% { background: rgba(255,220,50,0.0); box-shadow: none; }
          50%       { background: rgba(255,220,50,0.18); box-shadow: 0 0 24px 10px rgba(255,200,50,0.30); }
        }
        @keyframes ggb-slot-text-m2 {
          0%, 100% { opacity: 0.6; transform: scale(0.96); }
          50%       { opacity: 1.0; transform: scale(1.04); }
        }
        ${[0,1,2,3,4].map(c => {
          const ry = colRotY(c);
          const ry68 = (ry + 20) / 2;
          return `
        @keyframes ggb-3d-eject-m2-c${c} {
          0%   { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-20deg) rotateY(${ry}deg); }
          40%  { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-20deg) rotateY(${ry}deg) translateY(14px); }
          68%  { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-32deg) rotateY(${ry68}deg) translateY(15px); }
          100% { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-52deg) rotateY(20deg) rotateZ(-5deg) translateY(18px); }
        }
        @keyframes ggb-3d-shuffle-transform-m2-c${c} {
          0%   { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-20deg) rotateY(${ry}deg); }
          38%  { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-20deg) rotateY(${ry}deg) translateY(12px); }
          62%  { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(-5deg)  rotateY(${ry68}deg) translateY(15px); }
          100% { transform: perspective(300px) scale(${SHELF_SCALE}) rotateX(25deg)  rotateY(20deg) translateY(22px); }
        }`;}).join('')}
        @keyframes ggb-3d-shuffle-fade-m2 {
          0%, 55% { opacity: 1; }
          100%    { opacity: 0; }
        }
      `}</style>

      {/* Shelf boxes */}
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
              innerAnimation    = `ggb-3d-eject-m2-c${slot.col} 1s cubic-bezier(0.3,0,0.7,1) forwards`;
              innerTransform    = `perspective(300px) scale(${SHELF_SCALE}) rotateX(-52deg) rotateY(20deg) rotateZ(-5deg) translateY(18px)`;
              innerTransition   = 'none';
            }
          } else if (s === 'shuffling') {
            if (isBack) {
              innerTransform    = `perspective(300px) scale(${SHELF_SCALE}) rotateX(${BASE_AX}deg) rotateY(${ry}deg) translateY(${BACK_CSS_PX}px) translateX(${-BACK_CSS_X}px)`;
              innerTransition   = 'transform 0.8s ease-out';
            } else {
              // Opacity goes on outer div so it never touches the preserve-3d context
              outerAnimation    = 'ggb-3d-shuffle-fade-m2 0.9s cubic-bezier(0.4,0,0.6,1) forwards';
              innerAnimation    = `ggb-3d-shuffle-transform-m2-c${slot.col} 0.9s cubic-bezier(0.4,0,0.6,1) forwards`;
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
                // 旋轉軸在盒子「底部前緣」，不是幾何中心。
                // 用中心當軸的話，頂部往前傾的同時底部會往後翹，
                // 看起來像盒子懸空翻轉；真實的盒子是被推到架緣後
                // 以底部前緣為支點翻落下去。
                transformOrigin: `50% 100% ${BOX_D / 2}px`,
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
            // 與貨架上的盒子用同一個支點，交接那一幀才不會跳位
            transformOrigin: `50% 100% ${BOX_D / 2}px`,
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

      {/* hole_bg (z=12): opaque overlay with transparent oval */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 12 }}>
        <Image src="/images/blindbox/mode2/hole_bg.webp" alt="" fill className="object-fill" unoptimized />
      </div>

      {/* Retrieval slot click area (z=14) */}
      {readyToPick && (
        <div
          onClick={handleSlotClick}
          style={{
            position: 'absolute',
            left: HOLE_L, top: HOLE_T,
            width: HOLE_R - HOLE_L,
            height: HOLE_B - HOLE_T,
            zIndex: 14,
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'ggb-slot-pulse-m2 1.1s ease-in-out infinite',
          }}
        >
          <span style={{
            color: '#fff8c0',
            fontWeight: 900,
            fontSize: '15px',
            letterSpacing: '0.12em',
            textShadow: '0 0 8px rgba(255,200,0,0.9), 0 1px 3px rgba(0,0,0,0.6)',
            animation: 'ggb-slot-text-m2 1.1s ease-in-out infinite',
          }}>點擊取物</span>
        </div>
      )}

      {/* Buttons (z=20) */}
      <ImageButton
        src="/images/blindbox/mode2/btn2.webp" alt="換一批" text="換一批"
        className={`absolute ${isSoldOut || machineState !== 'idle' || readyToPick ? 'grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '5.33%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
        onClick={handleShuffle} />
      <ImageButton
        src="/images/blindbox/mode2/btn1.webp" alt="立即開盒" text="立即開盒"
        className={`absolute ${isSoldOut || machineState !== 'idle' || readyToPick ? 'grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '31.73%', top: '84.5%', width: '36.53%', height: '11.2%', zIndex: 20 }}
        onClick={() => { if (machineState === 'idle' && !readyToPick) onPurchase?.(); }} />
      <ImageButton
        src="/images/blindbox/mode2/btn2.webp" alt="試試看" text="試試看"
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
