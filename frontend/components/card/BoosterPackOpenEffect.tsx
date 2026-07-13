'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';

interface BoosterPackProps {
  packImage?: string;
  onComplete?: () => void;
}

type Phase = 'idle' | 'charging' | 'tearing' | 'done';

interface Particle {
  id: number;
  color: string;
  w: number;
  tx: number;
  ty: number;
  delay: number;
}

const BURST_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#A78BFA', '#34D399', '#F97316', '#FB923C', '#60A5FA'];

function genParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (360 / n) * i * (Math.PI / 180);
    const dist = 100 + Math.floor(Math.random() * 90);
    return {
      id: i,
      color: BURST_COLORS[i % BURST_COLORS.length],
      w: 5 + Math.floor(Math.random() * 7),
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      delay: Math.random() * 0.07,
    };
  });
}

// Jagged tear at y=21% — top and bottom must share identical points
const TOP_CLIP =
  'polygon(0% 0%, 100% 0%, 100% 21%, 91% 19%, 83% 22%, 74% 18%, 65% 22%, 57% 18%, 48% 22%, 39% 18%, 30% 22%, 22% 19%, 13% 22%, 5% 18%, 0% 21%)';
const BOTTOM_CLIP =
  'polygon(0% 21%, 5% 18%, 13% 22%, 22% 19%, 30% 22%, 39% 18%, 48% 22%, 57% 18%, 65% 22%, 74% 18%, 83% 22%, 91% 19%, 100% 21%, 100% 100%, 0% 100%)';

// Match front.png / light.svg aspect ratio (384:557 ≈ 0.689)
const PACK_W = 176;
const PACK_H = 256;
const PERIMETER = 2 * (PACK_W + PACK_H); // 864

