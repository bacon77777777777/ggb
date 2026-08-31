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
import { hapticHeavy, hapticLight, hapticTick } from '@/lib/haptics';
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

  /**
   * 撕完一整張所需的拖曳距離，以場景寬度為單位。
   * turn.js 過半就算撕開，所以真正的門檻是這個數字的一半 —— 393px 的手機約 82px，
   * 摺紙點大致跟著手指 1:1 走（券本身就佔場景寬度的一半左右）。
   */
  const TEAR_SCREEN_RATIO = 0.42;
  /** turn.js 的內部把手：拆掉它自己的 DOM listener 之後，改由我們手動餵事件 */
  const turnApi = useRef<{ handlers: any; pages: any } | null>(null);
  /** 這一次全螢幕拖曳的起始資料（摺紙原點、螢幕位移換算摺紙位移的倍率） */
  const dragRef = useRef<{ active: boolean; cornerX: number; cornerY: number; gain: number; pageW: number } | null>(null);

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
   * 這一次按下有沒有真的接上 turn.js（＝正在撕）。
   *
   * 以前它的意思是「按的位置落在券左緣的撕取區」—— 因為 turn.js 只認那個角。
   * 現在改成全螢幕任何地方按下都算（老闆 2026-08-31），所以它只剩下
   * 「代理有沒有成功掛上」：turn.js 還沒初始化好時按下去，不出聲也不進撕開狀態。
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

    /*
     * 餵給 turn.js 的假事件。
     * 它內部有兩條路：觸控裝置讀 `originalEvent.touches[0]`，滑鼠讀事件本身，
     * 兩邊都只取 pageX/pageY —— 所以同時備妥這兩種形狀就通吃。
     */
    const fakeEvt = (pageX: number, pageY: number): any => ({
      pageX, pageY,
      originalEvent: { touches: [{ pageX, pageY }] },
      preventDefault() {}, stopPropagation() {},
      isDefaultPrevented: () => false,
    });

    const onCapturePointerDown = (e: PointerEvent) => {
      if (tearCompleted.current) return;
      // 按鈕不算撕紙：SKIP／下一張／聲音開關都掛 data-ui
      if ((e.target as HTMLElement | null)?.closest?.('[data-ui]')) return;

      setTouched(true);
      pressStartX.current = e.clientX;
      slideRight.current = false;
      hasMoved.current = false;  // 每次按下重置
      lastCrackle.current = 0;
      lastMove.current = null;
      tensionDone.current = false;

      /*
       * 全螢幕拖曳代理：畫面上任何一點按下去，都當成「捏住券的左緣中點」。
       *
       * turn.js 規定 mousedown/touchstart 必須落在它自己的 tl/bl 角上才會開始摺紙，
       * 而券只有 ~190px 寬，玩家得瞄準畫面裡一小塊地方才捏得到（老闆回報）。
       * 這裡改成由我們手動呼叫 turn.js 的 handler，起點固定餵在券左緣中點 ——
       * 摺紙曲線、陰影、過半才算撕開、沒過半就彈回，全部還是 turn.js 在做，沒有改。
       *
       * 起點的 y 用 offsetHeight/2（不是 bounding rect 的一半）：券是斜的，
       * bounding rect 比實際高，取一半會掉出 tl 角的範圍變成 bl，摺法就不一樣了。
       */
      const api = turnApi.current;
      const fb = flipbookRef.current;
      const $ = window.jQuery;
      if (!api || !fb || !$) { inGrabZone.current = false; return; }

      const pos = $(fb).offset();
      const cornerX = pos.left + 2;
      const cornerY = pos.top + fb.offsetHeight / 2;
      const pageW = fb.offsetWidth || 1;
      // 撕完一整張要拖 TEAR_SCREEN_RATIO 個畫面寬；過半即撕開，所以實際門檻是一半
      const need = Math.max(60, (containerRef.current?.clientWidth || window.innerWidth) * TEAR_SCREEN_RATIO);
      dragRef.current = { active: true, cornerX, cornerY, gain: pageW / need, pageW };

      api.handlers.touchStart(fakeEvt(cornerX, cornerY));
      inGrabZone.current = true;

      // iOS 的 AudioContext 必須在使用者手勢裡建立，否則第一次撕會沒聲音
      if (!isSoundMuted()) {
        unlockTearAudio();
        sfxGrab();                       // 捏到了 —— 沒有這一聲玩家不知道自己抓住了
      }
      /* 震動不看靜音開關：靜音是為了不吵到別人，震動本來就是靜的（其他頁也是這樣） */
      hapticLight();                     // 捏到了的手感，跟 sfxGrab 同一刻
    };

    const onCapturePointerMove = (e: PointerEvent) => {
      if (pressStartX.current === null) return;
      hasMoved.current = true;  // 只要有任何移動就設 true（turning gate 用這個）
      const d = dragRef.current;
      if (!d?.active || !inGrabZone.current) return;

      // 左滑右滑都算（老闆指定）—— 撕開的程度只看離按下點多遠
      const dx = Math.abs(e.clientX - pressStartX.current);
      // 餵給 turn.js 的摺紙點：超過券寬就沒有意義了，夾住免得算出離譜的角度
      const foldX = d.cornerX + Math.min(dx * d.gain, d.pageW * 1.15);
      turnApi.current?.handlers.touchMove(fakeEvt(foldX, d.cornerY));

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
      if (dx - lastCrackle.current > 8) {
        const now = performance.now();
        const prev = lastMove.current;
        const speed = prev ? Math.abs(e.clientX - prev.x) / Math.max(1, now - prev.t) : 0.3;
        lastMove.current = { x: e.clientX, t: now };
        if (!isSoundMuted()) crackle(Math.min(1, 0.25 + speed * 0.5));
        /* 每一格都頓一下 —— 這一下才是「紙在我手上裂開」的來源，
           節流跟聲音共用同一個 8px 門檻，快撕就密、慢撕就疏 */
        hapticTick();
        lastCrackle.current = dx;
      }
    };

    const onPointerUp = () => {
      lastCrackle.current = 0;
      inGrabZone.current = false;

      const d = dragRef.current;
      if (d?.active) {
        d.active = false;
        const api = turnApi.current;
        const $ = window.jQuery;
        if (api && $) {
          /*
           * turn.js 還有一條捷徑：按下到放開不到 200ms 就直接翻頁（_eventReleased）。
           * 以前那要按在角上才中得到，現在按哪裡都算，隨手點一下券就撕開了。
           * 把每頁的 time 歸零關掉它 —— 撕不撕開純看拖了多遠，沒過半照樣彈回。
           */
          Object.keys(api.pages || {}).forEach((k) => {
            const f = api.pages[k]?.data?.()?.f;
            if (f) f.time = 0;
          });
          api.handlers.touchEnd(fakeEvt(d.cornerX, d.cornerY));
        }
      }

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
      document.addEventListener('pointercancel', onPointerUp);

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
              hapticHeavy();          // 撕開的那一下，跟 bigRip 同一刻
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
              hapticLight();          // 沒撕開、彈回去了，手上也要知道
              if (!isSoundMuted()) sfxBounceBack();
              // 彈回時清除拖曳狀態
              wrapperRef.current?.classList.remove('tearing');
              const pt = getPtEl();
              if (pt) pt.style.visibility = '';
            }
          },
        },
      });

      /*
       * 拆掉 turn.js 自己綁的三個 DOM listener，改由上面那組 pointer handler 手動餵。
       *
       * **不拆不行**：手指真的滑過畫面時，turn.js 綁在 document 上的 mousemove／touchmove
       * 會用手指的真實座標去改摺紙點，跟我們餵進去的位置打架 —— 紙會抖。
       * 拆掉之後 turn.js 只剩「怎麼摺、要不要翻」的邏輯，事件全由我們決定。
       */
      const tdata = $fb.data();
      if (tdata?.eventHandlers) {
        $fb.off('mousedown touchstart', tdata.eventHandlers.touchStart);
        $(document)
          .off('mousemove touchmove', tdata.eventHandlers.touchMove)
          .off('mouseup touchend',    tdata.eventHandlers.touchEnd);
        turnApi.current = { handlers: tdata.eventHandlers, pages: tdata.pages };
      }

      $fbSaved = $fb;      // 儲存供 cleanup destroy 使用
      turnReady.current = true;
    })();

    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', onCapturePointerDown, true);
      document.removeEventListener('pointermove', onCapturePointerMove, true);
      document.removeEventListener('pointerup',   onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      turnApi.current = null;
      dragRef.current = null;
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
      <div data-ui className="absolute top-4 right-4 z-30">
        <SoundToggle safeTop />
      </div>

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

            </>
          )}
        </div>
      </div>

      {/*
        滑動提示。
        撕紙改成「畫面上任何地方按著拖」之後，提示就不能再貼在券上比劃左緣 ——
        那會繼續教玩家去捏那個小角落。改放在券下方的畫面中央，划一段夠長的距離。
      */}
      {!done && !touched && (
        <motion.div
          className="absolute left-1/2 z-20 flex flex-col items-center"
          style={{ top: '72%', width: 160 * s, marginLeft: -80 * s, pointerEvents: 'none' }}
          animate={{ opacity: [0.35, 1, 1, 0.35] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.25, 0.75, 1] }}
        >
          <motion.div
            style={{ width: 52 * s, height: 52 * s, position: 'relative' }}
            animate={{ x: [-46 * s, 46 * s, -46 * s] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Image src={asset("/images/finger.png")} alt="" fill className="object-contain drop-shadow-md" unoptimized />
          </motion.div>
          <span
            className="mt-1 whitespace-nowrap font-black text-white/90"
            style={{ fontSize: 13 * s, letterSpacing: '0.1em', textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}
          >
            左右滑動撕開
          </span>
        </motion.div>
      )}

      {/*
        「下一張」＝**整個畫面都可以點**（老闆 2026-08-31）。

        先前是券右下角那顆會晃的按鈕；再之前是底部按鈕。兩版的問題是同一個：
        撕完的下一秒玩家的視線還黏在券上，還要先找到、再瞄準一顆按鈕。
        撕紙本身已經改成「畫面任一處按著拖」，換張也就沒有理由再要求瞄準。

        提示改放畫面中央下方（跟「左右滑動撕開」同一個位置）：兩段提示落在同一處，
        眼睛不用重新找。它是 pointer-events-none 的裝飾，整層才是那顆按鈕。

        z-20：SKIP 與聲音開關是 z-30，疊在這層上面，照樣點得到。
      */}
      <AnimatePresence>
        {showButton && !isLast && (
          <motion.button
            key="next-tap"
            data-ui
            type="button"
            aria-label="下一張"
            onClick={() => {
              if (!isSoundMuted()) sfxInterlude();
              hapticLight();
              (onNext ?? onDone)?.();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-20 flex items-start justify-center"
            style={{ paddingTop: '72%' }}
          >
            <motion.span
              className="pointer-events-none flex items-center gap-1 rounded-full border border-white/30
                         bg-black/60 px-5 h-10 text-sm font-black tracking-[0.25em] text-white
                         shadow-lg backdrop-blur-sm"
              animate={{ opacity: [0.4, 1, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.25, 0.75, 1] }}
            >
              點任一處　下一張
              <span aria-hidden className="text-base leading-none">›</span>
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      {/*
        底部只留 SKIP。「下一張」不再是一顆按鈕，改成整個畫面都能點（見上）。
      */}
      <div className="absolute bottom-4 left-4 right-4 z-30 flex items-center justify-end gap-3">
        <button
          data-ui
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
