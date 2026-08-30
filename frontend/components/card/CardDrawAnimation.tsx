'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import Image from 'next/image';
import type { Prize } from '@/components/GachaMachine';
import BoosterPackOpenEffect from './BoosterPackOpenEffect';
import SoundToggle from '@/components/ui/SoundToggle';
import { asset } from '@/lib/asset';
import { BouncingCapsule } from '@/components/ui/BouncingCapsule';
import {
  initCardPackAudio, disposeCardPackAudio, startPackMusic, setPackHype, setPackDucking,
  sfxRevealTier, sfxCardSlide, sfxPackFinale, type CardTier,
} from '@/lib/cardPackSfx';

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
  if (raw.includes('SSR') || raw.includes('超稀有')) return asset('/images/card/00001.webp');
  if (raw.includes('SR')) return asset('/images/card/00002.webp');
  if (raw.includes('R') || raw.includes('稀有')) return asset('/images/card/00003.webp');
  return asset('/images/card/00004.webp');
}

// 稀有度配色與 SSR 光效已移除 —— 卡片改成只顯示品項原圖，不加任何外框與疊層。

/** 稀有度 → 揭曉音的級別。判斷順序與 getCardImage 一致（SSR 要先於 SR、SR 先於 R） */
function tierOf(prize: Prize): CardTier {
  const raw = (prize.grade || prize.rarity || '').toUpperCase();
  if (raw.includes('SSR') || raw.includes('超稀有')) return 'ssr';
  if (raw.includes('SR')) return 'sr';
  if (raw.includes('R') || raw.includes('稀有')) return 'r';
  return 'n';
}

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
/**
 * 把卡框縮到剛好貼合圖片比例
 *
 * 卡框是固定的 63:88，但品項圖什麼比例都有（PSA 鑑定卡是細長的 0.60）。
 * 用 object-contain 雖然不裁切，卻會在兩側留白 —— 留白墊底色就是黑邊、
 * 不墊底色就透出後面的店舖場景，兩個都難看。
 *
 * 所以不要留白：量出圖片實際比例，把框縮成一樣的比例。回傳的 offX/offY
 * 是為了讓縮小後的卡片**維持在原本卡框的中心點**，不然它會從手掌上偏掉。
 *
 * 圖還沒載到就先照原本的框走，載完再收合，中途不會跳位（中心點不變）。
 */
type FittedBox = { w: number; h: number; offX: number; offY: number };

function useFittedBox(src: string, boxW: number, boxH: number): FittedBox {
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const probe = new window.Image();
    probe.onload = () => {
      if (alive && probe.naturalHeight > 0) setRatio(probe.naturalWidth / probe.naturalHeight);
    };
    probe.src = src;
    return () => { alive = false; };
  }, [src]);

  if (!ratio) return { w: boxW, h: boxH, offX: 0, offY: 0 };
  const tall = ratio < boxW / boxH;             // 圖比框瘦 → 以高為準
  const w = tall ? boxH * ratio : boxW;
  const h = tall ? boxH : boxW / ratio;
  return { w, h, offX: (boxW - w) / 2, offY: (boxH - h) / 2 };
}

/**
 * 疊在最上面那張後面的兩張卡（只是視覺厚度，不能點）
 *
 * 抽成獨立元件是因為 useFittedBox 是 hook，不能在 .map() 的 callback 裡呼叫。
 */
function DepthCard({ prize, depth, s, fit }: { prize: Prize; depth: number; s: number; fit: FittedBox }) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        top: (CY + depth * 6) * s + fit.offY,
        left: (CX - depth * 8) * s + fit.offX,
        width: fit.w,
        height: fit.h,
        /* 圖層順序（同一個場景裡）：
         *   hand1 手掌 = 1 ／ 後排卡 = 9、8 ／ 最上面那張 = 12 ／ hand2 手指 = 20
         * 原本後排卡是 `2 - depth`，算出來是 0 和 1 —— 跟手掌同層甚至更後面，
         * 卡就會從手掌邊緣露出來，看起來像獎項圖跑到手的後面。
         * 全部提到手掌之上、手指之下，才是「拿在手裡」該有的層次。 */
        zIndex: 10 - depth,
        pointerEvents: 'none',
        rotate: CR + depth * 4,
        scale: 1 - depth * 0.04,
        opacity: 1 - depth * 0.22,
      }}
      animate={{ scale: 1 - depth * 0.04, opacity: 1 - depth * 0.22 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      <Image src={getCardImage(prize)} alt="" fill className="object-contain" unoptimized draggable={false} />
    </motion.div>
  );
}

interface TopCardProps {
  prize: Prize;
  current: number;
  onSwiped: () => void;
  s: number;
  fit: FittedBox;
}

