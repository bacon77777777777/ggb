'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';

interface FigmaTearSceneProps {
  prizeTierLetter: string;
  onDone: () => void;
}

const PEEL_THRESHOLD = 0.25;
const REVEAL_DURATION = 800;
const AUTO_DISMISS_DELAY = 3000;

export default function FigmaTearScene({ prizeTierLetter, onDone }: FigmaTearSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 393, h: 844 });

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

  const peelRef = useRef(0);
  const [peel, setPeel] = useState(0);
  const [done, setDone] = useState(false);
  const [hintHidden, setHintHidden] = useState(false);

  const dragStartX = useRef<number | null>(null);
  const dragStartPeel = useRef(0);
  const committedRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const animatePeel = useCallback(
    (target: number, duration: number, onComplete?: () => void) => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      const start = peelRef.current;
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - startTime) / duration, 1);
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
    animatePeel(1, REVEAL_DURATION, () => setDone(true));
  }, [animatePeel, playTear]);

  const snapBack = useCallback(() => {
    committedRef.current = false;
    animatePeel(0, 300);
  }, [animatePeel]);

  useEffect(() => {
    if (!done) return;
    autoTimerRef.current = setTimeout(onDone, AUTO_DISMISS_DELAY);
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
  }, [done, onDone]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (done || committedRef.current) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const localX = e.clientX - rect.left;
      // Ticket starts at roughly: centerX - ticketW/2 + 178*s (from scene group left offset)
      const ticketLeft = rect.width * 0.5 - ticketW / 2 + 178 * s - 71 * s;
      const ticketRight = ticketLeft + ticketW;
      if (localX < ticketLeft || localX > ticketRight) return;
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
      const raw = Math.max(0, Math.min(1, dragStartPeel.current + dx / ticketW));
      if (!hintHidden && raw > 0.02) setHintHidden(true);
      peelRef.current = raw;
      setPeel(raw);
    },
    [ticketW, done, hintHidden],
  );

  const onPointerUp = useCallback(() => {
    if (dragStartX.current === null) return;
    dragStartX.current = null;
    if (done || committedRef.current) return;
    if (!hintHidden) setHintHidden(true);
    if (peelRef.current > PEEL_THRESHOLD) reveal();
    else snapBack();
  }, [done, hintHidden, reveal, snapBack]);

  // Visual derivations — cover spans full ticket width
  const foldW = peel * ticketW;
  const rightW = ticketW - foldW;
  const prizeOpacity = peel < 0.45 ? 0 : peel < 0.55 ? (peel - 0.45) / 0.10 : 1;
  const flyX = peel > 0.9 ? ((peel - 0.9) / 0.1) * ticketW * 2 : 0;
  const flyOpacity =
    peel > 0.86 && peel < 0.92 ? (peel - 0.86) / 0.06
    : peel >= 0.92 ? Math.max(0, 1 - (peel - 0.92) / 0.08) : 0;
  const ticketGroupY = Math.max(0, (dims.h - 843 * s) / 2) + 217 * s;
  const prizeLabel = prizeTierLetter === 'LAST' ? 'LAST ONE' : `${prizeTierLetter} 賞`;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none touch-none"
      style={{ minHeight: '100dvh', background: '#111' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Full-screen background scene */}
      <Image
        src="/images/ichiban-tear/bg.png"
        alt=""
        fill
        className="object-cover"
        unoptimized
        priority
      />

      {/* Scene group: hand + ticket */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: ticketGroupY,
          left: -71 * s,
          width: 433 * s,
          height: 491 * s,
          transform: 'rotate(4deg)',
          opacity: done ? 0 : 1,
          transition: done ? 'opacity 0.5s ease-out' : undefined,
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

        {/* Ticket container */}
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
            pointerEvents: 'none',
          }}
        >
          {/* Base layer: bg.svg — always visible, prize letter goes here */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/ichiban-tear/bg.svg"
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />

          {/* Prize letter — fades in as cover peels back */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ opacity: prizeOpacity }}
          >
            <svg width="100%" height="100%" viewBox="0 0 320 156">
              <text
                x={prizeTierLetter === 'LAST' ? '220' : '210'}
                y="115"
                fontSize={prizeTierLetter === 'LAST' ? '56' : '96'}
                fontWeight="900"
                fill="#FFC400"
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
              >
                {prizeLabel}
              </text>
            </svg>
          </div>

          {/* Peeling cover: up.svg */}
          {!done && (
            <>
              {/* Right un-peeled portion of up.svg */}
              {rightW > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: foldW,
                    top: 0,
                    width: rightW,
                    height: ticketH,
                    overflow: 'hidden',
                    // Inset shadow on left edge = fold crease depth
                    boxShadow: foldW > 4 ? 'inset 5px 0 12px rgba(0,0,0,0.3)' : 'none',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/ichiban-tear/up.svg"
                    alt=""
                    style={{
                      position: 'absolute',
                      left: -foldW,
                      top: 0,
                      width: ticketW,
                      height: ticketH,
                      objectFit: 'cover',
                    }}
                  />
                </div>
              )}

              {/* Left peeled-back portion — shows the back of the sticker */}
              {foldW > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: foldW,
                    height: ticketH,
                    overflow: 'hidden',
                  }}
                >
                  {/* Back of the sticker: muted/desaturated version of up.svg */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/ichiban-tear/up.svg"
                    alt=""
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      width: ticketW,
                      height: ticketH,
                      objectFit: 'cover',
                      objectPosition: 'right center',
                      filter: 'brightness(0.55) saturate(0.3)',
                    }}
                  />
                  {/* Curl highlight — bright on the lifted edge */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(to right, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.15) 35%, rgba(0,0,0,0.1) 70%, rgba(0,0,0,0.35) 100%)',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              )}

              {/* Fold crease shadow at tear boundary */}
              {foldW > 3 && (
                <div
                  style={{
                    position: 'absolute',
                    left: foldW - 4,
                    top: -2,
                    width: 9,
                    height: ticketH + 4,
                    background:
                      'linear-gradient(to right, rgba(0,0,0,0.5), rgba(0,0,0,0.1) 55%, transparent)',
                    borderRadius: 3,
                    pointerEvents: 'none',
                    zIndex: 3,
                  }}
                />
              )}
            </>
          )}

          {/* Fly-away piece after full peel */}
          {!done && flyOpacity > 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: flyOpacity,
                transform: `translateX(${flyX}px) rotate(${flyX * 0.04}deg)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/ichiban-tear/up.svg"
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
        </div>

        {/* Swipe hint finger */}
        {!hintHidden && !done && (
          <div
            className="absolute pointer-events-none"
            style={{ top: 42 * s + ticketH * 0.65, left: 178 * s + ticketW * 0.22 }}
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

      {/* Sparkle overlay */}
      {done && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/ichiban-tear/light.gif"
            alt=""
            className="w-full h-full object-cover opacity-70 mix-blend-screen"
          />
        </div>
      )}

      {/* Prize announcement — over background, no black overlay */}
      {done && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none"
          style={{ animation: 'figmaTearPrize 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.35s both' }}
        >
          <p
            className="text-sm font-bold tracking-widest uppercase mb-3"
            style={{
              color: 'rgba(255,255,255,0.95)',
              textShadow: '0 2px 16px rgba(0,0,0,0.95), 0 0 40px rgba(0,0,0,0.8)',
              letterSpacing: '0.18em',
            }}
          >
            恭喜獲得
          </p>
          <p
            className="font-black leading-none"
            style={{
              fontSize: Math.min(108 * s, 108),
              color: prizeTierLetter === 'LAST' ? '#FFD700' : '#FFFFFF',
              textShadow:
                '0 0 80px rgba(255,196,0,0.95), 0 0 40px rgba(255,196,0,0.7), 0 6px 40px rgba(0,0,0,0.98), 0 2px 8px rgba(0,0,0,0.9)',
            }}
          >
            {prizeLabel}
          </p>
        </div>
      )}

      {/* Skip button — appears immediately when done */}
      {done && (
        <button
          onClick={onDone}
          className="absolute bottom-8 right-6 z-30 flex items-center gap-2 px-5 py-3 rounded-full border border-white/40 text-white text-sm font-bold active:scale-95 transition-all"
          style={{
            background: 'rgba(255,255,255,0.18)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            animation: 'figmaTearSkip 0.4s ease-out 0.2s both',
          }}
        >
          開獎列表
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      )}

      <style>{`
        @keyframes figmaTearHint {
          0%   { transform: translateX(0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(${110 * s}px); opacity: 0; }
        }
        @keyframes figmaTearPrize {
          from { opacity: 0; transform: scale(0.75); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes figmaTearSkip {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
