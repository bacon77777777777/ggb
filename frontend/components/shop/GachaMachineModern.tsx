'use client'

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface GachaMachineModernProps {
  state: 'idle' | 'shaking' | 'spinning' | 'dropping' | 'waiting' | 'result'
  shakeRepeats?: number
  onPush?: () => void
  onPurchase?: () => void
  onTrial?: () => void
  onHoleClick?: () => void
  onLoaded?: () => void
  isSoldOut?: boolean
  pushSoundMode?: 'manual' | 'auto'
  hasHighTierPending?: boolean
}

const COLORS = [
  { top: '#FF6B6B', bot: '#C0392B' },
  { top: '#FFD93D', bot: '#F39C12' },
  { top: '#6BCB77', bot: '#27AE60' },
  { top: '#4D96FF', bot: '#2980B9' },
  { top: '#C77DFF', bot: '#8E44AD' },
  { top: '#FF9A3C', bot: '#E67E22' },
  { top: '#48CAE4', bot: '#0096C7' },
  { top: '#FF6B9D', bot: '#C2185B' },
  { top: '#95D5B2', bot: '#52B788' },
  { top: '#FFB347', bot: '#E67E22' },
  { top: '#B5EAEA', bot: '#48CAE4' },
  { top: '#FFC6FF', bot: '#C77DFF' },
]

const GRID_POSITIONS: { col: number; row: number; colorIdx: number }[] = [
  { col: 0, row: 0, colorIdx: 0 }, { col: 1, row: 0, colorIdx: 1 }, { col: 2, row: 0, colorIdx: 2 }, { col: 3, row: 0, colorIdx: 3 },
  { col: 0, row: 1, colorIdx: 4 }, { col: 1, row: 1, colorIdx: 5 }, { col: 2, row: 1, colorIdx: 6 }, { col: 3, row: 1, colorIdx: 7 },
  { col: 0, row: 2, colorIdx: 8 }, { col: 1, row: 2, colorIdx: 9 }, { col: 2, row: 2, colorIdx: 10 }, { col: 3, row: 2, colorIdx: 11 },
]

function Capsule({ color, delay, size = 40 }: { color: typeof COLORS[0]; delay: number; size?: number }) {
  return (
    <motion.div
      style={{ width: size, height: size, flexShrink: 0 }}
      animate={{ y: [-3, 3, -3] }}
      transition={{ duration: 2.2, repeat: Infinity, delay, ease: 'easeInOut' }}
    >
      {/* top half */}
      <div style={{
        width: size, height: size / 2,
        borderRadius: `${size / 2}px ${size / 2}px 0 0`,
        background: `linear-gradient(145deg, ${color.top}cc, ${color.top})`,
        boxShadow: `inset 0 2px 4px rgba(255,255,255,0.4)`,
      }} />
      {/* seam */}
      <div style={{ width: size, height: 2, background: 'rgba(0,0,0,0.15)' }} />
      {/* bottom half */}
      <div style={{
        width: size, height: size / 2 - 2,
        borderRadius: `0 0 ${size / 2}px ${size / 2}px`,
        background: `linear-gradient(145deg, ${color.bot}, ${color.bot}cc)`,
        boxShadow: `inset 0 -2px 4px rgba(0,0,0,0.2)`,
      }} />
    </motion.div>
  )
}

