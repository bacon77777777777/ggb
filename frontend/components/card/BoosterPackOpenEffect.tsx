'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';

interface BoosterPackProps {
  packImage?: string;
  cardBackImages: string[];
  onComplete?: () => void;
}

type Phase = 'idle' | 'charging' | 'tearing' | 'cards' | 'done';

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

const PACK_W = 170;
const PACK_H = 260;
const PERIMETER = 2 * (PACK_W + PACK_H); // 860

export default function BoosterPackOpenEffect({
  packImage,
  cardBackImages,
  onComplete,
}: BoosterPackProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [charge, setCharge] = useState(0); // 0–100
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const cardCount = cardBackImages.length;

  // Fixed random particle data — generated once
  const particles = useMemo(() => genParticles(24), []);

  // Auto-proceed from cards → done
  useEffect(() => {
    if (phase !== 'cards') return;
    const t = setTimeout(() => {
      setPhase('done');
      onComplete?.();
    }, 1200 + cardCount * 80);
    return () => clearTimeout(t);
  }, [phase, cardCount, onComplete]);

  // RAF loop drives charge 0→100 over ~700ms
  const tick = useCallback((now: number) => {
    const progress = Math.min((now - startRef.current) / 700, 1);
    setCharge(progress * 100);
    if (progress >= 1) {
      setPhase('tearing');
      setTimeout(() => setPhase('cards'), 420);
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

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

  // Pure-CSS pack face (used when packImage is absent)
  const renderFace = (extraStyle?: React.CSSProperties) => (
    <div
      style={{
        position: 'relative',
        width: PACK_W,
        height: PACK_H,
        borderRadius: 12,
        overflow: 'hidden',
        ...extraStyle,
      }}
    >
      {packImage ? (
        <Image src={packImage} alt="" fill className="object-cover" priority unoptimized />
      ) : (
        <>
          {/* Base */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(160deg, #1a0f3c 0%, #0a1628 35%, #0f2248 65%, #1a0f3c 100%)',
            }}
          />
          {/* Holographic foil */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(${125 + charge * 0.6}deg,
                transparent 15%,
                rgba(160,100,255,0.32) 38%,
                rgba(80,180,255,0.28) 50%,
                rgba(255,200,80,0.22) 62%,
                transparent 82%)`,
            }}
          />
          {/* Top seam line */}
          <div
            style={{
              position: 'absolute',
              top: '20%',
              left: 0,
              right: 0,
              borderTop: '1px solid rgba(255,255,255,0.22)',
            }}
          />
          {/* Brand */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                color: 'white',
                fontWeight: 900,
                fontSize: 26,
                letterSpacing: '0.3em',
                textShadow: '0 0 20px rgba(150,100,255,0.9), 0 0 40px rgba(100,150,255,0.5)',
              }}
            >
              GGB
            </div>
            <div
              style={{
                color: 'rgba(255,255,255,0.5)',
                fontSize: 9,
                letterSpacing: '0.5em',
                textTransform: 'uppercase',
              }}
            >
              Trading Card
            </div>
          </div>
          {/* Star dots */}
          {[
            [14, 10], [83, 13], [24, 62], [76, 70], [49, 30], [62, 80],
          ].map(([l, t], i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.75)',
                left: `${l}%`,
                top: `${t}%`,
              }}
            />
          ))}
          {/* Bottom glow */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '35%',
              background: 'linear-gradient(to top, rgba(99,102,241,0.28), transparent)',
            }}
          />
          {/* Charge inner glow */}
          {charge > 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(ellipse at 50% 20%, rgba(255,210,60,${charge / 280}), transparent 65%)`,
              }}
            />
          )}
        </>
      )}
      {/* SVG perimeter charge ring */}
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

        {/* ── Card fan ── */}
        {phase === 'cards' && (
          <motion.div
            key="cards-fan"
            style={{ position: 'relative', width: 210, height: 270, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {Array.from({ length: cardCount }).map((_, i) => {
              const center = (cardCount - 1) / 2;
              const offset = i - center;
              return (
                <motion.div
                  key={i}
                  style={{
                    position: 'absolute',
                    width: 105,
                    aspectRatio: '650 / 930',
                    borderRadius: 8,
                    overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                  }}
                  initial={{ opacity: 0, scale: 0.55, y: -40, x: 0, rotate: 0 }}
                  animate={{
                    opacity: 1,
                    scale: i === cardCount - 1 ? 1 : 0.91,
                    y: Math.abs(offset) * 6,
                    x: offset * 24,
                    rotate: offset * 14,
                  }}
                  transition={{ duration: 0.42, ease: 'easeOut', delay: i * 0.065 }}
                >
                  <Image
                    src={
                      cardBackImages[i] ||
                      cardBackImages[cardBackImages.length - 1] ||
                      '/images/card/cardback4.png'
                    }
                    alt=""
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </motion.div>
              );
            })}
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
      {(phase === 'tearing' || phase === 'cards') && (
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
