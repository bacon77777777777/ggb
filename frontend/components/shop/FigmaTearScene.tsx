'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import SoundToggle from '@/components/ui/SoundToggle';
import {
  bigRip, crackle, flashPop, spawnConfetti, unlockTearAudio,
  sfxTicketDrop, sfxGrab, sfxTension, sfxFlutter, sfxBounceBack,
  sfxRiser, sfxRevealCommon, sfxRevealGrand, sfxInterlude,
  startTearMusic, stopTearMusic, setTearDucking,
} from '@/lib/tearSfx';
import { isSoundMuted } from '@/lib/soundPrefs';
import { asset } from '@/lib/asset';

declare global {
  interface Window { jQuery: any }
}

interface FigmaTearSceneProps {
  prizeTierLetter: string;
  onDone?: () => void;
  initialDone?: boolean;
  isLast?: boolean;
  onNext?: () => void;
  onOpenAll?: () => void;
  onBack?: () => void;
}

export default function FigmaTearScene({
  prizeTierLetter,
  onDone,
  initialDone = false,
  isLast = true,
  onNext,
  onOpenAll,
  onBack,
}: FigmaTearSceneProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const flipbookRef   = useRef<HTMLDivElement>(null);
  const [dims, setDims]           = useState({ w: 393, h: 844 });
  const [done, setDone]           = useState(initialDone);
  const [showButton, setShowButton] = useState(initialDone);
  const [showPrize, setShowPrize]  = useState(initialDone);
  const [touched, setTouched]     = useState(false);
  // 防止 auto-trigger 重複呼叫（rare race condition）
  const finishedRef = useRef(false);
  const wrapperRef    = useRef<HTMLDivElement>(null);  // .ichiban-flipbook
  const turnReady     = useRef(false);
  const pressStartX   = useRef<number | null>(null);
  const slideRight    = useRef(false);
  const hasMoved      = useRef(false);  // 任何 pointermove 觸發即為 true，比 slideRight 更早

  /*
   * 獎項文字要等蓋板圖真的載好才顯示。
   *
   * 原本是寫死 `setTimeout(…, 2000)`，註解也直說是「讓 up1.svg 先載入蓋住」——
   * 但那是用猜的秒數。冷快取或網路慢的時候 2 秒不夠，蓋板還沒出現、
   * 獎項文字就先浮上來，玩家還沒撕就看到「A賞」，整個演出直接爆雷。
   *
   * 改成監聽實際的載入完成。MIN_DELAY 是節奏用的下限（避免跟蓋板同一幀出現）；
   * HARD_CAP 是保險 —— 圖真的掛了也不能永遠不顯示，否則撕開後是一片空白。
   */
  useEffect(() => {
    if (initialDone) return;

    const MIN_DELAY = 400;
    const HARD_CAP = 8000;
    const COVER_IMAGES = [
      asset('/images/ichiban-tear/up1.svg'),  // 蓋板正面，就是它擋住獎項
      asset('/images/ichiban-tear/up2.svg'),  // 掀起時的背面
      asset('/images/ichiban-tear/bg.svg'),   // 券底，獎項文字畫在它上面
    ];

    let cancelled = false;
    const startedAt = Date.now();
    let revealTimer: ReturnType<typeof setTimeout> | undefined;

    const reveal = () => {
      if (cancelled) return;
      const wait = Math.max(0, MIN_DELAY - (Date.now() - startedAt));
      revealTimer = setTimeout(() => {
        if (!cancelled) setShowPrize(true);
      }, wait);
    };

    let pending = COVER_IMAGES.length;
    const settle = () => {
      if (--pending <= 0) reveal();
    };

    COVER_IMAGES.forEach((src) => {
      const img = new window.Image();
      // 載失敗也要往下走：蓋板破圖的情況下，「撕開後什麼都沒有」比爆雷更糟
      img.onload = settle;
      img.onerror = settle;
      img.src = src;
    });

    const cap = setTimeout(reveal, HARD_CAP);
    return () => {
      cancelled = true;
      clearTimeout(cap);
      if (revealTimer) clearTimeout(revealTimer);
    };
  }, [initialDone]);

  // Container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 撕完後 1 秒顯示「下一張」按鈕（SKIP 隨時可按）
  useEffect(() => {
    if (!done || showButton) return;
    const t = setTimeout(() => setShowButton(true), 1000);
    return () => clearTimeout(t);
  }, [done, showButton]);

  // 最後一張撕完 → 1 秒自動結束（不等使用者按 SKIP）
  useEffect(() => {
    if (!done || !isLast) return;
    const t = setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      (onOpenAll ?? onBack ?? onDone)?.();
    }, 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, isLast]);

  /*
   * 音效改用 WebAudio 合成（lib/tearSfx，自老闆的 ichiban-tear 原型移植）。
   * 原本是在翻頁動畫**完成之後**才播一顆 0.5 秒的撕紙 mp3，
   * 玩家整段拖曳都是安靜的，聲音永遠慢半拍 —— 這就是「音效對不上」的原因。
   */
  /** 上次觸發細碎聲的位移，每 8px 響一次（同原型） */
  const lastCrackle = useRef(0);
  /** 這次真的撕開了。放手時用它決定要不要把紙彈回去 */
  const tearCompleted = useRef(false);
  /**
   * 按下的位置是否落在左緣的撕取區。
   * 只有這裡按下去 turn.js 才真的會撕；按券中間或右邊拖曳不會撕，
   * 卻照樣觸發撕紙音效與撕開視覺 —— 老闆回報「紙還沒捏起來就有聲音」。
   */
  const inGrabZone = useRef(false);
  /** 上一次 pointermove 的位置與時間 —— crackle 的強度吃「拖多快」而不只是「拖多遠」 */
  const lastMove = useRef<{ x: number; t: number } | null>(null);
  /** 這一次拖曳有沒有已經發過「拉緊」那一聲（只在剛開始拉的時候響一次） */
  const tensionDone = useRef(false);
  /** 演出用的計時器，卸載時要全部清掉 */
  const sfxTimers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    sfxTimers.current.push(window.setTimeout(fn, ms));
  };

  /*
   * 背景音樂（懸念感）與券落定的聲音。
   *
   * 每一張券都是重新掛載這個元件（父層用 key 換），所以音樂會跟著每張重新起頭 ——
   * 中間有間奏聲蓋著，聽起來是「換一張、重新屏息」而不是斷掉。
   */
  useEffect(() => {
    if (initialDone) return;
    startTearMusic();
    const t = window.setTimeout(() => sfxTicketDrop(), 260);
    return () => {
      clearTimeout(t);
      sfxTimers.current.forEach(clearTimeout);
      sfxTimers.current = [];
      stopTearMusic();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 載入 jQuery + turn.js，初始化 flipbook
  useEffect(() => {
    if (done || turnReady.current || !flipbookRef.current) return;

    const injectScript = (src: string): Promise<void> =>
      new Promise<void>(resolve => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
      });

    let cancelled = false;
    // 儲存 jQuery 物件：在 done=true 後 flipbookRef.current 會先變 null，
    // 所以用 closure 變數保存，確保 destroy 在 cleanup 時能正確執行
    let $fbSaved: any = null;

    // 滑動追蹤：capture 相位確保在 turn.js 之前執行
    const getPtEl = () =>
      flipbookRef.current?.querySelector('.p-temporal') as HTMLElement | null;

    const onCapturePointerDown = (e: PointerEvent) => {
      setTouched(true);
      pressStartX.current = e.clientX;
      slideRight.current = false;
      hasMoved.current = false;  // 每次按下重置
      lastCrackle.current = 0;

      // 左緣的撕取區＝ turn.js 的 tl/bl 角，寬度就是 cornerSize（見下方 cs）
      const fb = flipbookRef.current;
      if (fb) {
        const r = fb.getBoundingClientRect();
        const grabW = Math.ceil(r.height / 2) + 4;   // 與 turn.js 的 cornerSize 同式
        /*
         * 要「落在券上」而且「靠左緣」兩個都成立。
         * 先前只判斷 `clientX - left <= grabW`，按在券**左邊外側**的空白處時
         * 這個差是負數、一樣成立，所以捏著手指那一塊拖曳也會出聲（老闆回報）。
         */
        const inX = e.clientX >= r.left && e.clientX - r.left <= grabW;
        const inY = e.clientY >= r.top && e.clientY <= r.bottom;
        inGrabZone.current = inX && inY;
      } else {
        inGrabZone.current = false;
      }

      // iOS 的 AudioContext 必須在使用者手勢裡建立，否則第一次撕會沒聲音
      if (inGrabZone.current && !isSoundMuted()) {
        unlockTearAudio();
        sfxGrab();                       // 捏到了 —— 沒有這一聲玩家不知道自己抓住了
      }
      lastMove.current = null;
      tensionDone.current = false;
    };

    const onCapturePointerMove = (e: PointerEvent) => {
      if (pressStartX.current === null) return;
      hasMoved.current = true;  // 只要有任何移動就設 true（turning gate 用這個）
      // 不是從左緣捏起來的，就不是在撕 —— 不出聲、也不要進入撕開的視覺狀態
      if (!inGrabZone.current) return;
      const dx = e.clientX - pressStartX.current;
      if (dx > 3) {
        slideRight.current = true;
        wrapperRef.current?.classList.add('tearing');
        const pt = getPtEl();
        if (pt) pt.style.visibility = 'visible';
      }
      // 拉緊但還沒撕開：纖維被扯住的悶聲，整段拖曳只響一次
      if (!isSoundMuted() && !tensionDone.current && dx > 6) {
        tensionDone.current = true;
        sfxTension();
      }
      /*
       * 虛線孔一格格裂開的細碎聲：跟著手指走，撕多少響多少。
       * 強度吃**拖曳速度**（px/ms）而不只是距離 —— 慢慢撕是細碎的啵啵，
       * 一口氣扯就是連續的刷，沉浸感差別最大的就是這裡。
       */
      if (!isSoundMuted() && dx - lastCrackle.current > 8) {
        const now = performance.now();
        const prev = lastMove.current;
        const speed = prev ? Math.abs(e.clientX - prev.x) / Math.max(1, now - prev.t) : 0.3;
        lastMove.current = { x: e.clientX, t: now };
        crackle(Math.min(1, 0.25 + speed * 0.5));
        lastCrackle.current = dx;
      }
    };

    const onPointerUp = () => {
      lastCrackle.current = 0;
      inGrabZone.current = false;
      /*
       * 沒撕完就要彈回去。
       * 原本只有「完全沒往右拖」才清掉 tearing —— 拖了一半放手的話，
       * turn.js 的頁面是彈回去了，但我們自己的撕開視覺（tearing class 與
       * 那條虛線）留在原地，紙看起來就一直是撕開的。
       */
      if (!tearCompleted.current) {
        wrapperRef.current?.classList.remove('tearing');
        const pt = getPtEl();
        if (pt) pt.style.visibility = '';
      }
      pressStartX.current = null;
    };

    (async () => {
      if (!window.jQuery)           await injectScript('/js/jquery.min.js');
      if (!window.jQuery?.fn?.turn) await injectScript('/js/turn.js');

      // 等下一個動畫幀：確保前一次交互的 mouseup/pointerup 事件已被瀏覽器清空，
      // 且 DOM layout 穩定（第二次購買無 await 時同步跑到這裡，RAf 提供必要的間隔）
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      if (cancelled || !flipbookRef.current) return;

      const $ = window.jQuery;
      if (!$) return;

      const $fb = $(flipbookRef.current);
      // 防禦：若舊 turn.js 資料殘留在此元素（key 已變不應有，但保險起見），先清除
      try { if ($fb.data('turn')) $fb.turn('destroy'); } catch { /* ignore */ }
      // 核心清理：移除 document 上所有 jQuery drag 事件
      // turn.js 用無 namespace 的 bind，destroy 用 specific handler ref unbind
      // 若上一個 instance 的 destroy 因某原因未執行，殘留 handler 可能阻擋新 instance
      // 本 app 只有 turn.js 會在 document 上 bind mousemove/mouseup，所以全清安全
      try { $(document).off('mousemove mouseup touchmove touchend'); } catch { /* ignore */ }

      document.addEventListener('pointerdown', onCapturePointerDown, true);  // capture
      document.addEventListener('pointermove', onCapturePointerMove, true);  // capture
      document.addEventListener('pointerup',   onPointerUp);

      // cornerSize 超過高度一半 → tl+bl 合起來覆蓋整個 Y 軸；X 軸觸發寬度 = cornerSize
      const fbH = flipbookRef.current.clientHeight || 100;
      const cs  = Math.ceil(fbH / 2) + 4; // +4 確保中間無縫

      $fb.turn({
        display:     'single',
        gradients:   true,
        duration:    800,
        pages:       2,
        direction:   'rtl',
        autoCenter:  false,
        elevation:   0,
        cornerSize:  cs,
        turnCorners: 'tl,bl',
        when: {
          // turning gate 已移除：turn.js 需要拖曳過 50% 才完成，純點擊不會到達，不需攔截
          turned: (_e: Event, page: number) => {
            if (page === 2) {
              tearCompleted.current = true;
              if (!isSoundMuted()) {
                /*
                 * 張力曲線的後半段：撕開（爆）→ 紙片飄落 → **靜半拍** → 揭曉（亮）。
                 * 那個「靜半拍」是刻意的 —— 撕完立刻上號角就不緊張了。
                 * A賞與最後賞給長號角＋亮片，其餘統一清脆 ding（老闆 2026-08-30）。
                 */
                setTearDucking(true);
                bigRip();
                later(() => sfxFlutter(), 220);
                later(() => sfxRiser(0.5), 320);
                const grand = prizeTierLetter === 'LAST' || prizeTierLetter.toUpperCase().startsWith('A');
                later(() => (grand ? sfxRevealGrand() : sfxRevealCommon()), 860);
                later(() => setTearDucking(false), grand ? 2600 : 1600);
              }
              const host = wrapperRef.current?.parentElement ?? wrapperRef.current;
              if (host) {
                // 撕開的同時就撒，等 setDone 之後這個節點就不在了
                if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
                flashPop(host);      // 先鋪黃光，紙屑蓋在它上面
                spawnConfetti(host);
              }
              setTimeout(() => setDone(true), 300);
            } else if (page === 1) {
              if (!isSoundMuted()) sfxBounceBack();
              // 彈回時清除拖曳狀態
              wrapperRef.current?.classList.remove('tearing');
              const pt = getPtEl();
              if (pt) pt.style.visibility = '';
            }
          },
        },
      });

      $fbSaved = $fb;      // 儲存供 cleanup destroy 使用
      turnReady.current = true;
    })();

    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', onCapturePointerDown, true);
      document.removeEventListener('pointermove', onCapturePointerMove, true);
      document.removeEventListener('pointerup',   onPointerUp);
      // 用 closure 儲存的 $fbSaved，避免 flipbookRef.current 已經被 React 設為 null
      if (turnReady.current && $fbSaved) {
        try { $fbSaved.turn('destroy'); } catch { /* ignore */ }
        $fbSaved = null;
        turnReady.current = false;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const s            = dims.w / 393;
  const ticketW      = 255 * s;
  const ticketH      = 124 * s;
  const ticketGroupY = Math.max(0, (dims.h - 843 * s) / 2) + 217 * s;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ minHeight: '100dvh', background: '#111', touchAction: 'none' }}
    >
      {/* 全屏背景 */}
      <Image src={asset("/images/ichiban-tear/bg.webp")} alt="" fill className="object-cover" unoptimized priority />

      {/* 聲音開關：撕紙聲跟中獎音效都在這個畫面響，位置與轉蛋機台同一套 */}
      <SoundToggle safeTop className="absolute top-4 right-4 z-30" />

      {/* 場景群組：手 + 票 */}
      <div
        className="absolute"
        style={{
          top: ticketGroupY, left: -71 * s,
          width: 433 * s, height: 491 * s,
          transform: 'rotate(4deg)',
          pointerEvents: 'none',
        }}
      >
        {/* 手 */}
        <Image
          src={asset("/images/ichiban-tear/hand.webp")} alt="" unoptimized
          style={{
            position: 'absolute', top: 11 * s, left: 5 * s,
            width: 283 * s, height: 467 * s,
            transform: 'rotate(-5deg)', objectFit: 'contain',
            zIndex: 10,
          }}
          width={283} height={467}
        />

        {/* 票 */}
        <div style={{
          position: 'absolute',
          top: 34 * s, left: 178 * s,
          width: ticketW, height: ticketH,
          transform: 'rotate(-12deg)',
          pointerEvents: done ? 'none' : 'auto',
        }}>
          {/* 底層：bg.svg + 獎項文字 */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: 18 * s, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset("/images/ichiban-tear/bg.svg")} alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ opacity: showPrize ? 1 : 0, transition: 'opacity 0.4s' }}
            >
              <div className="flex flex-col items-center w-full pl-[18%]">
                <div className="flex items-baseline gap-1">
                  <span style={{
                    fontSize: prizeTierLetter === 'LAST' ? ticketH * 0.3 : ticketH * 0.5,
                    fontWeight: 900,
                    color: prizeTierLetter === 'LAST' ? '#FFC400' : '#D3D3D3',
                    lineHeight: 1,
                    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                  }}>
                    {prizeTierLetter === 'LAST' ? 'LAST' : prizeTierLetter}
                  </span>
                  <span style={{
                    fontSize: ticketH * 0.22, fontWeight: 900,
                    color: prizeTierLetter === 'LAST' ? '#FFC400' : '#D3D3D3',
                  }}>
                    {prizeTierLetter === 'LAST' ? 'ONE' : '賞'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* turn.js flipbook 貼紙蓋板 */}
          {!done && (
            <>
              <div
                ref={wrapperRef}
                className={`ichiban-flipbook${touched ? ' touched' : ''}`}
                style={{
                  position: 'absolute',
                  left:   53 / 320 * ticketW,
                  top:    12 / 156 * ticketH,
                  width:  242 / 320 * ticketW,
                  height: 133 / 156 * ticketH,
                  overflow: 'visible',
                }}
              >
                <div ref={flipbookRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
                  <div className="sheet cover" />  {/* 第 1 頁：up.svg 貼紙正面 */}
                  <div className="sheet blank" />  {/* 第 2 頁：透明，撕開後露出 bg */}
                </div>
              </div>

              {/* 手指提示 */}
              {!touched && (
                <motion.div
                  style={{
                    position: 'absolute', left: '35%', top: '55%',
                    width: 52 * s, height: 52 * s,
                    pointerEvents: 'none', zIndex: 25,
                  }}
                  animate={{ x: [0, 72*s, 72*s], y: [-8.5*s, -8*s, -8*s], opacity: [0,1,1,0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.5, 0.8, 1] }}
                >
                  <Image src={asset("/images/finger.png")} alt="" fill className="object-contain drop-shadow-md" unoptimized />
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/*
        券右下方的「下一張 ›」提示。
        底部那顆按鈕位置太低、玩家的視線還停在券上，容易沒看到（老闆回報），
        所以在券旁邊再放一個會晃的提示；點它跟點底部按鈕是同一件事。
      */}
      <AnimatePresence>
        {showButton && !isLast && (
          <motion.button
            key="next-hint"
            type="button"
            onClick={() => { if (!isSoundMuted()) sfxInterlude(); (onNext ?? onDone)?.(); }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: 1,
              scale: 1,
              // 左右輕晃：純位移不改大小，才不會跟旁邊的券搶注意力
              x: [0, 4, -3, 3, -2, 0],
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{
              opacity: { duration: 0.25 },
              scale: { duration: 0.25 },
              x: { duration: 1.1, repeat: Infinity, repeatDelay: 1.1, ease: 'easeInOut' },
            }}
            className="absolute z-30 flex items-center gap-1 overflow-hidden rounded-full
                       bg-black/60 px-5 h-10 border border-white/30 backdrop-blur-sm shadow-lg
                       text-white text-sm font-black tracking-[0.25em] active:scale-95"
            style={{ top: '56%', right: '6%' }}
          >
            下一張
            <span aria-hidden className="text-base leading-none">›</span>
            {/* 光劃過特效：沿用原本底部按鈕的做法，參數也一樣 */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-1/2"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
              }}
              initial={{ left: '-50%' }}
              animate={{ left: '150%' }}
              transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
            />
          </motion.button>
        )}
      </AnimatePresence>

      {/*
        底部只留 SKIP。「下一張」改用券旁邊那顆會晃的提示（老闆指定）——
        底部那顆位置太低，玩家視線還停在券上時容易沒看到，兩顆並存也只是重複。
      */}
      <div className="absolute bottom-4 left-4 right-4 z-30 flex items-center justify-end gap-3">
        <button
          onClick={() => {
            if (finishedRef.current) return;
            finishedRef.current = true;
            (onOpenAll ?? onBack ?? onDone)?.();
          }}
          className="shrink-0 px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em] active:scale-95"
        >
          SKIP
        </button>
      </div>
    </div>
  );
}
