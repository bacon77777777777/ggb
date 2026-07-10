'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface FigmaTearSceneProps {
  prizeTierLetter: string;
  onDone: () => void;
}

const AUTO_DISMISS_DELAY = 3000;

export default function FigmaTearScene({ prizeTierLetter, onDone }: FigmaTearSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 393, h: 844 });
  const [done, setDone] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tearAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    tearAudioRef.current = new Audio('/audio/tanweraman-paper-rip-fast-252617.mp3');
    tearAudioRef.current.preload = 'auto';
  }, []);

  const playTear = () => {
    const a = tearAudioRef.current;
    if (!a) return;
    a.currentTime = 0;
    void a.play().catch(() => {});
  };

  useEffect(() => {
    if (!done) return;
    autoTimerRef.current = setTimeout(onDone, AUTO_DISMISS_DELAY);
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
  }, [done, onDone]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const s = dims.w / 393;
  const ticketW = 255 * s;
  const ticketH = 124 * s;
  const ticketGroupY = Math.max(0, (dims.h - 843 * s) / 2) + 217 * s;
  const prizeLabel = prizeTierLetter === 'LAST' ? 'LAST ONE' : `${prizeTierLetter} 賞`;

  const handleOpen = () => {
    if (done) return;
    playTear();
    setDone(true);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ minHeight: '100dvh', background: '#111' }}
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

        {/* Ticket area — NO overflow:hidden so exit animation flies beyond */}
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
          {/* Base layer — clipped to rounded rect */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 18 * s,
              overflow: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/ichiban-tear/bg.svg"
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />

            {/* Prize grade revealed when cover flies away */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={done ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.3, duration: 0.6, type: 'spring' }}
            >
              <div className="flex flex-col items-center justify-center w-full pl-[18%]">
                <div className="flex items-baseline gap-1 justify-center">
                  <span
                    style={{
                      fontSize: prizeTierLetter === 'LAST' ? ticketH * 0.3 : ticketH * 0.5,
                      fontWeight: 900,
                      color: prizeTierLetter === 'LAST' ? '#FFC400' : '#D3D3D3',
                      lineHeight: 1,
                      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                    }}
                  >
                    {prizeTierLetter === 'LAST' ? 'LAST' : prizeTierLetter}
                  </span>
                  <span
                    style={{
                      fontSize: ticketH * 0.22,
                      fontWeight: 900,
                      color: prizeTierLetter === 'LAST' ? '#FFC400' : '#D3D3D3',
                    }}
                  >
                    {prizeTierLetter === 'LAST' ? 'ONE' : '賞'}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Draggable cover (up.svg) — outside clipped base so exit can fly away */}
          <AnimatePresence>
            {!done && (
              <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 1000 }}
                dragElastic={0.08}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 8) handleOpen();
                }}
                onClick={handleOpen}
                exit={{
                  rotateY: -110,
                  x: '110%',
                  z: 400,
                  opacity: 0,
                  transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] },
                }}
                style={{
                  originX: 1,
                  originY: 0.5,
                  perspective: 2000,
                  transformStyle: 'preserve-3d',
                  position: 'absolute',
                  inset: 0,
                  zIndex: 10,
                  pointerEvents: 'auto',
                }}
                className="touch-none cursor-grab active:cursor-grabbing will-change-transform"
              >
                {/* Cover image clipped to rounded rect */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 18 * s,
                    overflow: 'hidden',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/ichiban-tear/up.svg"
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    draggable={false}
                  />
                </div>

                {/* Finger swipe hint — diagonal right-upward */}
                <motion.div
                  style={{
                    position: 'absolute',
                    left: '22%',
                    top: '65%',
                    width: 52 * s,
                    height: 52 * s,
                    pointerEvents: 'none',
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
                  <Image
                    src="/images/finger.png"
                    alt=""
                    fill
                    className="object-contain drop-shadow-md"
                    unoptimized
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Sparkle overlay */}
      {done && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/ichiban-tear/light.gif"
            alt=""
            className="w-full h-full object-cover opacity-70 mix-blend-screen"
          />
        </div>
      )}

      {/* Prize announcement */}
      {done && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35, type: 'spring', stiffness: 180 }}
            className="flex flex-col items-center"
          >
            <p
              className="text-sm font-bold mb-3"
              style={{
                color: 'rgba(255,255,255,0.95)',
                textShadow: '0 2px 16px rgba(0,0,0,0.95)',
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
          </motion.div>
        </div>
      )}

      {/* Skip button */}
      {done && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={onDone}
          className="absolute bottom-8 right-6 z-30 flex items-center gap-2 px-5 py-3 rounded-full border border-white/40 text-white text-sm font-bold active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.18)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          開獎列表
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path
              d="M6 3l5 5-5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </motion.button>
      )}
    </div>
  );
}
