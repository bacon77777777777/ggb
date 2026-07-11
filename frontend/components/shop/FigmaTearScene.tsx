'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

declare global {
  interface Window { jQuery: any }
}

interface FigmaTearSceneProps {
  prizeTierLetter: string;
  onDone: () => void;
  initialDone?: boolean;
}

export default function FigmaTearScene({ prizeTierLetter, onDone, initialDone = false }: FigmaTearSceneProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const flipbookRef   = useRef<HTMLDivElement>(null);
  const [dims, setDims]           = useState({ w: 393, h: 844 });
  const [done, setDone]           = useState(initialDone);
  const [showButton, setShowButton] = useState(initialDone);
  const [touched, setTouched]     = useState(false);
  const wrapperRef    = useRef<HTMLDivElement>(null);  // .ichiban-flipbook
  const turnReady     = useRef(false);
  const pressStartX   = useRef<number | null>(null);
  const slideRight    = useRef(false);

  // Container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 完成後 3 秒顯示按鈕
  useEffect(() => {
    if (!done || showButton) return;
    const t = setTimeout(() => setShowButton(true), 3000);
    return () => clearTimeout(t);
  }, [done, showButton]);

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

    // 滑動追蹤：>5px 就顯示 p-temporal；pointerup 時若沒到 24px 再藏回去
    const onPointerMove = (e: PointerEvent) => {
      if (pressStartX.current === null) return;
      const dx = e.clientX - pressStartX.current;
      if (dx > 5) wrapperRef.current?.classList.add('tearing');
      if (dx > 24) slideRight.current = true;
    };
    const onPointerUp = () => {
      if (!slideRight.current) wrapperRef.current?.classList.remove('tearing');
      pressStartX.current = null;
    };

    (async () => {
      if (!window.jQuery)           await injectScript('/js/jquery.min.js');
      if (!window.jQuery?.fn?.turn) await injectScript('/js/turn.js');

      if (cancelled || !flipbookRef.current) return;

      const $ = window.jQuery;
      if (!$) return;

      const $fb = $(flipbookRef.current);
      try { if ($fb.data('turn')) $fb.turn('destroy'); } catch { /* ignore */ }

      document.addEventListener('pointermove', onPointerMove);
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
        turnCorners: 'tl,bl',  // 左上+左下：任意 Y 位置按壓都能觸發，中心跟著滑動
        when: {
          turned: (_e: Event, page: number) => {
            if (page === 2) {
              tearAudioRef.current?.play().catch(() => {});
              setTimeout(() => setDone(true), 300);
            }
          },
        },
      });

      // 只有往右滑動才撕開；點擊一律取消
      $fb.bind('turning', (_e: Event, page: number) => {
        if (page === 2 && !slideRight.current) {
          (_e as Event & { preventDefault(): void }).preventDefault();
        }
      });

      turnReady.current = true;
    })();

    return () => {
      cancelled = true;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup',   onPointerUp);
      const $ = window.jQuery;
      if ($ && flipbookRef.current && turnReady.current) {
        try { $(flipbookRef.current).turn('destroy'); } catch { /* ignore */ }
        turnReady.current = false;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const s            = dims.w / 393;
  const ticketW      = 255 * s;
  const ticketH      = 124 * s;
  const ticketGroupY = Math.max(0, (dims.h - 843 * s) / 2) + 217 * s;
  const prizeLabel   = prizeTierLetter === 'LAST' ? 'LAST ONE' : `${prizeTierLetter} 賞`;

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
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={initialDone ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
              animate={done ? { opacity: 1, scale: 1 } : {}}
              transition={initialDone ? { duration: 0 } : { delay: 0.2, duration: 0.5, type: 'spring' }}
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
            </motion.div>
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
                onPointerDown={(e) => {
                  setTouched(true);
                  pressStartX.current = e.clientX;
                  slideRight.current  = false;
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

      {/* 開獎列表按鈕 */}
      <AnimatePresence>
        {showButton && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={onDone}
            className="absolute bottom-8 right-6 z-30 flex items-center gap-2 px-5 py-3 rounded-full border border-white/40 text-white text-sm font-bold active:scale-95"
            style={{
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            {prizeLabel} 開獎列表
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
