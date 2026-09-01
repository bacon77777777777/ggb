'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import {
  initCardPackAudio, sfxPackGrab, startCharge as startChargeSfx, updateCharge,
  endChargeComplete, endChargeCancel, sfxChargeTick, sfxPackTear, sfxBurst, setPackDucking,
} from '@/lib/cardPackSfx';
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
 * **形狀來自 `public/images/card/mask.svg`，手動轉成 path 內嵌在這裡。**
 * 之所以不直接載那個檔：這條線靠 `strokeDasharray`／`strokeDashoffset`
 * 隨蓄力進度長出來，要拿得到 path 本身，用 <img> 或 CSS mask 都做不到。
 * ⚠️ mask.svg 之後再改，這裡要跟著轉一次，否則線會跟卡包外框對不上。
 *
 * 2026-09-02 老闆把 mask.svg 換成 **1240×2340 的純矩形**（`<rect>`，沒有 rx），
 * 取代了原本 822×1560 那條手繪的波浪外框 —— 所以黃線現在是直角矩形。
 * 轉換時把四邊各**往內縮半個線寬**（8 = strokeWidth 16 ÷ 2）：
 * 描邊是跨在路徑上的，路徑貼著 viewBox 邊緣的話外側那一半會被 SVG 裁掉，
 * 四邊看起來就只有一半粗。
 */
const LIGHT_VIEWBOX = '0 0 1240 2340';
const LIGHT_PATH = 'M8 8H1232V2332H8Z';

// Scene design base: 393 × 852 (standard portrait phone)
const DW = 393;

// Pack placement in design coords
/*
 * 卡包在場景座標裡的位置與大小。
 *
 * 2026-08-30 跟著新卡包改：**框的比例原本還是舊卡包的 1 : 1.451**，
 * 而卡包圖是 `object-contain`，新圖（1 : 1.887）塞進去只佔 180.7px 寬、
 * 左右各空 27px —— 黃線是畫滿整個框的，於是比卡包寬 54px，整條浮在外面。
 * 現在框改成 mask 的比例，線才貼著卡包邊緣。
 * PX 一併右移，讓卡包在螢幕上的位置跟改之前一樣（118.1~298.9 → 119~299）。
 * 2026-09-02 mask 換成 1240×2340 之後比例由 1 : 1.898 變 1 : 1.887，PH 342 → 340。
 */
