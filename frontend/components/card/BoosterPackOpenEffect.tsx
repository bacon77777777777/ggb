'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { asset } from '@/lib/asset';

interface BoosterPackProps {
  packImage?: string;
  onComplete?: () => void;
}

type Phase = 'idle' | 'charging' | 'tearing' | 'done';

interface Particle {
  id: number;
  color: string;
  w: number;
  tx: number;
  ty: number;
  delay: number;
}

const BURST_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#A78BFA', '#34D399', '#F97316', '#FB923C', '#60A5FA'];

function genParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (360 / n) * i * (Math.PI / 180);
    const dist = 100 + Math.floor(Math.random() * 90);
    return {
      id: i,
      color: BURST_COLORS[i % BURST_COLORS.length],
      w: 5 + Math.floor(Math.random() * 7),
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      delay: Math.random() * 0.07,
    };
  });
}

const TOP_CLIP =
  'polygon(0% 0%, 100% 0%, 100% 21%, 91% 19%, 83% 22%, 74% 18%, 65% 22%, 57% 18%, 48% 22%, 39% 18%, 30% 22%, 22% 19%, 13% 22%, 5% 18%, 0% 21%)';
const BOTTOM_CLIP =
  'polygon(0% 21%, 5% 18%, 13% 22%, 22% 19%, 30% 22%, 39% 18%, 48% 22%, 57% 18%, 65% 22%, 74% 18%, 83% 22%, 91% 19%, 100% 21%, 100% 100%, 0% 100%)';

/*
 * 蓄力時沿著卡包邊緣長出來的黃線。
 *
 * **這是 `public/images/card/mask.svg` 的 path，原封不動複製過來的**
 *（老闆 2026-08-30 換了新卡包，連帶重畫了 mask）。
 * 之所以內嵌而不是載入那個檔：這條線靠 `strokeDasharray`／`strokeDashoffset`
 * 隨蓄力進度長出來，要拿得到 path 本身，用 <img> 或 CSS mask 都做不到。
 * ⚠️ mask.svg 之後再改，這裡要一起複製過來，否則線會跟卡包外框對不上。
 */
