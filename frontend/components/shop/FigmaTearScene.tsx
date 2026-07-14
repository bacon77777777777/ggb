'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

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
  const wrapperRef    = useRef<HTMLDivElement>(null);  // .ichiban-flipbook
  const turnReady     = useRef(false);
  const pressStartX   = useRef<number | null>(null);
  const slideRight    = useRef(false);
  const hasMoved      = useRef(false);  // 任何 pointermove 觸發即為 true，比 slideRight 更早

  // 進場後 2 秒才顯示獎項文字（讓 up1.svg 先載入蓋住）
  useEffect(() => {
    if (initialDone) return;
    const t = setTimeout(() => setShowPrize(true), 2000);
    return () => clearTimeout(t);
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
      (onOpenAll ?? onBack ?? onDone)?.();
    }, 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, isLast]);

  // 音效
  const tearAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    tearAudioRef.current = new Audio('/audio/tanweraman-paper-rip-fast-252617.mp3');
    tearAudioRef.current.preload = 'auto';
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
    };

    const onCapturePointerMove = (e: PointerEvent) => {
      if (pressStartX.current === null) return;
      hasMoved.current = true;  // 只要有任何移動就設 true（turning gate 用這個）
      const dx = e.clientX - pressStartX.current;
      if (dx > 3) {
        slideRight.current = true;
        wrapperRef.current?.classList.add('tearing');
        const pt = getPtEl();
        if (pt) pt.style.visibility = 'visible';
      }
    };

    const onPointerUp = () => {
      if (!slideRight.current) {
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
              tearAudioRef.current?.play().catch(() => {});
              setTimeout(() => setDone(true), 300);
            } else if (page === 1) {
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
      <Image src="/images/ichiban-tear/bg.png" alt="" fill className="object-cover" unoptimized priority />

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
          src="/images/ichiban-tear/hand.png" alt="" unoptimized
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
            <img src="/images/ichiban-tear/bg.svg" alt=""
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
                  <Image src="/images/finger.png" alt="" fill className="object-contain drop-shadow-md" unoptimized />
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 底部按鈕列：SKIP 永遠靠右；下一張從左邊展開填滿 */}
      <div className="absolute bottom-4 left-4 right-4 z-30 flex items-center justify-end gap-3">
        <AnimatePresence>
          {showButton && !isLast && (
            <motion.button
              key="next"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              onClick={onNext ?? onDone}
              className="relative overflow-hidden flex-1 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em] active:scale-95"
            >
              下一張
              {/* 光劃過特效 */}
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-1/2"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
                }}
                initial={{ left: '-50%' }}
                animate={{ left: '150%' }}
                transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
              />
            </motion.button>
          )}
        </AnimatePresence>
        <button
          onClick={onOpenAll ?? onBack ?? onDone}
          className="shrink-0 px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em] active:scale-95"
        >
          SKIP
        </button>
      </div>
    </div>
  );
}
