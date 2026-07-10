'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface FigmaTearSceneProps {
  prizeTierLetter: string;
  onDone: () => void;
  initialDone?: boolean;
}

export default function FigmaTearScene({ prizeTierLetter, onDone, initialDone = false }: FigmaTearSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 393, h: 844 });
  const [peel, setPeel] = useState(initialDone ? 1 : 0);
  const [done, setDone] = useState(initialDone);
  const [showButton, setShowButton] = useState(initialDone);
  // Fold lean — how much the crease line tilts based on drag direction
  const [foldLean, setFoldLean] = useState(0);

  const peelRef = useRef(initialDone ? 1 : 0);
  const foldLeanRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startPeel: number; lastX: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!done || showButton) return;
    const t = setTimeout(() => setShowButton(true), 3000);
    return () => clearTimeout(t);
  }, [done, showButton]);

  useEffect(() => {
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  const s = dims.w / 393;
  const ticketW = 255 * s;
  const ticketH = 124 * s;
  const ticketGroupY = Math.max(0, (dims.h - 843 * s) / 2) + 217 * s;

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

  const animatePeel = useCallback((target: number, duration: number, onComplete?: () => void) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const start = peelRef.current;
    const startLean = foldLeanRef.current;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const val = start + (target - start) * ease;
      const lean = startLean * (1 - ease); // lean eases back to 0
      peelRef.current = val;
      foldLeanRef.current = lean;
      setPeel(val);
      setFoldLean(lean);
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        peelRef.current = target;
        foldLeanRef.current = 0;
        setPeel(target);
        setFoldLean(0);
        onComplete?.();
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const handleReveal = useCallback(() => {
    playTear();
    animatePeel(1, 500, () => setDone(true));
  }, [animatePeel, playTear]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (done) return;
    dragRef.current = { startX: e.clientX, startPeel: peelRef.current, lastX: e.clientX };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [done]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || done) return;
    const velocity = e.clientX - dragRef.current.lastX;
    dragRef.current.lastX = e.clientX;
    const dx = e.clientX - dragRef.current.startX;
    const newPeel = Math.max(0, Math.min(1, dragRef.current.startPeel + dx / ticketW));
    // Lean: proportional to velocity, clamped to ±20% of ticket height
    const maxLean = ticketH * 0.2;
    const newLean = Math.max(-maxLean, Math.min(maxLean, velocity * 1.8));
    peelRef.current = newPeel;
    foldLeanRef.current = newLean;
    setPeel(newPeel);
    setFoldLean(newLean);
  }, [done, ticketW, ticketH]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || done) return;
    const movedX = Math.abs(e.clientX - dragRef.current.startX);
    dragRef.current = null;
    // Tap (< 8px movement) or enough drag → full reveal
    if (movedX < 8 || peelRef.current > 0.25) {
      handleReveal();
    } else {
      animatePeel(0, 300);
    }
  }, [done, handleReveal, animatePeel]);

  const prizeLabel = prizeTierLetter === 'LAST' ? 'LAST ONE' : `${prizeTierLetter} 賞`;

  // Bezier fold curve (adapted from BlubluBlue7/Page bezier-assembler)
  // peel 0→1 maps to fold moving left→right across ticketW
  // bow = lateral bulge of the fold curve (max at peel=0.5, simulates paper curling)
  const foldX = peel * ticketW;
  const bow = ticketW * 0.22 * Math.sin(peel * Math.PI);
  const leanOffset = foldLean * 0.3; // diagonal lean from drag velocity
  const c1x = foldX - bow * 0.65;
  const c2x = foldX - bow * 0.65;
  const c1y = ticketH * 0.22 + leanOffset;
  const c2y = ticketH * 0.78 + leanOffset;
  // SVG path for the fold crease line
  const foldPath = `M ${foldX} 0 C ${c1x} ${c1y}, ${c2x} ${c2y}, ${foldX} ${ticketH}`;
  // Clip path: right side of fold curve (cover remains visible here)
  const coverClipPath = `${foldPath} L ${ticketW} ${ticketH} L ${ticketW} 0 Z`;

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

      {/* Scene group: hand + ticket — always visible */}
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

        {/* Ticket — separate base (clipped) + cover layer */}
        <div
          style={{
            position: 'absolute',
            top: 42 * s,
            left: 178 * s,
            width: ticketW,
            height: ticketH,
            transform: 'rotate(-12deg)',
          }}
        >
          {/* Base layer: bg.svg + prize text, clipped to rounded rect */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: 18 * s, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/ichiban-tear/bg.svg"
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
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
                    fontSize: ticketH * 0.22,
                    fontWeight: 900,
                    color: prizeTierLetter === 'LAST' ? '#FFC400' : '#D3D3D3',
                  }}>
                    {prizeTierLetter === 'LAST' ? 'ONE' : '賞'}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Cover: up.svg clipped to right of bezier fold curve */}
          {!done && (
            <>
              {/* SVG defs: bezier clipPath for the cover */}
              <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
                <defs>
                  <clipPath id="figma-tear-cover-clip" clipPathUnits="userSpaceOnUse">
                    <path d={coverClipPath} />
                  </clipPath>
                </defs>
              </svg>

              {/* Cover image clipped to right of fold curve */}
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 18 * s,
                overflow: 'hidden',
                clipPath: 'url(#figma-tear-cover-clip)',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/ichiban-tear/up.svg"
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  draggable={false}
                />
                {/* Inner shadow near fold edge: simulates cover lifting */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: `linear-gradient(to right, rgba(0,0,0,${Math.min(0.65, peel * 1.3)}) 0%, rgba(0,0,0,0) 30%)`,
                  pointerEvents: 'none',
                }} />
              </div>

              {/* Fold crease: shadow band + highlight along bezier curve */}
              {peel > 0.008 && (
                <svg
                  style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 20 }}
                  width={ticketW}
                  height={ticketH}
                >
                  {/* Wide soft shadow */}
                  <path d={foldPath} stroke="rgba(0,0,0,0.28)" strokeWidth={20} fill="none" strokeLinecap="round" />
                  {/* Tighter dark core */}
                  <path d={foldPath} stroke="rgba(0,0,0,0.45)" strokeWidth={8} fill="none" strokeLinecap="round" />
                  {/* Bright highlight crease */}
                  <path d={foldPath} stroke="rgba(255,255,255,0.7)" strokeWidth={1.5} fill="none" strokeLinecap="round" />
                </svg>
              )}

              {/* Finger swipe hint — diagonal right-upward */}
              {peel < 0.03 && (
                <motion.div
                  style={{
                    position: 'absolute',
                    left: '10%',
                    top: '55%',
                    width: 52 * s,
                    height: 52 * s,
                    pointerEvents: 'none',
                    zIndex: 25,
                  }}
                  animate={{
                    x: [0, 72 * s, 72 * s],
                    y: [0, -36 * s, -36 * s],
                    opacity: [0, 1, 1, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    times: [0, 0.5, 0.8, 1],
                  }}
                >
                  <Image src="/images/finger.png" alt="" fill className="object-contain drop-shadow-md" unoptimized />
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/* "開獎列表" button — appears 3s after done, no dark overlay */}
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