const LIGHT_VIEWBOX = '0 0 822 1560';
const LIGHT_PATH =
  'M1.9468 4.82627C5.5468 3.33293 9.4268 3.01293 13.2801 3.13293C180.853 3.06627 348.427 3.30627 516 3.1996C616.147 3.18627 716.28 2.94627 816.427 3.1996C816.8 4.33293 817.547 6.5996 817.92 7.73293C818.24 23.8796 818.28 40.0396 817.76 56.1729C816.08 61.2796 815.214 66.5196 814.934 71.8663C811.867 79.7596 813 88.3996 810.147 96.3463C810.28 105.133 807.374 113.413 806.12 122C801.707 131.88 805.56 143.266 801.907 153.28C800.6 163.586 797.707 173.613 796.6 183.906C796.747 254.146 797.014 324.4 796.534 394.64C796.134 397.853 797.707 400.773 798 403.906C798.254 461.706 797.774 519.52 798.187 577.333C797.987 605.933 798.36 634.546 798 663.146C798.187 665.72 796.893 668.066 796.813 670.613C796.573 740.853 796.947 811.093 796.654 881.333C796.867 1036.44 796.68 1191.56 796.52 1346.67C796.76 1355.88 795.6 1365.31 797.947 1374.33C798.454 1383.43 797.44 1392.8 800.454 1401.57C801.16 1408.65 800.374 1416.05 803.027 1422.85C804.334 1430.08 803.107 1437.83 805.854 1444.8C807.094 1450.36 806.573 1456.23 808.573 1461.64C810.307 1466.92 809.147 1472.68 811.174 1477.89C813.294 1483.91 812.027 1490.53 814.787 1496.44C817.054 1514.55 816.893 1532.93 816.467 1551.23C816.227 1553.28 815.4 1555.81 813.053 1556.23C805.2 1557.13 797.107 1555.64 789.414 1557.8C716.054 1558.27 642.693 1557.93 569.333 1558.11C381.2 1558.25 193.053 1558.08 4.92013 1558.04C3.9468 1557.19 2.9868 1556.35 2.04013 1555.53C-0.0398698 1541.12 0.986797 1526.52 0.466797 1512C0.533464 1504.71 0.186797 1497.36 1.81346 1490.21C1.89346 1484.85 4.7868 1480.01 4.69346 1474.65C4.6668 1470.03 7.3468 1465.93 7.52013 1461.35C7.84013 1456.77 10.0668 1452.59 10.1201 1448.01C10.1201 1443.77 11.2001 1439.65 12.5468 1435.68C13.0668 1430.71 13.1201 1425.59 14.9868 1420.88C16.8535 1413.44 15.3868 1405.45 17.9735 1398.19C19.1335 1392.31 19.0668 1386.32 19.3201 1380.39C21.4935 1372.48 21.8268 1364.17 21.7068 1356C21.8135 1202.23 21.7601 1048.44 21.7068 894.666C21.5601 885.346 22.2135 875.973 21.0135 866.693C20.8535 840.453 20.9735 814.213 20.9868 787.973C22.0001 779.133 21.7468 770.2 21.6135 761.32C20.5335 754.253 20.8801 747.093 21.6801 740.026C21.5735 726.24 22.2801 712.413 20.9468 698.68C21.1068 648.893 20.2001 599.106 20.8401 549.32C22.5601 532.506 21.7335 515.546 21.8001 498.666C22.3201 487.066 19.8668 475.6 20.8268 464C21.0401 423.12 20.3468 382.213 20.9335 341.333C20.5468 295.146 21.0801 248.973 20.8001 202.786C20.9068 199.84 20.5601 196.92 19.5201 194.146C18.6001 182.346 19.7735 170.44 18.2535 158.666C17.6668 153.773 18.8668 148.6 16.9068 143.933C15.4135 136.013 12.6001 128.4 12.6135 120.226C10.6135 115.946 9.97346 111.293 9.9468 106.613C7.93346 99.4529 8.16013 91.8529 6.68013 84.6263C3.37346 79.0663 5.5868 72.4396 3.49346 66.5596C-0.613203 52.2929 1.13346 37.2929 0.786797 22.6529C0.546797 16.6529 2.4268 10.8263 1.9468 4.82627Z';

// Scene design base: 393 × 852 (standard portrait phone)
const DW = 393;

// Pack placement in design coords
/*
 * 卡包在場景座標裡的位置與大小。
 *
 * 2026-08-30 跟著新卡包改：**框的比例原本還是舊卡包的 1 : 1.451**，
 * 而卡包圖是 `object-contain`，新圖（1 : 1.887）塞進去只佔 180.7px 寬、
 * 左右各空 27px —— 黃線是畫滿整個框的，於是比卡包寬 54px，整條浮在外面。
 * 現在框改成 mask 的比例（1 : 1.898），線才貼著卡包邊緣。
 * PX 一併右移，讓卡包在螢幕上的位置跟改之前一樣（118.1~298.9 → 119~299）。
 */
const PX = 119;  // left
const PY = 148;  // top
const PW = 180;  // width
const PH = 342;  // height （= PW × mask 的 1560/822）
const PR = -2;   // rotation degrees

