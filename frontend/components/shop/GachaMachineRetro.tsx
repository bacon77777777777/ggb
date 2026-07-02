'use client'

import React, { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface GachaMachineRetroProps {
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

const BALL_COLORS = ['#FF4444', '#FF8C00', '#FFD700', '#44BB44', '#4488FF', '#CC44FF', '#FF44AA', '#00CCAA']

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a)
}

interface Ball {
  id: number
  x: number
  y: number
  color: string
  size: number
  delay: number
}

function generateBalls(): Ball[] {
  return Array.from({ length: 14 }, (_, i) => ({
    id: i,
    x: randomBetween(12, 88),
    y: randomBetween(10, 82),
    color: BALL_COLORS[i % BALL_COLORS.length],
    size: randomBetween(22, 32),
    delay: randomBetween(0, 2),
  }))
}

export function GachaMachineRetro(props: GachaMachineRetroProps) {
  const {
    state,
    onPush,
    onPurchase,
    onTrial,
    onHoleClick,
    onLoaded,
    isSoldOut = false,
  } = props

  const [balls] = useState<Ball[]>(generateBalls)
  const [droppingBall, setDroppingBall] = useState<{ color: string; size: number } | null>(null)
  const [crankAngle, setCrankAngle] = useState(0)
  const crankRef = useRef(0)

  useEffect(() => { onLoaded?.() }, [onLoaded])

  useEffect(() => {
    if (state === 'spinning') {
      const ball = { color: BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)], size: 28 }
      setDroppingBall(ball)
      // animate crank
      const start = crankRef.current
      let frame = 0
      const spin = () => {
        frame++
        crankRef.current = start + frame * 18
        setCrankAngle(crankRef.current)
        if (frame < 20) requestAnimationFrame(spin)
      }
      requestAnimationFrame(spin)
    }
    if (state === 'idle') {
      setDroppingBall(null)
    }
  }, [state])

  const isActive = state !== 'idle'
  const isWaiting = state === 'waiting'
  const showOutlet = state === 'waiting' || state === 'result'

  return (
    <div className="flex flex-col items-center select-none" style={{ paddingTop: 16, paddingBottom: 16 }}>

      {/* ── Machine ── */}
      <motion.div
        style={{ position: 'relative', width: 260, height: 460 }}
        animate={state === 'shaking' ? { x: [-12, 12, -10, 10, -6, 6, -3, 3, 0] } : {}}
        transition={{ duration: 0.6 }}
      >

        {/* Legs */}
        {[-1, 1].map(side => (
          <div key={side} style={{
            position: 'absolute',
            bottom: 0,
            left: side === -1 ? 28 : undefined,
            right: side === 1 ? 28 : undefined,
            width: 22,
            height: 36,
            background: 'linear-gradient(to bottom, #555, #333)',
            borderRadius: '0 0 8px 8px',
          }} />
        ))}

        {/* Base cabinet */}
        <div style={{
          position: 'absolute',
          left: 0, bottom: 30,
          width: 260, height: 200,
          background: 'linear-gradient(160deg, #CC1111 0%, #880000 100%)',
          borderRadius: '18px 18px 12px 12px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
          border: '2px solid rgba(255,255,255,0.08)',
        }}>

          {/* Label plate */}
          <div style={{
            position: 'absolute', top: 16, left: 20, right: 20, height: 32,
            background: 'linear-gradient(90deg, #FFD700, #FFA500)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(255,165,0,0.5)',
          }}>
            <span style={{ fontWeight: 900, fontSize: 15, color: '#7B0000', letterSpacing: '0.2em' }}>
              ★ GASHAPON ★
            </span>
          </div>

          {/* Coin slot */}
          <div style={{
            position: 'absolute', right: 20, top: 62,
            width: 28, height: 8,
            background: '#111',
            borderRadius: 4,
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
          }} />
          <div style={{
            position: 'absolute', right: 14, top: 54,
            fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700,
          }}>COIN</div>

          {/* Chute tube */}
          <div style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            top: 60, width: 34, height: 80,
            background: 'linear-gradient(to right, #991111, #CC1111, #991111)',
            borderLeft: '2px solid rgba(255,255,255,0.15)',
            borderRight: '2px solid rgba(255,255,255,0.15)',
          }} />

          {/* Dropping ball */}
          <AnimatePresence>
            {state === 'dropping' && droppingBall && (
              <motion.div
                style={{
                  position: 'absolute',
                  left: '50%', marginLeft: -droppingBall.size / 2,
                  width: droppingBall.size, height: droppingBall.size,
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 30%, white, ${droppingBall.color})`,
                  boxShadow: `0 0 12px ${droppingBall.color}88`,
                  zIndex: 10,
                }}
                initial={{ top: 10 }}
                animate={{ top: 130 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: 'easeIn' }}
              />
            )}
          </AnimatePresence>

          {/* Outlet */}
          <motion.div
            onClick={isWaiting ? onHoleClick : undefined}
            style={{
              position: 'absolute', bottom: 14, left: 40, right: 40,
              height: 54,
              background: '#111',
              borderRadius: 12,
              border: `2px solid ${isWaiting ? '#FFD700' : '#333'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isWaiting ? 'pointer' : 'default',
              overflow: 'hidden',
            }}
            animate={isWaiting ? {
              borderColor: ['#FFD700', '#FF8C00', '#FFD700'],
              boxShadow: ['0 0 0px #FFD70000', '0 0 20px #FFD70066', '0 0 0px #FFD70000'],
            } : {}}
            transition={{ duration: 1.2, repeat: isWaiting ? Infinity : 0 }}
          >
            <AnimatePresence>
              {showOutlet && droppingBall && (
                <motion.div
                  initial={{ scale: 0, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: `radial-gradient(circle at 35% 30%, white, ${droppingBall.color})`,
                    boxShadow: `0 0 16px ${droppingBall.color}`,
                  }}
                />
              )}
            </AnimatePresence>
            {!showOutlet && <span style={{ color: '#555', fontSize: 11, fontWeight: 700 }}>取 出 口</span>}
            {isWaiting && (
              <motion.span
                style={{ position: 'absolute', right: 8, fontSize: 10, fontWeight: 800, color: '#FFD700' }}
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 0.7, repeat: Infinity }}
              >
                點擊 ▶
              </motion.span>
            )}
          </motion.div>
        </div>

        {/* Globe neck */}
        <div style={{
          position: 'absolute',
          left: '50%', transform: 'translateX(-50%)',
          bottom: 228, width: 60, height: 30,
          background: 'linear-gradient(to bottom, #AA0000, #CC1111)',
          borderLeft: '2px solid rgba(255,255,255,0.1)',
          borderRight: '2px solid rgba(255,255,255,0.1)',
        }} />

        {/* Globe */}
        <motion.div
          style={{
            position: 'absolute',
            left: '50%', transform: 'translateX(-50%)',
            bottom: 248,
            width: 200, height: 200,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 38% 32%, rgba(255,255,255,0.55), rgba(200,230,255,0.15) 55%, rgba(100,160,220,0.08))',
            border: '3px solid rgba(255,255,255,0.35)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 2px 8px rgba(255,255,255,0.25)',
            overflow: 'hidden',
          }}
          animate={state === 'spinning' ? { rotate: [0, 5, -5, 3, -3, 0] } : {}}
          transition={{ duration: 0.6 }}
        >
          {/* Balls inside */}
          <AnimatePresence>
            {balls.map(ball => (
              <motion.div
                key={ball.id}
                style={{
                  position: 'absolute',
                  left: `${ball.x}%`,
                  top: `${ball.y}%`,
                  width: ball.size,
                  height: ball.size,
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 30%, white, ${ball.color})`,
                  boxShadow: `0 2px 6px rgba(0,0,0,0.25)`,
                  transform: 'translate(-50%, -50%)',
                  opacity: state === 'dropping' && ball.id === 0 ? 0 : 1,
                }}
                animate={{ y: [-4, 4, -4] }}
                transition={{ duration: 2 + ball.delay * 0.3, repeat: Infinity, delay: ball.delay, ease: 'easeInOut' }}
              />
            ))}
          </AnimatePresence>

          {/* Spinning vortex overlay */}
          {state === 'spinning' && (
            <motion.div
              style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
                borderRadius: '50%',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.4, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </motion.div>

        {/* Crank handle (right side) */}
        <div style={{
          position: 'absolute',
          right: -44, bottom: 100,
          display: 'flex', alignItems: 'center',
        }}>
          {/* arm */}
          <div style={{ width: 44, height: 8, background: 'linear-gradient(to right, #CC1111, #888)', borderRadius: 4 }} />
          {/* knob */}
          <motion.div
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #FFD700, #B8860B)',
              boxShadow: '0 2px 10px rgba(255,215,0,0.6)',
              transformOrigin: '-22px center',
            }}
            animate={{ rotate: crankAngle }}
          />
        </div>

        {/* Decoration lights on cabinet */}
        <div style={{
          position: 'absolute', bottom: 36, left: 10,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {[0, 1, 2].map(i => (
            <motion.div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: ['#FFD700', '#FF4444', '#44FF44'][i],
              boxShadow: `0 0 6px ${'#FFD700,#FF4444,#44FF44'.split(',')[i]}`,
            }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.25 }}
            />
          ))}
        </div>
      </motion.div>

      {/* ── Buttons ── */}
      <div className="flex gap-3 mt-5">
        <button
          onClick={!isActive && !isSoldOut ? onPush : undefined}
          disabled={isActive || isSoldOut}
          style={{
            padding: '10px 16px', borderRadius: 12,
            fontWeight: 900, fontSize: 13, color: '#fff',
            background: isActive || isSoldOut ? '#555' : 'linear-gradient(135deg, #888, #555)',
            boxShadow: isActive || isSoldOut ? 'none' : '0 4px 12px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: isActive || isSoldOut ? 'not-allowed' : 'pointer',
          }}
        >
          推一下
        </button>

        <button
          onClick={!isActive && !isSoldOut ? onPurchase : undefined}
          disabled={isActive || isSoldOut}
          style={{
            padding: '10px 22px', borderRadius: 12,
            fontWeight: 900, fontSize: 13,
            color: isActive || isSoldOut ? '#fff' : '#3B1E00',
            background: isSoldOut ? '#555' : isActive ? '#555' : 'linear-gradient(135deg, #FFD700, #B8860B)',
            boxShadow: isActive || isSoldOut ? 'none' : '0 4px 12px rgba(255,200,0,0.5)',
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: isActive || isSoldOut ? 'not-allowed' : 'pointer',
          }}
        >
          {isSoldOut ? '已完抽' : '立即轉蛋'}
        </button>

        <button
          onClick={!isActive ? onTrial : undefined}
          disabled={isActive}
          style={{
            padding: '10px 16px', borderRadius: 12,
            fontWeight: 900, fontSize: 13, color: '#fff',
            background: isActive ? '#555' : 'linear-gradient(135deg, #CC1111, #880000)',
            boxShadow: isActive ? 'none' : '0 4px 12px rgba(200,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: isActive ? 'not-allowed' : 'pointer',
          }}
        >
          試試看
        </button>
      </div>
    </div>
  )
}