export default function BoosterPackOpenEffect({
  packImage,
  onComplete,
}: BoosterPackProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [charge, setCharge] = useState(0); // 0–100
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  // Fixed random particle data — generated once
  const particles = useMemo(() => genParticles(24), []);

  // RAF loop drives charge 0→100 over ~700ms
  const tick = useCallback((now: number) => {
    const progress = Math.min((now - startRef.current) / 700, 1);
    setCharge(progress * 100);
    if (progress >= 1) {
      setPhase('tearing');
      // Skip card-back fan — go directly to swipe phase
      setTimeout(() => {
        setPhase('done');
        onComplete?.();
      }, 420);
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [onComplete]);

  const startCharge = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('charging');
    setCharge(0);
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [phase, tick]);

  const cancelCharge = useCallback(() => {
    if (phase !== 'charging') return;
    cancelAnimationFrame(rafRef.current);
    setCharge(0);
    setPhase('idle');
  }, [phase]);

  const imgSrc = packImage ?? '/images/card/front.png';

  // Pack face — uses actual bag image + light.svg outline for charge glow
  const renderFace = (extraStyle?: React.CSSProperties) => (
    <div
      style={{
        position: 'relative',
        width: PACK_W,
        height: PACK_H,
        ...extraStyle,
      }}
    >
      {/* Bag image */}
      <Image src={imgSrc} alt="" fill className="object-contain" priority unoptimized />

      {/* Perimeter charge ring — traces around the pack as charge fills */}
      {charge > 0 && (
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
          viewBox={`0 0 ${PACK_W} ${PACK_H}`}
        >
          <rect
            x={2} y={2}
            width={PACK_W - 4} height={PACK_H - 4}
            rx={10}
            fill="none"
            stroke="rgba(255,205,50,0.9)"
            strokeWidth={2.5}
            strokeDasharray={`${(charge / 100) * PERIMETER} ${PERIMETER}`}
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 4px rgba(255,205,50,0.85))' }}
          />
        </svg>
      )}
    </div>
  );

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 380,
        margin: '0 auto',
        height: 380,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
      }}
    >
      {/* Ambient glow */}
      <AnimatePresence>
        {(phase === 'idle' || phase === 'charging') && (
          <motion.div
            key="ambient"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              style={{
                width: 260,
                height: 260,
                borderRadius: '50%',
                background: phase === 'charging'
                  ? 'radial-gradient(circle, rgba(255,200,60,0.25) 0%, rgba(99,102,241,0.2) 50%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
              }}
              animate={{
                scale: phase === 'charging' ? [1, 1.45, 1] : [1, 1.12, 1],
                opacity: phase === 'charging' ? [0.6, 1, 0.6] : [0.35, 0.55, 0.35],
              }}
              transition={{
                duration: phase === 'charging' ? 0.42 : 2.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pack (idle + charging) ── */}
      <AnimatePresence mode="popLayout">
        {(phase === 'idle' || phase === 'charging') && (
          <motion.div
            key="pack-wrapper"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, y: -10 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <motion.button
              type="button"
              style={{
                position: 'relative',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                userSelect: 'none',
                touchAction: 'none',
                WebkitUserSelect: 'none',
              }}
              onPointerDown={startCharge}
              onPointerUp={cancelCharge}
              onPointerLeave={cancelCharge}
              onPointerCancel={cancelCharge}
              // Floating when idle, vibrating when charging
              animate={
                phase === 'idle'
                  ? { y: [0, -10, 0] }
                  : { rotate: [-3, 3, -2.5, 2.5, -1.5, 1.5, 0] }
              }
              transition={
                phase === 'idle'
                  ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.32, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              {/* Drop shadow that syncs with float */}
              <motion.div
                style={{
                  position: 'absolute',
                  bottom: -10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 130,
                  height: 8,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.45)',
                  filter: 'blur(6px)',
                }}
                animate={phase === 'idle' ? { scaleX: [1, 0.78, 1], opacity: [0.45, 0.65, 0.45] } : { scaleX: 0.9, opacity: 0.3 }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              {renderFace()}
            </motion.button>

            {/* Hint / charge text */}
            {phase === 'idle' ? (
              <motion.p
                style={{ color: 'rgba(255,255,255,0.48)', fontSize: 11, letterSpacing: '0.35em', textAlign: 'center' }}
                animate={{ opacity: [0.35, 0.75, 0.35] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                按住撕開卡包
              </motion.p>
            ) : (
              <motion.p
                style={{ color: 'rgba(255,210,60,0.85)', fontSize: 11, letterSpacing: '0.35em', textAlign: 'center' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 0.3, repeat: Infinity }}
              >
                蓄力中…
              </motion.p>
            )}
          </motion.div>
        )}

        {/* ── Tearing ── */}
        {phase === 'tearing' && (
          <motion.div
            key="tearing"
            style={{ position: 'relative', width: PACK_W, height: PACK_H }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Top piece flies upward */}
            <motion.div
              style={{ position: 'absolute', inset: 0, clipPath: TOP_CLIP }}
              initial={{ y: 0, rotate: 0, opacity: 1 }}
              animate={{ y: -220, rotate: -7, opacity: 0 }}
              transition={{ duration: 0.38, ease: [0.18, 0, 0.42, 1] }}
            >
              {renderFace()}
            </motion.div>
            {/* Bottom piece drops */}
            <motion.div
              style={{ position: 'absolute', inset: 0, clipPath: BOTTOM_CLIP }}
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: 50, opacity: 0 }}
              transition={{ duration: 0.38, ease: 'easeIn', delay: 0.04 }}
            >
              {renderFace()}
            </motion.div>
            {/* Tear glow line */}
            <motion.div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '20%',
                height: 7,
                background:
                  'linear-gradient(90deg, transparent, rgba(255,215,90,0.85), rgba(255,255,255,1), rgba(255,215,90,0.85), transparent)',
                filter: 'blur(2.5px)',
                transformOrigin: 'center',
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: [0, 1, 0] }}
              transition={{ duration: 0.38 }}
            />
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── White flash ── */}
      <AnimatePresence>
        {phase === 'tearing' && (
          <motion.div
            key="flash"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1400,
              background: 'white',
              pointerEvents: 'none',
            }}
            initial={{ opacity: 0.92 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* ── Particle burst ── */}
      {phase === 'tearing' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1390,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {particles.map(p => (
            <motion.div
              key={p.id}
              style={{
                position: 'absolute',
                left: '50%',
                top: '42%',
                width: p.w,
                height: p.w,
                borderRadius: '50%',
                background: p.color,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: p.tx, y: p.ty, opacity: 0, scale: 0.25 }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: p.delay }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
