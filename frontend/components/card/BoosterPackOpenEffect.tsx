'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';

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

const LIGHT_PATH =
  'M2.14054 0C4.68414 1.12159 6.6269 3.1745 9.00026 4.57649C11.9745 4.97706 13.4766 1.16165 16.3907 1.02145C18.674 2.26321 20.5266 4.13587 22.5595 5.72812C24.1918 4.10582 25.734 2.35334 27.6367 1.02145C30.7111 1.63232 32.6338 4.62656 35.3977 5.97848C37.1802 4.33615 38.5021 0.670952 41.4463 1.31186C43.3189 2.63374 44.8711 4.34616 46.5736 5.87834C48.5564 4.26605 50.5192 2.63374 52.522 1.04148C54.6751 2.73388 56.6378 5.39766 59.592 5.44773C60.9139 4.78679 62.1056 3.90554 63.3574 3.13445C64.8495 4.57649 66.7221 5.4277 68.7951 5.638C68.8852 5.01712 69.0655 3.77535 69.1556 3.14446C69.7765 2.67379 71.0182 1.71243 71.6391 1.24176C73.7521 3.37479 75.9152 5.4978 78.5289 7.01996C80.0711 5.1473 81.8035 3.44489 83.6762 1.9027C86.1797 3.65518 88.3829 5.7782 90.5059 7.96129C92.3485 5.93842 94.4114 4.11584 96.5845 2.45348C99.078 4.87692 101.642 7.28033 104.716 8.96271C106.298 7.07003 107.891 5.18736 109.563 3.36477C110.785 4.69666 112.016 6.02855 113.248 7.36044C113.328 6.51925 113.478 4.82685 113.549 3.98565C116.122 5.638 118.175 8.91264 121.48 8.85256C123.463 7.57074 125.145 5.88835 126.938 4.34616C129.521 6.35902 131.875 9.95412 135.51 9.66371C137.442 8.41193 138.854 6.51925 140.527 4.96704C142.63 7.18018 145.043 9.05284 147.637 10.6551C150.291 9.47344 152.394 7.50064 153.986 5.08722C154.567 6.11868 155.148 7.15014 155.738 8.19162C157.351 9.15298 158.873 10.4348 160.756 10.8153C163.479 10.2646 165.172 7.76101 167.054 5.92841C169.768 7.48061 171.771 10.2646 174.625 11.4262C177.129 10.2245 179.412 8.52209 180.984 6.19879C183.428 8.00135 185.631 10.1744 188.305 11.6665C190.688 12.5678 192.511 10.3146 194.313 9.163C194.413 8.3919 194.614 6.84972 194.704 6.07862C196.707 7.86115 198.649 9.71378 200.582 11.5664C201.954 11.1158 203.316 10.6651 204.688 10.2145C205.569 8.68231 206.591 7.24027 207.702 5.85831C210.085 7.79105 212.479 9.70376 214.902 11.5764C216.785 9.63366 218.738 7.77102 220.741 5.94844C222.603 7.46058 224.466 8.97273 226.339 10.4849C227.38 10.4749 228.432 10.4548 229.483 10.4348C230.725 8.77244 232.087 7.20021 233.579 5.76818C235.471 7.49062 237.314 9.43338 239.758 10.3847C243.042 10.9555 243.633 6.05859 246.717 6.15873C248.951 7.41051 250.833 9.19304 252.836 10.7753C254.829 8.89261 256.812 6.99993 258.845 5.16733C261.028 6.74957 262.69 10.1644 265.784 9.70376C267.938 8.55213 269.36 5.82827 271.833 5.53785C273.505 6.70952 274.978 8.15156 276.48 9.54354C277.291 9.54354 278.102 9.53352 278.923 9.53352C280.585 7.98132 281.897 4.69666 284.621 5.2875C286.554 6.57933 288.196 8.2517 289.969 9.75383C292.012 7.87116 294.045 5.98849 296.087 4.10582C298.17 5.85831 300.173 7.70092 302.106 9.62365C303.989 7.74098 305.741 5.64801 308.014 4.19595C310.748 4.53643 312.541 7.35042 314.844 8.73239C316.566 7.22024 318.159 5.53785 320.112 4.30611C323.206 3.78537 324.638 8.23168 327.792 7.69091C329.415 6.36903 330.757 4.7267 332.399 3.41484C334.872 3.27464 336.395 5.92841 338.227 7.25028C340.861 6.11868 342.984 4.18594 344.997 2.20312C346.91 3.90554 348.902 5.52784 350.995 7.01996C353.168 5.30753 354.881 2.113 357.955 2.1831C359.608 3.2446 360.909 4.75675 362.281 6.14872C365.065 5.09723 367.118 2.87408 369.231 0.871236C371.705 2.76392 374.018 4.91697 376.852 6.29893C378.715 4.09581 380.828 2.113 383.261 0.550781C383.331 11.0557 383.481 21.5606 383.291 32.0655C382.079 43.4917 379.976 54.8378 379.215 66.3141C379.135 65.7633 378.985 64.6717 378.915 64.1209C378.224 76.839 376.061 89.4268 375.31 102.135C372.676 126.399 374.258 150.844 372.866 175.168C372.526 232.289 372.836 289.41 372.816 346.531C372.826 375.893 372.566 405.255 372.616 434.616C372.576 449.978 371.454 465.49 373.988 480.732C375.961 496.534 378.705 512.226 381.459 527.909C381.959 537.552 381.679 547.236 381.539 556.9C378.925 555.047 376.441 553.024 373.998 550.971C371.975 552.664 370.153 554.607 368.05 556.209C365.165 556.259 364.154 552.003 361.2 551.933C359.127 553.475 357.294 555.318 355.221 556.87C353.279 554.777 351.256 552.764 349.053 550.951C347.05 552.924 345.077 554.927 343.044 556.88C340.981 554.937 338.948 552.984 336.885 551.062C334.792 552.824 332.83 554.737 330.877 556.66C328.844 555.007 326.981 553.155 324.868 551.602C322.134 552.043 320.392 554.957 318.159 556.519C316.156 554.707 314.143 552.904 312.09 551.152C310.318 552.694 308.645 554.376 306.672 555.658C303.758 555.518 302.126 552.454 299.933 550.881C297.88 552.494 295.857 554.156 293.874 555.858C291.751 554.246 289.698 552.544 287.736 550.751C285.392 552.333 283.139 554.046 280.886 555.758C278.563 554.226 276.63 551.733 273.856 551.122C271.833 552.544 270.241 554.597 267.938 555.588C265.684 554.276 263.792 552.444 261.829 550.761C259.395 552.053 257.593 554.787 254.899 555.328C252.826 553.956 251.064 552.143 248.87 550.971C246.507 552.113 244.665 554.026 242.702 555.708C240.378 554.296 238.616 551.763 236.032 550.961C233.599 551.943 231.896 554.176 229.854 555.778C227.741 554.076 225.648 552.353 223.595 550.581C221.351 552.153 219.178 553.856 216.995 555.528C215.263 553.956 213.641 552.233 211.688 550.931C208.683 550.871 207.031 554.156 204.798 555.768C202.785 554.126 200.963 552.183 198.639 550.971C195.985 551.743 194.133 554.156 191.9 555.698C189.847 554.106 187.934 552.313 185.641 551.082C182.967 551.622 181.144 554.236 178.861 555.648C177.059 554.016 175.276 552.383 173.514 550.721C171.01 551.993 168.797 553.745 166.764 555.658C165.092 554.056 163.429 552.434 161.767 550.821C159.644 552.213 157.611 553.765 155.678 555.428C153.685 554.226 151.793 552.824 149.65 551.903C147.016 552.313 144.873 554.076 142.66 555.438C140.397 554.296 138.394 552.353 135.84 551.983C133.297 552.894 131.133 554.647 128.54 555.448C125.626 555.047 123.433 552.644 120.609 551.913C117.915 552.343 116.513 555.588 113.829 556.109C111.586 554.647 109.653 552.784 107.62 551.062C105.617 552.824 103.745 554.727 101.622 556.339C98.9779 555.278 97.1253 552.904 94.8721 551.232C92.8192 553.024 90.7562 554.797 88.6532 556.529C86.6103 554.717 84.6075 552.864 82.6047 551.022C80.1612 552.604 77.938 554.506 75.7549 556.439C73.702 554.627 71.6591 552.794 69.6062 550.982C67.4732 552.824 65.2801 554.597 62.9167 556.149C60.954 554.246 58.851 552.504 56.6378 550.921C54.655 552.864 52.6622 554.787 50.5993 556.65C48.3561 555.137 46.7238 551.672 43.7095 551.953C41.8969 553.265 40.4449 554.997 38.6523 556.349C36.0586 555.828 34.6066 553.114 32.3734 551.823C29.4893 552.193 27.9371 555.238 25.6539 556.78C23.8013 555.077 21.9887 553.355 20.2362 551.552C17.5324 552.714 15.4995 554.867 13.4466 556.9C11.4437 555.388 9.61113 553.675 7.61831 552.163C4.71419 552.884 2.76142 555.598 0.127681 557C-0.0525745 547.296 -0.0225321 537.572 0.0976384 527.869C3.18201 510.114 6.95737 492.479 10.222 474.763C13.1461 462.256 11.7341 449.317 11.9144 436.609C10.953 407.929 10.3221 379.178 11.8643 350.507C12.0646 292.775 11.8743 235.043 11.7241 177.312C10.9931 165.264 11.2535 153.187 10.8629 141.12C9.91156 125.458 9.70126 109.756 8.15907 94.1335C6.66696 76.0679 4.3036 58.0924 2.10048 40.1069C1.51966 36.5018 2.71135 32.8666 2.06042 29.2715C1.50964 31.5848 1.73997 33.9682 1.56973 36.3115C1.23926 32.8866 1.18919 29.4317 1.4796 25.9969C2.21064 17.3546 1.80005 8.66229 2.14054 0Z';