const PX = 119;  // left
const PY = 148;  // top
const PW = 180;  // width
const PH = 340;  // height （= PW × mask 的 2340/1240）
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

    // 聲音掛在**同一組**震動節點上，手感與聽感才會完全同步（老闆 2026-08-30）
    while (hapticIdx.current < HAPTIC_STOPS.length && progress >= HAPTIC_STOPS[hapticIdx.current]) {
      sfxChargeTick(hapticIdx.current, HAPTIC_STOPS.length);
      hapticIdx.current++;
      hapticLight();
    }
    // 持續音的音高與濾波跟著 charge% 走 —— 這是「能量在累積」的來源
    updateCharge(progress);

    if (progress >= 1) {
      hapticMedium();            // 蓄滿：明顯較重的一下，不用看畫面也知道
      endChargeComplete();       // 直接收掉，尾巴會糊掉撕裂的瞬間
      setPackDucking(true);      // 撕開這一下要乾淨，音樂讓開
      sfxPackTear();
      setTimeout(() => sfxBurst(), 120);
      setTimeout(() => setPackDucking(false), 1200);
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
    endChargeComplete();
    setPackDucking(true);
    sfxPackTear();
    setTimeout(() => sfxBurst(), 120);
    setTimeout(() => setPackDucking(false), 1200);
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
    // iOS 的 AudioContext 必須在使用者手勢裡建立，所以在這裡才 init
    initCardPackAudio();
    sfxPackGrab();
    startChargeSfx();
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [phase, tick]);

  const cancelCharge = useCallback((e: React.PointerEvent) => {
    /*
     * 感應區改成全螢幕之後，這個 handler 在 tearing／done 期間也還在 ——
     * 沒有這道閘，撕開的當下再滑一下就會第二次觸發 triggerTear，
     * onComplete 被叫兩次。以前卡包按鈕在 tearing 時整個被卸載，所以碰不到。
     */
    if (phase !== 'charging') return;
    const dx = e.clientX - pointerStartX.current;
    const dt = performance.now() - pointerStartTime.current;
    const vx = dx / Math.max(dt, 1) * 1000; // px/s
    // Right swipe triggers full charge-complete effect (flash + particles + tear)
    if (dx > 40 || vx > 300) {
      triggerTear();
      return;
    }
    cancelAnimationFrame(rafRef.current);
    endChargeCancel();           // 沒蓄滿：能量往下滑掉
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
            /*
             * 光暈加強（老闆 2026-09-02）。單一 4px 的 drop-shadow 只是把線的邊
             * 糊掉，看起來像沒對焦而不是在發光。改成三層疊：**近的一層小而亮**
             * 撐出光的核心、**中間一層**是主要的暈、**最外一層大而淡**負責把光
             * 灑到卡包外面。半徑是 CSS px（filter 吃的是元素的 CSS 座標，
             * 不是 viewBox 單位），所以不會因為 viewBox 換成 1240 就跟著變大。
             */
            filter: [
              'drop-shadow(0 0 3px rgba(255,235,150,1))',
              'drop-shadow(0 0 10px rgba(255,205,50,0.95))',
              'drop-shadow(0 0 26px rgba(255,180,20,0.7))',
            ].join(' '),
          }}
        >
          <path
            d={LIGHT_PATH}
            fill="none"
            stroke="rgb(255,215,80)"
            /* 線寬照 viewBox 等比放大：原本 5/384 ≈ 1.3% 寬，1240 寬的 viewBox 要 16 */
            strokeWidth="16"
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

            {/* 純視覺：按壓由下面那層全螢幕感應區負責（老闆 2026-09-01） */}
            <motion.div
              style={{
                display: 'block',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                pointerEvents: 'none',
                transform: `rotate(${PR}deg)`,
                transformOrigin: 'center',
              } as React.CSSProperties}
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
            </motion.div>
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

      {/*
        層 4：全螢幕感應區（老闆 2026-09-01，比照一番賞沈浸式撕紙）。

        以前只有卡包本身可以按 —— 卡包在 393 寬的場景裡只佔 180px，
        玩家得先瞄準畫面中間那一小塊才蓄得了力，按到旁邊完全沒反應。
        現在按哪裡都算，卡包只負責演。

        z-index 給 4：蓋過卡包與手（0~3），但仍在外層 SKIP（z-30）之下 ——
        這個元件的根是 `position: relative` 且沒有 z-index，不會生出堆疊脈絡，
        所以這裡的 4 是直接跟 SKIP 的 30 比大小的，SKIP 照樣按得到。
      */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 4,
          cursor: 'pointer',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
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
      />

      {/*
        操作提示。位置與樣式照抄一番賞沈浸式撕紙那行（老闆 2026-09-01）：
        手指圖示 ＋ 一行帶陰影的白字，慢慢呼吸。

        高度用 78% 不是沈浸式的 72%：這個場景的手掌是 490*s 寬、
        從 230*s 一路蓋到約 640*s（1079×904 的圖等比縮放），
        72% 會壓在手上；78% 剛好落在手下方、又還在 SKIP 之上。

        放手沒蓄滿會退回 idle，提示就跟著回來 —— 沒撕開的人一定看得到指引。
      */}
      {phase === 'idle' && (
        <motion.div
          className="absolute left-1/2 flex flex-col items-center"
          style={{ top: '78%', width: 200 * s, marginLeft: -100 * s, zIndex: 5, pointerEvents: 'none' }}
          animate={{ opacity: [0.35, 1, 1, 0.35] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.25, 0.75, 1] }}
        >
          {/* 先壓下去、再往右滑 —— 兩種操作各演一次 */}
          <motion.div
            style={{ width: 52 * s, height: 52 * s, position: 'relative' }}
            animate={{ x: [0, 0, 44 * s, 0], scale: [1, 0.88, 0.88, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.22, 0.68, 1] }}
          >
            <Image src={asset('/images/finger.png')} alt="" fill className="object-contain drop-shadow-md" unoptimized />
          </motion.div>
          <span
            className="mt-1 whitespace-nowrap font-black text-white/90"
            style={{ fontSize: 13 * s, letterSpacing: '0.1em', textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}
          >
            按住或右滑撕開
          </span>
        </motion.div>
      )}

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