function TopCard({ prize, current, onSwiped, s, fit }: TopCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [CR - 12, CR, CR + 12]);
  // Track drag distance to distinguish real click from drag-end
  const dragDeltaRef = useRef(0);

  const cardW = fit.w;
  const cardH = fit.h;

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
        // 加 offset 讓收合後的卡片維持在原本卡框的中心，才不會從手掌上偏掉
        top: CY * s + fit.offY,
        left: CX * s + fit.offX,
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
      {/* 就只顯示品項原圖：不加圓角、不加陰影、不加底色、不疊光效。
          品項圖本身多半是去背 PNG，任何外框或底色都會在圖的外緣露出一圈方形，
          比不加還醜。框的尺寸由 useFittedBox 收成與圖同比例，所以 contain
          剛好填滿、不會有留白。 */}
      <div style={{ width: cardW, height: cardH, position: 'relative' }}>
        <Image src={getCardImage(prize)} alt={prize.name} fill className="object-contain" unoptimized priority />
      </div>

    </motion.div>
  );
}

// ── 等待動畫：全站統一的彈跳轉蛋球（老闆 2026-08-30，原本是 IP 角色輪播）──
function CardLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-[1200] bg-black flex flex-col items-center justify-center gap-4">
      <BouncingCapsule size={40} />
      <motion.p
        className="text-white/60 text-xs font-black tracking-widest"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        載入中
      </motion.p>
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

  /*
   * 整疊卡共用一個尺寸，由「目前最上面那張」的圖片比例決定。
   *
   * 卡框固定 63:88，但品項圖什麼比例都有，直接套框會裁掉內容；讓每張各自
   * 貼合自己的圖又會讓後排比前排大、整張露到手掌外面。折衷是整疊統一用
   * 最上面那張的尺寸 —— 後排本來就幾乎全被手掌與前一張擋住，比例差一點看不出來。
   */
  const deckFit = useFittedBox(
    prizes.length ? getCardImage(prizes[Math.min(swipeIndex, prizes.length - 1)]) : '',
    CW * s,
    CH * s,
  );

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

  /*
   * 音效（lib/cardPackSfx）：開包畫面全程鋪背景音樂；**多張才另外鋪醞釀底**——
   * 單抽只有 700ms 的蓄力，鋪什麼 loop 都來不及成形（老闆 2026-08-30）。
   */
  useEffect(() => {
    if (!isOpen) return;
    initCardPackAudio();
    startPackMusic();
    return () => { disposeCardPackAudio(); };
  }, [isOpen]);

  useEffect(() => {
    setPackHype(isOpen && phase === 'pack' && prizes.length > 1);
  }, [isOpen, phase, prizes.length]);

  // 每張卡輪到最上面就是它的「揭曉」時刻，依稀有度分四級
  useEffect(() => {
    if (!isOpen || phase !== 'swipe') return;
    const prize = prizes[swipeIndex];
    if (!prize) return;
    const tier = tierOf(prize);
    sfxRevealTier(tier);
    // 高稀有的揭曉比較長，音樂讓開一下再回來
    if (tier === 'sr' || tier === 'ssr') {
      setPackDucking(true);
      const t = setTimeout(() => setPackDucking(false), tier === 'ssr' ? 2400 : 1400);
      return () => clearTimeout(t);
    }
  }, [isOpen, phase, swipeIndex, prizes]);

  const handleSwiped = useCallback(() => {
    sfxCardSlide();
    const next = swipeIndex + 1;
    if (next >= prizes.length) {
      sfxPackFinale();
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
      {/* 掛在最外層而不是各 phase 裡面：開卡包與滑卡是兩個會互相切換的區塊，
          放進去會跟著 AnimatePresence 一起淡出淡入，位置也會被裡層的 transform 帶跑 */}
      <SoundToggle safeTop className="absolute top-4 right-4 z-[1300]" />
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
                src={asset("/images/card/charge/bg.webp")}
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
                src={asset("/images/card/charge/hand1.webp")}
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

              {/* Depth cards — fanned slightly behind top card
                  三張卡共用最上面那張算出來的尺寸（deckFit）。
                  之前讓每張各自貼合自己的圖，結果後排的圖比較寬就整張超出手掌
                  輪廓露在外面，看起來像有張獎項圖跑到手的後面。 */}
              {[2, 1].map(depth => {
                const idx = swipeIndex + depth;
                if (idx >= prizes.length) return null;
                return <DepthCard key={`depth-${idx}`} prize={prizes[idx]} depth={depth} s={s} fit={deckFit} />;
              })}

              {/* Top draggable card */}
              <AnimatePresence>
                <TopCard
                  key={swipeIndex}
                  prize={prizes[swipeIndex]}
                  current={swipeIndex}
                  onSwiped={handleSwiped}
                  s={s}
                  fit={deckFit}
                />
              </AnimatePresence>

              {/* hand2 — in front of card, same position as charge screen */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset("/images/card/charge/hand2.webp")}
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
