'use client';

/**
 * FigmaTearScene — 沉浸式撕紙揭獎
 *
 * 移植自 /Users/bacon/change/app/src/screens/IchibanDrawScreen.tsx
 * 的 FigmaTearOnceScene。
 *
 * 流程：
 *  1. 全畫面顯示場景（bg + hand 拿著票）
 *  2. 玩家向右拖拉封面，模擬撕紙
 *  3. 揭開後顯示最大賞等字母（金色 SVG）
 *  4. 動畫結束後 3 秒顯示 Skip 按鈕（右下角）
 *  5. 點 Skip 或自動 → onDone()
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

interface FigmaTearSceneProps {
  prizeTierLetter: string; // 'A' / 'B' / 'C' / 'LAST' etc.
  onDone: () => void;
}

const PEEL_THRESHOLD = 0.5;
const REVEAL_DURATION = 1100;
const SKIP_DELAY = 3000;

export default function FigmaTearScene({ prizeTierLetter, onDone }: FigmaTearSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 393, h: 844 });

  // Sync container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDims({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const s = dims.w / 393;
  const ticketW = 255 * s;
  const ticketH = 124 * s;
  const coverScale = 0.85;
  const coverW = ticketW * coverScale;
  const coverH = ticketH * coverScale;
  const coverLeft = (ticketW - coverW) / 2 + 2 * s;

  // peel: 0 = closed, 1 = fully open
  const peelRef = useRef(0);
  const [peel, setPeel] = useState(0); // drives re-render
  const [done, setDone] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [hintHidden, setHintHidden] = useState(false);

  const dragStartX = useRef<number | null>(null);
  const dragStartPeel = useRef(0);
  const committedRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tear sound
  const tearAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    tearAudioRef.current = new Audio('/audio/tanweraman-paper-rip-fast-252617.mp3');
    tearAudioRef.current.preload = 'auto';
  }, []);

  const playTear = useCallback(() => {
    const a = tearAudioRef.current;
    if (!a) return;
    a.currentTime = 0;
    void a.play().catch(() => {});
  }, []);

  // Animate peel to target value
  const animatePeel = useCallback(
    (target: number, duration: number, onComplete?: () => void) => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      const start = peelRef.current;
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - startTime) / duration, 1);
        // cubic ease in-out
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const val = start + (target - start) * ease;
        peelRef.current = val;
        setPeel(val);
        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          peelRef.current = target;
          setPeel(target);
          onComplete?.();
        }
      };
      animFrameRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  const reveal = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    playTear();
    animatePeel(1, REVEAL_DURATION, () => {
      setDone(true);
      skipTimerRef.current = setTimeout(() => setShowSkip(true), SKIP_DELAY);
    });
  }, [animatePeel, playTear]);

  const snapBack = useCallback(() => {
    committedRef.current = false;
    animatePeel(0, 350);
  }, [animatePeel]);

  // Pointer events (works for both touch and mouse)
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (done) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const localX = e.clientX - rect.left;
      // Only accept touch starting on the left half of the ticket
      const ticketLeft = rect.width * 0.5 - ticketW / 2 + 178 * s; // approximate ticket x offset
      if (localX > ticketLeft + 54 * s) return;
      dragStartX.current = e.clientX;
      dragStartPeel.current = peelRef.current;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [done, s, ticketW],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragStartX.current === null || done || committedRef.current) return;
      const dx = e.clientX - dragStartX.current;
      const raw = Math.max(0, Math.min(1, dragStartPeel.current + dx / coverW));
      if (!hintHidden && raw > 0.02) {
        setHintHidden(true);
      }
      peelRef.current = raw;
      setPeel(raw);
    },
    [coverW, done, hintHidden],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragStartX.current === null) return;
      const dx = e.clientX - dragStartX.current;
      const vx = dx / 0.3; // rough velocity estimate
      dragStartX.current = null;
      if (done || committedRef.current) return;
      if (!hintHidden) setHintHidden(true);
      const shouldOpen = vx > 400 ? true : vx < -400 ? false : peelRef.current > PEEL_THRESHOLD;
      if (shouldOpen) reveal();
      else snapBack();
    },
    [done, hintHidden, reveal, snapBack],
  );

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    };
  }, []);

  // ── Derived visual values (all from peel 0→1) ──────────────────────
  const foldW = peel * coverW;
  const rightW = coverW - foldW;
  const imgShift = -foldW;

  // Back strip (visible as peel lifts, shows ticket_back.png)
  const backStripOpacity = peel < 0.03 ? 0 : peel < 0.12 ? (peel - 0.03) / 0.09 : 1;
  const backImgShift = foldW - coverW;

  // Cover opacity fades out near end
  const coverOpacity = peel > 0.92 ? 0 : 1;

  // Prize letter fades in at half-peel
  const prizeOpacity = peel < 0.45 ? 0 : peel < 0.5 ? (peel - 0.45) / 0.05 : 1;

  // Fly-away: back piece shoots right after fully peeled
  const flyX = peel > 0.9 ? ((peel - 0.9) / 0.1) * ticketW * 2.4 : 0;
  const flyOpacity = peel > 0.86 && peel < 0.92 ? (peel - 0.86) / 0.06 : peel >= 0.92 ? Math.max(0, 1 - (peel - 0.92) / 0.08) : 0;

  // Hint arrow animation via CSS
  const ticketGroupY = Math.max(0, (dims.h - 843 * s) / 2) + 217 * s;

  const prizeLabel = prizeTierLetter === 'LAST' ? 'LAST ONE' : `${prizeTierLetter} 賞`;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none touch-none bg-black"
      style={{ minHeight: '100dvh' }}
    >
      {/* Full-screen background */}
      <Image
        src="/images/ichiban-tear/bg.png"
        alt=""
        fill
        className="object-cover"
        unoptimized
        priority
      />

      {/* Scene group: hand + ticket, rotated 4° like the app */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: ticketGroupY,
          left: -71 * s,
          width: 433 * s,
          height: 491 * s,
          transform: 'rotate(4deg)',
        }}
      >
        {/* Hand */}
        <Image
          src="/images/ichiban-tear/hand.png"
          alt=""
          unoptimized
          style={{
            position: 'absolute',
            top: 11 * s,
            left: 21 * s,
            width: 283 * s,
            height: 467 * s,
            transform: 'rotate(-5deg)',
            objectFit: 'contain',
          }}
          width={283}
          height={467}
        />

        {/* Ticket — pointer events live here */}
        <div
          className="absolute"
          style={{
            top: 42 * s,
            left: 178 * s,
            width: ticketW,
            height: ticketH,
            transform: 'rotate(-12deg)',
            borderRadius: 18 * s,
            overflow: 'hidden',
            pointerEvents: done ? 'none' : 'auto',
            cursor: done ? 'default' : 'grab',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Ticket base background (ticket_back underneath) */}
          <Image
            src="/images/ichiban-tear/ticket_front.png"
            alt=""
            fill
            className="object-contain"
            unoptimized
          />

          {/* Prize tier letter — revealed as cover peels */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ opacity: prizeOpacity }}
          >
            <svg width="100%" height="100%" viewBox="0 0 260 160">
              <text
                x={prizeTierLetter === 'LAST' ? '130' : '116'}
                y="112"
                fontSize={prizeTierLetter === 'LAST' ? '60' : '105.6'}
                fontWeight="900"
                fill="#FFC400"
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
              >
                {prizeLabel}
              </text>
            </svg>
          </div>

          {/* Cover layer (peels away) */}
          {!done && (
            <div
              className="absolute pointer-events-none"
              style={{
                top: (ticketH - coverH) / 2,
                left: coverLeft,
                width: coverW,
                height: coverH,
                opacity: coverOpacity,
              }}
            >
              {/* Right portion of cover — shrinks as peel grows */}
              <div
                style={{
                  position: 'absolute',
                  left: foldW,
                  top: 0,
                  width: Math.max(0, rightW),
                  height: coverH,
                  overflow: 'hidden',
                }}
              >
                <div style={{ transform: `translateX(${imgShift}px)`, width: coverW, height: coverH, position: 'relative' }}>
                  <Image
                    src="/images/ichiban-tear/ticket_front.png"
                    alt=""
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              </div>

              {/* Back strip — shows as cover lifts */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: foldW,
                  height: coverH,
                  overflow: 'hidden',
                  opacity: backStripOpacity,
                }}
              >
                <div style={{ transform: `translateX(${backImgShift}px)`, width: coverW, height: coverH, position: 'relative' }}>
                  <Image
                    src="/images/ichiban-tear/ticket_back.png"
                    alt=""
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              </div>
            </div>
          )}

          {/* Fly-away piece */}
          {!done && flyOpacity > 0 && (
            <div
              className="absolute pointer-events-none"
              style={{
                top: (ticketH - coverH) / 2,
                left: coverLeft,
                width: coverW,
                height: coverH,
                opacity: flyOpacity,
                transform: `translateX(${flyX}px)`,
              }}
            >
              <div style={{ position: 'relative', width: coverW, height: coverH }}>
                <Image
                  src="/images/ichiban-tear/ticket_back.png"
                  alt=""
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            </div>
          )}
        </div>

        {/* Finger hint — animated in CSS, hides after first interact */}
        {!hintHidden && !done && (
          <div
            className="absolute pointer-events-none"
            style={{ top: 42 * s + ticketH * 0.65, left: 178 * s + ticketW * 0.25 }}
          >
            <div
              className="relative"
              style={{
                width: 64 * s,
                height: 64 * s,
                animation: 'figmaTearHint 2s ease-in-out infinite',
              }}
            >
              <Image
                src="/images/finger.png"
                alt=""
                fill
                className="object-contain drop-shadow-md"
                unoptimized
              />
            </div>
          </div>
        )}
      </div>

      {/* Light effect overlay — plays after reveal */}
      {done && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/ichiban-tear/light.gif"
            alt=""
            className="w-full h-full object-cover opacity-60 mix-blend-screen"
          />
        </div>
      )}

      {/* Prize announcement overlay */}
      {done && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none"
          style={{ animation: 'figmaTearPrize 0.5s ease-out forwards' }}
        >
          <div className="text-white text-center drop-shadow-2xl px-8">
            <p className="text-sm font-bold tracking-widest uppercase text-white/70 mb-2">恭喜獲得</p>
            <p
              className="font-black leading-none"
              style={{
                fontSize: Math.min(96 * s, 96),
                color: prizeTierLetter === 'LAST' ? '#FFD700' : '#FFFFFF',
                textShadow: '0 0 40px rgba(255,196,0,0.8)',
              }}
            >
              {prizeLabel}
            </p>
          </div>
        </div>
      )}

      {/* Skip button — bottom-right, appears after 3s */}
      {showSkip && (
        <button
          onClick={onDone}
          className="absolute bottom-8 right-6 z-30 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white text-sm font-bold hover:bg-white/30 active:scale-95 transition-all"
          style={{ animation: 'figmaTearSkip 0.4s ease-out forwards' }}
        >
          開獎列表
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      )}

      {/* CSS keyframes */}
      <style>{`
        @keyframes figmaTearHint {
          0%   { transform: translateX(0);     opacity: 0; }
          10%  { opacity: 1; }
          98%  { opacity: 1; }
          100% { transform: translateX(${120 * s}px); opacity: 0; }
        }
        @keyframes figmaTearPrize {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes figmaTearSkip {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
