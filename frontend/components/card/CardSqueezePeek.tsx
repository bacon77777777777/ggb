'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface CardSqueezePeekProps {
  backImageUrl: string;
  frontImageUrl: string;
  prizeName: string;
  grade: string;
  onReveal: () => void;
}

const CARD_W = 240;
const CARD_H = 336; // standard card 2.5:3.5 ratio

export default function CardSqueezePeek({
  backImageUrl,
  frontImageUrl,
  prizeName,
  grade,
  onReveal,
}: CardSqueezePeekProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotX, setRotX] = useState(-18);
  const [rotY, setRotY] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const rotXRef = useRef(-18);
  const rotYRef = useRef(0);
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastPosRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; startRotX: number; startRotY: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const idleRafRef = useRef<number | null>(null);

  const stopAll = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (idleRafRef.current) { cancelAnimationFrame(idleRafRef.current); idleRafRef.current = null; }
  }, []);

  // Idle float animation
  useEffect(() => {
    if (isRevealed || isOpening) return;
    const idleStart = performance.now();
    const tick = (now: number) => {
      if (dragRef.current) { idleRafRef.current = requestAnimationFrame(tick); return; }
      const t = (now - idleStart) * 0.001;
      const newRotX = -18 + Math.sin(t * 0.7) * 4;
      const newRotY = Math.sin(t * 0.5) * 8;
      rotXRef.current = newRotX;
      rotYRef.current = newRotY;
      setRotX(newRotX);
      setRotY(newRotY);
      idleRafRef.current = requestAnimationFrame(tick);
    };
    idleRafRef.current = requestAnimationFrame(tick);
    return stopAll;
  }, [isRevealed, isOpening, stopAll]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isRevealed || isOpening) return;
    stopAll();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRotX: rotXRef.current,
      startRotY: rotYRef.current,
    };
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    velocityRef.current = { x: 0, y: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [isRevealed, isOpening, stopAll]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || isRevealed || isOpening) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    velocityRef.current = {
      x: (e.clientX - lastPosRef.current.x) * 0.6 + velocityRef.current.x * 0.4,
      y: (e.clientY - lastPosRef.current.y) * 0.6 + velocityRef.current.y * 0.4,
    };
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    const newRotY = dragRef.current.startRotY + dx * 0.55;
    const newRotX = Math.max(-75, Math.min(45, dragRef.current.startRotX - dy * 0.35));
    rotXRef.current = newRotX;
    rotYRef.current = newRotY;
    setRotX(newRotX);
    setRotY(newRotY);
  }, [isRevealed, isOpening]);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current || isRevealed || isOpening) return;
    dragRef.current = null;
    // Inertia
    const decay = () => {
      velocityRef.current = { x: velocityRef.current.x * 0.91, y: velocityRef.current.y * 0.88 };
      if (Math.abs(velocityRef.current.x) < 0.15 && Math.abs(velocityRef.current.y) < 0.15) return;
      const newRotY = rotYRef.current + velocityRef.current.x * 0.55;
      const newRotX = Math.max(-75, Math.min(45, rotXRef.current - velocityRef.current.y * 0.35));
      rotXRef.current = newRotX;
      rotYRef.current = newRotY;
      setRotX(newRotX);
      setRotY(newRotY);
      rafRef.current = requestAnimationFrame(decay);
    };
    rafRef.current = requestAnimationFrame(decay);
  }, [isRevealed, isOpening]);

  const handleOpen = useCallback(() => {
    if (isRevealed || isOpening) return;
    setIsOpening(true);
    stopAll();
    const startRotX = rotXRef.current;
    const startRotY = rotYRef.current;
    const targetRotY = Math.round(startRotY / 180) * 180 + 180; // next 180° step
    const startTime = performance.now();
    const duration = 650;
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const newRotY = startRotY + (targetRotY - startRotY) * ease;
      const newRotX = startRotX * (1 - ease * 0.8);
      rotXRef.current = newRotX;
      rotYRef.current = newRotY;
      setRotX(newRotX);
      setRotY(newRotY);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setIsRevealed(true);
        setIsOpening(false);
        setTimeout(onReveal, 1200);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  }, [isRevealed, isOpening, stopAll, onReveal]);

  // Is the front face currently visible?
  const normalizedY = ((rotY % 360) + 360) % 360;
  const frontVisible = normalizedY > 90 && normalizedY < 270;

  // Dynamic reflection angle based on rotation
  const reflectAngle = 135 + rotY * 0.3 + rotX * 0.2;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none touch-none"
      style={{ background: '#0f2318', minHeight: '100dvh' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Background table feel */}
      <div className="absolute inset-0">
        <Image src="/images/card/pcbg.png" alt="" fill className="object-cover" style={{ filter: 'brightness(0.35) saturate(1.4)' }} unoptimized />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(34,85,34,0.25), transparent)' }} />
      </div>

      {/* Hint text */}
      <AnimatePresence>
        {!isRevealed && !isOpening && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.8 }}
            className="absolute top-10 text-white/50 text-sm font-medium tracking-wider z-10"
          >
            拖曳旋轉・搓牌瞇牌
          </motion.p>
        )}
      </AnimatePresence>

      {/* 3D card scene */}
      <div style={{ perspective: '750px', perspectiveOrigin: '50% 45%', position: 'relative' }}>

        {/* Card shadow on "table" */}
        <div style={{
          position: 'absolute',
          bottom: -28,
          left: '5%',
          right: '5%',
          height: 40,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)',
          filter: 'blur(16px)',
          transform: `scaleX(${0.9 + Math.cos(rotX * Math.PI / 180) * 0.1}) scaleY(${0.35 + Math.abs(Math.sin(rotX * Math.PI / 180)) * 0.35})`,
        }} />

        {/* Card */}
        <div
          style={{
            width: CARD_W,
            height: CARD_H,
            position: 'relative',
            transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            transformStyle: 'preserve-3d',
            cursor: isRevealed ? 'default' : 'grab',
          }}
        >
          {/* Back face */}
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 18,
            overflow: 'hidden',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.5)',
          }}>
            <Image src={backImageUrl} alt="card back" fill className="object-cover" unoptimized />
            {/* Dynamic sheen */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(${reflectAngle}deg, rgba(255,255,255,0.22) 0%, transparent 40%, rgba(0,0,0,0.18) 100%)`,
              mixBlendMode: 'overlay',
            }} />
          </div>

          {/* Front face */}
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 18,
            overflow: 'hidden',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.5)',
          }}>
            <Image src={frontImageUrl} alt="card front" fill className="object-cover" unoptimized />
            {/* Reveal flash */}
            {isRevealed && (
              <motion.div
                initial={{ opacity: 0.9, y: '-115%' }}
                animate={{ opacity: 0, y: '115%' }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.5) 40%, transparent 70%)',
                  pointerEvents: 'none',
                }}
              />
            )}
            {/* Sheen on front */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(${reflectAngle + 180}deg, rgba(255,255,255,0.18) 0%, transparent 45%, rgba(0,0,0,0.12) 100%)`,
              mixBlendMode: 'overlay',
            }} />
          </div>

          {/* Card edge — visible during mid-rotation */}
          <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: -3,
            width: 6,
            background: 'linear-gradient(to right, #555, #888, #555)',
            borderRadius: '2px 0 0 2px',
            transform: 'translateZ(0) rotateY(-90deg)',
            transformOrigin: 'right center',
            backfaceVisibility: 'hidden',
          }} />
        </div>
      </div>

      {/* Prize info when revealed */}
      <AnimatePresence>
        {isRevealed && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="absolute bottom-32 flex flex-col items-center gap-1 z-10"
          >
            <span className="text-white/65 text-xs font-bold tracking-[0.25em] uppercase">恭喜獲得</span>
            <span className="text-white font-black text-2xl leading-tight">{grade}</span>
            <span className="text-white/80 font-bold text-base">{prizeName}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Open / Continue button */}
      <div className="absolute bottom-8 w-full flex justify-center z-20">
        <AnimatePresence mode="wait">
          {!isRevealed && !isOpening && (
            <motion.button
              key="open"
              initial={{ opacity: 0, scale: 0.85, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 8 }}
              transition={{ delay: 0.6, type: 'spring', stiffness: 240 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleOpen}
              className="px-12 py-4 rounded-full font-black text-white text-lg tracking-wide"
              style={{
                background: 'linear-gradient(135deg, #22c55e, #15803d)',
                boxShadow: '0 6px 24px rgba(34,197,94,0.45), 0 0 0 3px rgba(34,197,94,0.2)',
              }}
            >
              Open
            </motion.button>
          )}
          {isRevealed && (
            <motion.button
              key="done"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onReveal}
              className="px-12 py-4 rounded-full font-black text-white text-lg tracking-wide"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                boxShadow: '0 6px 24px rgba(59,130,246,0.45)',
              }}
            >
              繼續
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