export function GachaMachineModern(props: GachaMachineModernProps) {
  const {
    state,
    onPush,
    onPurchase,
    onTrial,
    onHoleClick,
    onLoaded,
    isSoldOut = false,
  } = props

  const [droppingColor, setDroppingColor] = useState<typeof COLORS[0]>(COLORS[0])
  const [hiddenCapsule, setHiddenCapsule] = useState<number | null>(null)

  useEffect(() => { onLoaded?.() }, [onLoaded])

  useEffect(() => {
    if (state === 'spinning') {
      const idx = Math.floor(Math.random() * COLORS.length)
      setDroppingColor(COLORS[idx])
      setHiddenCapsule(idx % 12)
    }
    if (state === 'idle') {
      setHiddenCapsule(null)
    }
  }, [state])

  const isActive = state !== 'idle'
  const showOutletCapsule = state === 'waiting' || state === 'result'
  const showDropping = state === 'dropping'
  const isWaiting = state === 'waiting'

  return (
    <div
      className="flex flex-col items-center w-full select-none"
      style={{ paddingTop: 20, paddingBottom: 16 }}
    >
      {/* Machine wrapper */}
      <motion.div
        className="relative flex"
        style={{ width: 320, height: 440 }}
        animate={
          state === 'shaking'
            ? { x: [-10, 10, -8, 8, -5, 5, -3, 3, 0] }
            : state === 'spinning'
            ? { rotate: [-1.5, 1.5, -1, 1, 0] }
            : {}
        }
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        {/* ── Left leg ── */}
        <div style={{
          position: 'absolute', bottom: 0, left: 40, width: 18, height: 30,
          background: 'linear-gradient(to bottom, #6B7280, #4B5563)',
          borderRadius: '0 0 6px 6px',
        }} />
        <div style={{
          position: 'absolute', bottom: 0, right: 40, width: 18, height: 30,
          background: 'linear-gradient(to bottom, #6B7280, #4B5563)',
          borderRadius: '0 0 6px 6px',
        }} />

        {/* ── Main body ── */}
        <div style={{
          position: 'absolute', left: 0, top: 0,
          width: 320, height: 420,
          background: 'linear-gradient(160deg, #F8FAFC 0%, #E2E8F0 100%)',
          borderRadius: 28,
          boxShadow: '0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.9)',
          border: '1.5px solid rgba(255,255,255,0.8)',
          overflow: 'hidden',
        }}>

          {/* Top colour band */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 52,
            background: 'linear-gradient(90deg, #6366F1, #A855F7, #EC4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6,
          }}>
            <span style={{ fontSize: 22 }}>🌀</span>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 18, letterSpacing: '0.2em' }}>GACHA</span>
            <span style={{ fontSize: 22 }}>✨</span>
          </div>

          {/* Glass window with capsule grid */}
          <div style={{
            position: 'absolute', left: 20, top: 66, width: 280, height: 210,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(219,234,254,0.4) 100%)',
            borderRadius: 18,
            border: '2px solid rgba(255,255,255,0.9)',
            boxShadow: 'inset 0 2px 12px rgba(99,102,241,0.08), 0 2px 8px rgba(0,0,0,0.06)',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(3, 1fr)',
            alignItems: 'center',
            justifyItems: 'center',
            padding: 12,
            gap: 4,
            overflow: 'hidden',
          }}>
            {GRID_POSITIONS.map(({ colorIdx }, i) => (
              <AnimatePresence key={i}>
                {hiddenCapsule !== i && (
                  <motion.div
                    initial={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Capsule color={COLORS[colorIdx]} delay={i * 0.08} size={38} />
                  </motion.div>
                )}
                {hiddenCapsule === i && <div key={`empty-${i}`} style={{ width: 38, height: 38 }} />}
              </AnimatePresence>
            ))}

            {/* Spinning overlay */}
            {state === 'spinning' && (
              <motion.div
                style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(99,102,241,0.06)',
                  borderRadius: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              >
                <motion.div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  border: '4px solid rgba(99,102,241,0.8)',
                  borderTopColor: 'transparent',
                }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}
                />
              </motion.div>
            )}
          </div>

          {/* Chute tube */}
          <div style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            top: 276, width: 36, height: 56,
            background: 'linear-gradient(to right, #CBD5E1, #E2E8F0, #CBD5E1)',
            borderLeft: '2px solid #94A3B8',
            borderRight: '2px solid #94A3B8',
          }} />

          {/* Dropping capsule animation */}
          <AnimatePresence>
            {showDropping && (
              <motion.div
                style={{
                  position: 'absolute',
                  left: '50%', marginLeft: -19,
                  width: 38, height: 38, zIndex: 10,
                }}
                initial={{ top: 80, opacity: 1 }}
                animate={{ top: 282 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <Capsule color={droppingColor} delay={0} size={38} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Outlet tray */}
          <motion.div
            onClick={isWaiting ? onHoleClick : undefined}
            style={{
              position: 'absolute', left: 20, bottom: 16,
              width: 280, height: 62,
              borderRadius: 16,
              background: isWaiting
                ? 'linear-gradient(135deg, rgba(253,230,138,0.3), rgba(251,191,36,0.15))'
                : 'rgba(148,163,184,0.15)',
              border: `2px solid ${isWaiting ? 'rgba(251,191,36,0.8)' : 'rgba(148,163,184,0.3)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isWaiting ? 'pointer' : 'default',
              overflow: 'hidden',
            }}
            animate={isWaiting ? {
              boxShadow: [
                '0 0 0px rgba(251,191,36,0)',
                '0 0 24px rgba(251,191,36,0.5)',
                '0 0 0px rgba(251,191,36,0)',
              ],
            } : { boxShadow: 'none' }}
            transition={{ duration: 1.4, repeat: isWaiting ? Infinity : 0 }}
          >
            <AnimatePresence>
              {showOutletCapsule && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                >
                  <Capsule color={droppingColor} delay={0} size={44} />
                </motion.div>
              )}
            </AnimatePresence>
            {!showOutletCapsule && (
              <span style={{ color: '#94A3B8', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>
                取 出 口
              </span>
            )}
            {isWaiting && (
              <motion.div
                style={{
                  position: 'absolute', right: 12,
                  fontSize: 12, fontWeight: 800, color: '#D97706',
                  letterSpacing: '0.05em',
                }}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              >
                點擊取出 ▶
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* ── Side handle / crank ── */}
        <motion.div
          style={{
            position: 'absolute', right: -32, top: 140,
            width: 32, height: 100,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}
          animate={state === 'spinning' ? { rotate: [0, -30, 360] } : {}}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        >
          {/* arm */}
          <div style={{
            width: 8, height: 70,
            background: 'linear-gradient(to bottom, #6B7280, #9CA3AF)',
            borderRadius: 4,
          }} />
          {/* knob */}
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #FCD34D, #F59E0B)',
            boxShadow: '0 2px 8px rgba(245,158,11,0.5)',
            marginTop: 2,
          }} />
        </motion.div>
      </motion.div>

      {/* ── Buttons ── */}
      <div className="flex gap-3 mt-5">
        <button
          onClick={!isActive && !isSoldOut ? onPush : undefined}
          disabled={isActive || isSoldOut}
          style={{
            padding: '10px 18px',
            borderRadius: 14,
            fontWeight: 900,
            fontSize: 14,
            color: '#fff',
            background: isActive || isSoldOut
              ? '#CBD5E1'
              : 'linear-gradient(135deg, #A78BFA, #7C3AED)',
            boxShadow: isActive || isSoldOut ? 'none' : '0 4px 14px rgba(124,58,237,0.4)',
            border: 'none',
            cursor: isActive || isSoldOut ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          推一下
        </button>

        <button
          onClick={!isActive && !isSoldOut ? onPurchase : undefined}
          disabled={isActive || isSoldOut}
          style={{
            padding: '10px 24px',
            borderRadius: 14,
            fontWeight: 900,
            fontSize: 14,
            color: '#fff',
            background: isSoldOut
              ? '#CBD5E1'
              : isActive
              ? '#CBD5E1'
              : 'linear-gradient(135deg, #EC4899, #BE185D)',
            boxShadow: isActive || isSoldOut ? 'none' : '0 4px 14px rgba(190,24,93,0.4)',
            border: 'none',
            cursor: isActive || isSoldOut ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {isSoldOut ? '已完抽' : '立即轉蛋'}
        </button>

        <button
          onClick={!isActive ? onTrial : undefined}
          disabled={isActive}
          style={{
            padding: '10px 18px',
            borderRadius: 14,
            fontWeight: 900,
            fontSize: 14,
            color: '#fff',
            background: isActive
              ? '#CBD5E1'
              : 'linear-gradient(135deg, #34D399, #059669)',
            boxShadow: isActive ? 'none' : '0 4px 14px rgba(5,150,105,0.4)',
            border: 'none',
            cursor: isActive ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          試試看
        </button>
      </div>
    </div>
  )
}