// Scene design base: 393 × 852 (standard portrait phone)
const DW = 393;

// Pack placement in design coords
const PX = 91;   // left
const PY = 148;  // top
const PW = 235;  // width
const PH = 341;  // height  (≈ PW / (275/400))
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

  const tick = useCallback((now: number) => {
    const progress = Math.min((now - startRef.current) / 700, 1);
    setCharge(progress * 100);
    if (progress >= 1) {
      setPhase('tearing');
      setTimeout(() => { setPhase('done'); onComplete?.(); }, 420);
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [onComplete]);

  const pointerStartX = useRef(0);
  const pointerStartTime = useRef(0);

  const triggerTear = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setCharge(100);
    setPhase('tearing');
    setTimeout(() => { setPhase('done'); onComplete?.(); }, 420);
  }, [onComplete]);

  const startCharge = useCallback((e: React.PointerEvent) => {
    if (phase !== 'idle') return;
    pointerStartX.current = e.clientX;
    pointerStartTime.current = performance.now();
    setPhase('charging');
    setCharge(0);
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [phase, tick]);

  const cancelCharge = useCallback((e: React.PointerEvent) => {
    const dx = e.clientX - pointerStartX.current;
    const dt = performance.now() - pointerStartTime.current;
    const vx = dx / Math.max(dt, 1) * 1000; // px/s
    // Right swipe: distance > 40px OR velocity > 300px/s
    if (dx > 40 || vx > 300) {
      triggerTear();
      return;
    }
    if (phase !== 'charging') return;
    cancelAnimationFrame(rafRef.current);
    setCharge(0);
    setPhase('idle');
  }, [phase, triggerTear]);

  const imgSrc = packImage ?? '/images/card/front.png';

  const packFace = () => (
    <div style={{ position: 'relative', width: PW * s, height: PH * s }}>
      <Image
        src={imgSrc} alt="" fill
        className="object-contain pointer-events-none select-none"
        draggable={false} priority unoptimized
      />
      {charge > 0 && (
        <svg
          viewBox="0 0 384 557"
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
            strokeWidth="5"
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
        src="/images/card/charge/bg.png"
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
        src="/images/card/charge/hand1.png"
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
              onPointerLeave={() => {
                if (phase !== 'charging') return;
                cancelAnimationFrame(rafRef.current);
                setCharge(0);
                setPhase('idle');
              }}
              onPointerCancel={() => {
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
        src="/images/card/charge/hand2.png"
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