export default function BoosterPackOpenEffect({ packImage, onComplete }: BoosterPackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimW, setDimW] = useState(DW);
  const [phase, setPhase] = useState<Phase>('idle');
  const [charge, setCharge] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const particles = useMemo(() => genParticles(24), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDimW(el.clientWidth));
    ro.observe(el);
    setDimW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const s = dimW / DW;

  /*
   * 蓄力的震動節點（progress 0~1）。
   * 間距刻意由疏到密 —— 等距的話手感是平的，密起來才有「快滿了」的蓄力感。
   * iOS 沒有「持續震動」這種 API，連續的觸覺一律是靠密集的短震堆出來的。
   */
  const HAPTIC_STOPS = useMemo(() => [0.2, 0.38, 0.52, 0.64, 0.74, 0.82, 0.89, 0.95], []);
  const hapticIdx = useRef(0);

  const tick = useCallback((now: number) => {
    const progress = Math.min((now - startRef.current) / 700, 1);
    setCharge(progress * 100);

    while (hapticIdx.current < HAPTIC_STOPS.length && progress >= HAPTIC_STOPS[hapticIdx.current]) {
      hapticIdx.current++;
      hapticLight();
    }

    if (progress >= 1) {
      hapticMedium();            // 蓄滿：明顯較重的一下，不用看畫面也知道
      setPhase('tearing');
      setTimeout(() => { setPhase('done'); onComplete?.(); }, 420);
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [onComplete, HAPTIC_STOPS]);

  const pointerStartX = useRef(0);
  const pointerStartTime = useRef(0);

  const triggerTear = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    hapticMedium();              // 右滑直接撕開，跳過蓄力也要有回饋
    setCharge(100);
    setPhase('tearing');
    setTimeout(() => { setPhase('done'); onComplete?.(); }, 420);
  }, [onComplete]);

  const startCharge = useCallback((e: React.PointerEvent) => {
    if (phase !== 'idle') return;
    // Capture pointer so onPointerUp fires even after leaving element (needed for swipe detection)
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerStartX.current = e.clientX;
    pointerStartTime.current = performance.now();
    setPhase('charging');
    setCharge(0);
    hapticIdx.current = 0;
    hapticLight();               // 按下去先給一下，讓玩家知道按到了
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [phase, tick]);

  const cancelCharge = useCallback((e: React.PointerEvent) => {
    const dx = e.clientX - pointerStartX.current;
    const dt = performance.now() - pointerStartTime.current;
    const vx = dx / Math.max(dt, 1) * 1000; // px/s
    // Right swipe triggers full charge-complete effect (flash + particles + tear)
    if (dx > 40 || vx > 300) {
      triggerTear();
      return;
    }
    if (phase !== 'charging') return;
    cancelAnimationFrame(rafRef.current);
    hapticIdx.current = 0;
    setCharge(0);
    setPhase('idle');
  }, [phase, triggerTear]);

  const imgSrc = packImage ?? asset('/images/card/front.webp');

  const packFace = () => (
    <div style={{ position: 'relative', width: PW * s, height: PH * s }}>
      <Image
        src={imgSrc} alt="" fill
        className="object-contain pointer-events-none select-none"
        draggable={false} priority unoptimized
      />
      {charge > 0 && (
        <svg
          viewBox={LIGHT_VIEWBOX}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none',
            filter: 'drop-shadow(0 0 4px rgba(255,205,50,0.85))',
          }}
        >
          <path
            d={LIGHT_PATH}
            fill="none"
            stroke="rgba(255,205,50,0.95)"
            /* 線寬照 viewBox 等比放大：原本 5/384 ≈ 1.3% 寬，822 寬的 viewBox 要 11 */
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={1 - charge / 100}
          />
        </svg>
      )}
    </div>
  );

  return (
    // ≤767px: 寬滿版等比縮放，上下裁切；≥768px: 高度滿版維持比例居中
    <div
      ref={containerRef}
      className="relative overflow-hidden w-screen md:w-[calc(100dvh_*_393_/_852)] h-[100dvh]"
      style={{ WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
      onContextMenu={e => e.preventDefault()}
    >
      {/* 層 0：背景 */}
      <Image
        src={asset("/images/card/charge/bg.webp")}
        alt="" fill
        className="object-cover"
        unoptimized priority
        draggable={false}
        style={{ WebkitTouchCallout: 'none', userSelect: 'none', pointerEvents: 'none' } as React.CSSProperties}
        onContextMenu={e => e.preventDefault()}
      />

      {/* 層 1：hand1（掌心，卡包下方） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        draggable={false}
        src={asset("/images/card/charge/hand1.webp")}
        alt=""
        style={{
          position: 'absolute',
          left: 0 * s,
          top: 230 * s,
          width: 490 * s,
          zIndex: 1,
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        } as React.CSSProperties}
      />

      {/* 層 2：卡包（idle / charging / tearing） */}
      <AnimatePresence mode="popLayout">
        {(phase === 'idle' || phase === 'charging') && (
          <motion.div
            key="pack-live"
            style={{ position: 'absolute', top: PY * s, left: PX * s, zIndex: 2 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
          >
            {/* 蓄力光暈 */}
            <AnimatePresence>
              {phase === 'charging' && (
                <motion.div
                  key="glow"
                  style={{
                    position: 'absolute',
                    inset: -16 * s,
                    borderRadius: '20%',
                    background: 'radial-gradient(ellipse, rgba(255,200,50,0.32) 0%, transparent 68%)',
                    pointerEvents: 'none',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.42, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </AnimatePresence>

            <motion.button
              type="button"
              style={{
                display: 'block',
                background: 'none', border: 'none', padding: 0,
                cursor: 'pointer',
                userSelect: 'none', touchAction: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                transform: `rotate(${PR}deg)`,
                transformOrigin: 'center',
              } as React.CSSProperties}
              onPointerDown={startCharge}
              onPointerUp={cancelCharge}
              onPointerCancel={() => {
                // System interrupt (e.g. phone call) — cancel charge
                if (phase !== 'charging') return;
                cancelAnimationFrame(rafRef.current);
                setCharge(0);
                setPhase('idle');
              }}
              onContextMenu={e => e.preventDefault()}
              animate={
                phase === 'charging'
                  ? { x: [-3 * s, 3 * s, -2.5 * s, 2.5 * s, 0] }
                  : {}
              }
              transition={
                phase === 'charging'
                  ? { duration: 0.28, repeat: Infinity }
                  : {}
              }
            >
              {packFace()}
            </motion.button>
          </motion.div>
        )}

        {/* 撕開動畫 */}
        {phase === 'tearing' && (
          <motion.div
            key="tearing"
            style={{
              position: 'absolute',
              top: PY * s, left: PX * s,
              width: PW * s, height: PH * s,
              transform: `rotate(${PR}deg)`,
              transformOrigin: 'center',
              zIndex: 2,
            }}
          >
            <motion.div
              style={{ position: 'absolute', inset: 0, clipPath: TOP_CLIP }}
              initial={{ y: 0, rotate: 0, opacity: 1 }}
              animate={{ y: -210 * s, rotate: -7, opacity: 0 }}
              transition={{ duration: 0.38, ease: [0.18, 0, 0.42, 1] }}
            >
              {packFace()}
            </motion.div>
            <motion.div
              style={{ position: 'absolute', inset: 0, clipPath: BOTTOM_CLIP }}
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: 48 * s, opacity: 0 }}
              transition={{ duration: 0.38, ease: 'easeIn', delay: 0.04 }}
            >
              {packFace()}
            </motion.div>
            <motion.div
              style={{
                position: 'absolute', left: 0, right: 0, top: '20%',
                height: 7 * s,
                background: 'linear-gradient(90deg, transparent, rgba(255,215,90,0.85), rgba(255,255,255,1), rgba(255,215,90,0.85), transparent)',
                filter: 'blur(2.5px)',
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: [0, 1, 0] }}
              transition={{ duration: 0.38 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 層 3：hand2（拇指，卡包上方） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset("/images/card/charge/hand2.webp")}
        alt=""
        style={{
          position: 'absolute',
          left: 0 * s,
          top: 230 * s,
          width: 490 * s,
          zIndex: 3,
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        } as React.CSSProperties}
      />

      {/* 白色閃光 */}
      <AnimatePresence>
        {phase === 'tearing' && (
          <motion.div
            key="flash"
            style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'white', pointerEvents: 'none' }}
            initial={{ opacity: 0.92 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* 粒子爆發 */}
      {phase === 'tearing' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1390, pointerEvents: 'none', overflow: 'hidden' }}>
          {particles.map(p => (
            <motion.div
              key={p.id}
              style={{
                position: 'absolute',
                left: (PX + PW / 2) * s,
                top: (PY + PH * 0.21) * s,
                width: p.w, height: p.w,
                borderRadius: '50%',
                background: p.color,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: p.tx, y: p.ty, opacity: 0, scale: 0.25 }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: p.delay }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
