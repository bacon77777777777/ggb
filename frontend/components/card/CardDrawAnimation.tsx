'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import Image from 'next/image';
import MarketValuePop from '@/components/card/MarketValuePop';
import { createClient } from '@/lib/supabase/client';
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

function getCardImage(prize?: Prize | null) {
  if (prize?.image_url) return prize.image_url;
  const raw = (prize?.grade || prize?.rarity || '').toUpperCase();
  if (raw.includes('SSR') || raw.includes('超稀有')) return asset('/images/card/00001.webp');
  if (raw.includes('SR')) return asset('/images/card/00002.webp');
  if (raw.includes('R') || raw.includes('稀有')) return asset('/images/card/00003.webp');
  return asset('/images/card/00004.webp');
}

// 稀有度配色與 SSR 光效已移除 —— 卡片改成只顯示品項原圖，不加任何外框與疊層。

/** 稀有度 → 揭曉音的級別。判斷順序與 getCardImage 一致（SSR 要先於 SR、SR 先於 R） */
function tierOf(prize?: Prize | null): CardTier {
  const raw = (prize?.grade || prize?.rarity || '').toUpperCase();
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

/*
 * 手勢改成**整個畫面**都能操作（老闆 2026-09-01，比照一番賞沈浸式撕紙）。
 *
 * 原本是 framer 的 `drag="x"` 掛在卡片本身，等於玩家得先瞄準手掌上那張
 * 205×286 的卡才拖得動、才點得到。現在改成一層滿版感應層自己收 pointer 事件，
 * 再把位移寫進卡片的 motion value —— 卡片只負責演，不接任何事件。
 *
 * 位移的手感照抄原本的 `dragElastic={{ left: 0.03, right: 1.1 }}`：
 * 往右 1.1 倍（略微放大，跟手指走起來才跟得上），往左幾乎鎖死。
 * 判定門檻（右移 35px／速度 80px/s／輕點）也跟原本一模一樣。
 */
function TopCard({ prize, current, onSwiped, s, fit }: TopCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [CR - 12, CR, CR + 12]);

  const cardW = fit.w;
  const cardH = fit.h;

  /*
   * 這一張已經決定要飛出去了，之後的手勢一律忽略。
   * 快速的小幅度輕甩會同時滿足「輕點」與「速度夠快」兩個條件，不擋會一次跳兩張。
   * 每換一張卡這個元件都會重新掛載（key 是索引），所以 ref 自然歸零。
   */
  const firedRef = useRef(false);
  const startRef = useRef<{ x: number; t: number } | null>(null);

  const flyOut = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    animate(x, 900, { duration: 0.22, ease: [0.2, 0, 0.4, 1], onComplete: onSwiped });
  }, [x, onSwiped]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (firedRef.current) return;
    // 抓住 pointer：手指滑出感應層邊界之後也還收得到 move／up
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, t: performance.now() };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const st = startRef.current;
    if (!st || firedRef.current) return;
    const dx = e.clientX - st.x;
    x.set(dx >= 0 ? dx * 1.1 : dx * 0.03);
  }, [x]);

  const settle = useCallback((clientX: number | null) => {
    const st = startRef.current;
    startRef.current = null;
    if (!st || firedRef.current) return;

    if (clientX === null) {                       // pointercancel：一律彈回去
      animate(x, 0, { type: 'spring', stiffness: 450, damping: 24 });
      return;
    }
    const dx = clientX - st.x;
    const dt = Math.max(1, performance.now() - st.t);
    const vx = (dx / dt) * 1000;                  // px/s，跟 framer 同單位
    // 幾乎沒動＝輕點，跟以前點卡片的行為一樣
    const tapped = Math.abs(dx) <= 10 && dt < 400;
    if (tapped || dx > 35 || vx > 80) { flyOut(); return; }
    animate(x, 0, { type: 'spring', stiffness: 450, damping: 24 });
  }, [x, flyOut]);

  return (
    <>
      {/*
        滿版手勢層。z-index 25：蓋過手指（20）與卡片（12），但仍在 SKIP（z-30）之下，
        SKIP 照樣按得到。提示文字是 z-26 且 pointer-events-none，不會擋在前面。
      */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 25,
          cursor: 'pointer',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        } as React.CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={e => settle(e.clientX)}
        onPointerCancel={() => settle(null)}
        onContextMenu={e => e.preventDefault()}
      />

      <motion.div
        key={`top-${current}`}
        style={{
          x,
          rotate,
          position: 'absolute',
          // 加 offset 讓收合後的卡片維持在原本卡框的中心，才不會從手掌上偏掉
          top: CY * s + fit.offY,
          left: CX * s + fit.offX,
          zIndex: 12,
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        draggable={false}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {/* 就只顯示品項原圖：不加圓角、不加陰影、不加底色、不疊光效。
            品項圖本身多半是去背 PNG，任何外框或底色都會在圖的外緣露出一圈方形，
            比不加還醜。框的尺寸由 useFittedBox 收成與圖同比例，所以 contain
            剛好填滿、不會有留白。 */}
        <div style={{ width: cardW, height: cardH, position: 'relative' }}>
          <Image src={getCardImage(prize)} alt={prize?.name ?? ''} fill className="object-contain" unoptimized priority />
        </div>
      </motion.div>
    </>
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

  /*
   * 「新的一場演出」要在**這一次 render 就歸零**，不能等 useEffect。
   *
   * 原本是 `useEffect(..., [isOpen, prizes])`，effect 在 commit 之後才跑 ——
   * isOpen 由 false 翻 true 的那一個 render，phase 還是上一場結束時的 'swipe'、
   * swipeIndex 還停在上一場的最後一張。上一場十連（swipeIndex=9）、這一場單抽
   * （prizes.length=1）時就會去讀 prizes[9] = undefined，整頁掛掉：
   *   TypeError: undefined is not an object (evaluating 'e.image_url')
   * （老闆 2026-09-01 回報，商品 761 [天井]プチュンオールスター）
   *
   * 這是 React 官方的「render 期依 prop 調整 state」寫法：setState 之後 React
   * 會丟掉這次的輸出重跑，壞掉的畫面根本不會被 commit。
   */
  const [session, setSession] = useState<Prize[] | null>(null);
  if (isOpen && session !== prizes) {
    setSession(prizes);
    setPhase('pack');
    setSwipeIndex(0);
    setIsLoading(true);
  } else if (!isOpen && session !== null) {
    setSession(null);
  }

  // Responsive scale for swipe scene
  const swipeSceneRef = useRef<HTMLDivElement>(null);
  const [sceneDimW, setSceneDimW] = useState(DW);
  const s = sceneDimW / DW;

  /* 保險用的夾範圍索引：上面的 render 期歸零已經擋掉已知的越界，
     但這疊卡是靠索引在讀的，任何一條沒想到的路徑都不該讓整頁掛掉 */
  const topIndex = prizes.length ? Math.min(Math.max(swipeIndex, 0), prizes.length - 1) : 0;
  const [pop, setPop] = useState<{ value: number | null; trigger: string; grade?: string } | null>(null);
  /* 後台模組參數（machine_theme_params.card_pack）的「翻牌市價數字」開關；讀不到就當開 */
  const [marketPopOn, setMarketPopOn] = useState(true);
  useEffect(() => {
    createClient().from('machine_theme_params').select('params').eq('theme', 'card_pack').maybeSingle()
      .then(({ data }) => { const v = (data?.params as { marketPop?: boolean } | null)?.marketPop; if (v === false) setMarketPopOn(false); }, () => {});
  }, []);

  /*
   * 整疊卡共用一個尺寸，由「目前最上面那張」的圖片比例決定。
   *
   * 卡框固定 63:88，但品項圖什麼比例都有，直接套框會裁掉內容；讓每張各自
   * 貼合自己的圖又會讓後排比前排大、整張露到手掌外面。折衷是整疊統一用
   * 最上面那張的尺寸 —— 後排本來就幾乎全被手掌與前一張擋住，比例差一點看不出來。
   */
  const deckFit = useFittedBox(
    prizes.length ? getCardImage(prizes[topIndex]) : '',
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
    const t = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(t);
  }, [isOpen, prizes]);

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
    const prize = prizes[topIndex];
    if (!prize) return;
    const tier = tierOf(prize);
    sfxRevealTier(tier);
    // 翻牌體感數字（MarketValuePop）：這張卡有行情就跳；同一張只跳一次（trigger = id）
    setPop({ value: prize.market_display_value ?? null, trigger: prize.id, grade: prize.grade ?? prize.rarity });
    // 高稀有的揭曉比較長，音樂讓開一下再回來
    if (tier === 'sr' || tier === 'ssr') {
      setPackDucking(true);
      const t = setTimeout(() => setPackDucking(false), tier === 'ssr' ? 2400 : 1400);
      return () => clearTimeout(t);
    }
  }, [isOpen, phase, topIndex, prizes]);

  const handleSwiped = useCallback(() => {
    sfxCardSlide();
    const next = topIndex + 1;
    if (next >= prizes.length) {
      sfxPackFinale();
      onGoToWarehouse();
    } else {
      setSwipeIndex(next);
    }
  }, [topIndex, prizes.length, onGoToWarehouse]);

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

        {/* 只在揭曉階段掛，卡包還沒開的畫面不可能跳數字（老闆 2026-09-03） */}
        {phase === 'swipe' && (
          <MarketValuePop value={pop?.value} trigger={pop?.trigger ?? null} grade={pop?.grade} enabled={marketPopOn} />
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
                const idx = topIndex + depth;
                if (idx >= prizes.length) return null;
                return <DepthCard key={`depth-${idx}`} prize={prizes[idx]} depth={depth} s={s} fit={deckFit} />;
              })}

              {/* Top draggable card */}
              <AnimatePresence>
                {prizes[topIndex] && (
                  <TopCard
                    key={topIndex}
                    prize={prizes[topIndex]}
                    current={topIndex}
                    onSwiped={handleSwiped}
                    s={s}
                    fit={deckFit}
                  />
                )}
              </AnimatePresence>

              {/*
                操作提示（老闆 2026-09-01）：位置與樣式跟蓄力開包那行完全一樣 ——
                兩個畫面是同一個場景，提示落在同一處、長得一樣，眼睛不用重新找。
                最後一張改成「看結果」，不然滑完會以為還有下一張。
              */}
              <motion.div
                className="absolute left-1/2 flex flex-col items-center"
                style={{ top: '78%', width: 220 * s, marginLeft: -110 * s, zIndex: 26, pointerEvents: 'none' }}
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
                  {topIndex >= prizes.length - 1 ? '點擊或右滑看結果' : '點擊或右滑換下一張'}
                </span>
              </motion.div>

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
