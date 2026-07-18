'use client';

import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageButton } from '@/components/ui/ImageButton';

interface GachaMachineMode2Props {
  state: 'idle' | 'shaking' | 'spinning' | 'dropping' | 'waiting' | 'result';
  shakeRepeats?: number;
  onPush?: () => void;
  onPurchase?: () => void;
  onTrial?: () => void;
  onHoleClick?: () => void;
  onLoaded?: () => void;
  isSoldOut?: boolean;
  pushSoundMode?: 'manual' | 'auto';
  hasHighTierPending?: boolean;
}

const EGG_IMAGES = ['/images/gacha/begg.png', '/images/gacha/gegg.png', '/images/gacha/pegg.png'];

interface Egg {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  src: string;
  angle: number;
  angularVelocity: number;
}

const useDropSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio('/audio/spinopel-open-a-egg-carton-345737.mp3');
    audio.preload = 'auto';
    audioRef.current = audio;
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
    };
  }, []);
  return () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  };
};

export function GachaMachineMode2({
  state,
  shakeRepeats = 1,
  onPush,
  onPurchase,
  onTrial,
  onHoleClick,
  onLoaded,
  isSoldOut = false,
  pushSoundMode = 'auto',
  hasHighTierPending,
}: GachaMachineMode2Props) {
  const createInitialEggs = (): Egg[] => {
    const count = 15;
    const radius = 0.1;
    const sources: string[] = [];
    const others = [EGG_IMAGES[0], EGG_IMAGES[2]];
    for (let i = 0; i < Math.min(2, count); i++) sources.push(EGG_IMAGES[1]);
    for (let i = 0; i < count - sources.length; i++) sources.push(others[i % others.length]);
    for (let i = sources.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sources[i], sources[j]] = [sources[j], sources[i]];
    }
    const eggs: Egg[] = [];
    for (let i = 0; i < count; i++) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 50) {
        const x = radius + Math.random() * (1 - radius * 2);
        const y = 0.7 + Math.random() * 0.18;
        const overlapping = eggs.some((e) => {
          const dx = e.x - x, dy = e.y - y;
          return dx * dx + dy * dy < (e.radius + radius) ** 2 * 0.9;
        });
        if (!overlapping) {
          eggs.push({ id: i, x, y, vx: 0, vy: 0, radius, src: sources[i] || EGG_IMAGES[0], angle: 0, angularVelocity: 0 });
          placed = true;
        }
        attempts++;
      }
      if (!placed) {
        eggs.push({ id: i, x: radius + Math.random() * (1 - radius * 2), y: 0.8, vx: 0, vy: 0, radius, src: sources[i] || EGG_IMAGES[0], angle: 0, angularVelocity: 0 });
      }
    }
    return eggs;
  };

  const manualPushSoundRef = useRef<HTMLAudioElement | null>(null);
  const autoPushSoundRef = useRef<HTMLAudioElement | null>(null);
  const hasNotifiedLoadedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const manual = new Audio('/audio/gachapush.mp3');
    manual.preload = 'auto';
    manualPushSoundRef.current = manual;
    const auto = new Audio('/audio/gacha.mp3');
    auto.preload = 'auto';
    autoPushSoundRef.current = auto;
    return () => {
      [manualPushSoundRef, autoPushSoundRef].forEach((ref) => {
        if (ref.current) { ref.current.pause(); ref.current.src = ''; ref.current.load(); }
      });
    };
  }, []);

  const playDropSound = useDropSound();
  const [eggs, setEggs] = useState<Egg[]>(() => createInitialEggs());
  const eggsRef = useRef<Egg[]>(eggs);
  const [dropEggSrc, setDropEggSrc] = useState<string>(EGG_IMAGES[0]);
  const dropEggAltIndexRef = useRef(0);
  const [switchAngle, setSwitchAngle] = useState(0);

  const isSpinning = state === 'spinning';
  const isShaking = state === 'shaking';
  const isDropping = state === 'dropping';
  const isWaiting = state === 'waiting';

  const stateRef = useRef({ isSpinning, isShaking });
  const prevIsShakingRef = useRef(false);
  const prevIsDroppingRef = useRef(isDropping);
  const prevIsSpinningRef = useRef(false);
  const lastShakeTimeRef = useRef<number | null>(null);
  const applyShakeImpulseRef = useRef<(() => void) | null>(null);

  useEffect(() => { eggsRef.current = eggs; }, [eggs]);
  useEffect(() => { if (isSoldOut) setEggs([]); }, [isSoldOut]);
  useEffect(() => { stateRef.current = { isSpinning, isShaking }; }, [isSpinning, isShaking]);

  // Spin starts → rotate switch 360°
  useEffect(() => {
    if (isSpinning && !prevIsSpinningRef.current) {
      setSwitchAngle((prev) => prev + 360);
    }
    prevIsSpinningRef.current = isSpinning;
  }, [isSpinning]);

  useEffect(() => {
    applyShakeImpulseRef.current = () => {
      if (pushSoundMode === 'auto') {
        const audio = autoPushSoundRef.current;
        if (audio) { audio.pause(); audio.currentTime = 0; void audio.play().catch(() => {}); }
      }
      lastShakeTimeRef.current = performance.now() / 1000;
      const next = eggsRef.current.map((egg) => {
        const a = Math.random() * Math.PI * 2;
        return { ...egg, vx: egg.vx + Math.cos(a) * 4, vy: egg.vy - Math.abs(Math.sin(a)) * 4 - 6 };
      });
      eggsRef.current = next;
      setEggs(next);
    };
  }, [pushSoundMode]);

  useEffect(() => {
    const timeouts: number[] = [];
    if (isShaking && !prevIsShakingRef.current && applyShakeImpulseRef.current) {
      const repeats = Math.max(1, Math.floor(shakeRepeats));
      const baseInterval = pushSoundMode === 'manual' ? 0 : 1000;
      for (let i = 0; i < repeats; i++) {
        const id = window.setTimeout(() => {
          if (stateRef.current.isShaking) applyShakeImpulseRef.current?.();
        }, Math.max(0, i * baseInterval));
        timeouts.push(id);
      }
    }
    prevIsShakingRef.current = isShaking;
    return () => timeouts.forEach(clearTimeout);
  }, [isShaking, shakeRepeats, pushSoundMode]);

  useEffect(() => {
    if (isDropping && !prevIsDroppingRef.current) {
      if (isSoldOut || hasHighTierPending) {
        setDropEggSrc(EGG_IMAGES[1] || EGG_IMAGES[0]);
      } else {
        const pool = [EGG_IMAGES[0], EGG_IMAGES[2]];
        setDropEggSrc(pool[dropEggAltIndexRef.current++ % pool.length]);
      }
      playDropSound();
    }
    prevIsDroppingRef.current = isDropping;
  }, [isDropping, isSoldOut, hasHighTierPending, playDropSound]);

  // Physics loop (same as GachaMachineVisual)
  useEffect(() => {
    let frameId: number;
    let lastTime: number | null = null;
    let prevSpinning = stateRef.current.isSpinning;
    let spinStartTime = 0;
    let lastTurbulenceChange = 0;
    let forceX = 0, forceY = 0, torqueStrength = 0;

    const step = (time: number) => {
      if (lastTime === null) lastTime = time;
      const dt = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;

      if (dt > 0) {
        const gravity = 18, floorY = 0.98, restitution = 0.8, friction = 0.995, angularFriction = 0.98;
        const { isSpinning: spinning } = stateRef.current;
        const nowSec = time / 1000;
        const lastShake = lastShakeTimeRef.current;

        if (!spinning && lastShake !== null && nowSec - lastShake > 2) {
          prevSpinning = spinning;
          frameId = requestAnimationFrame(step);
          return;
        }

        if (spinning && !prevSpinning) { spinStartTime = nowSec; lastTurbulenceChange = nowSec; forceX = 0; forceY = -60; torqueStrength = 0; }
        if (!spinning && prevSpinning) spinStartTime = 0;
        const spinElapsed = spinning && spinStartTime > 0 ? nowSec - spinStartTime : 0;

        const current = eggsRef.current.map((e) => ({ ...e }));
        for (const egg of current) {
          egg.vy += gravity * dt;
          if (spinning) {
            if (spinElapsed < 0.5) {
              egg.vy -= 120 * dt;
              egg.vx += (Math.random() - 0.5) * 48 * dt;
              egg.angularVelocity += (Math.random() - 0.5) * 200 * dt;
            } else if (spinElapsed < 3.5) {
              if (nowSec - lastTurbulenceChange > 0.15) {
                forceX = (Math.random() - 0.5) * 80;
                forceY = -40 - Math.random() * 30;
                torqueStrength = (Math.random() - 0.5) * 300;
                lastTurbulenceChange = nowSec;
              }
              egg.vx += forceX * dt;
              egg.vy += forceY * dt;
              egg.angularVelocity += torqueStrength * dt;
            }
          }
          egg.vx *= friction; egg.vy *= friction; egg.angularVelocity *= angularFriction;
          egg.x += egg.vx * dt; egg.y += egg.vy * dt; egg.angle += egg.angularVelocity * dt;
          if (egg.x - egg.radius < 0) { egg.x = egg.radius; egg.vx = -egg.vx * restitution; }
          if (egg.x + egg.radius > 1) { egg.x = 1 - egg.radius; egg.vx = -egg.vx * restitution; }
          if (egg.y + egg.radius > floorY) { egg.y = floorY - egg.radius; egg.vy = -egg.vy * restitution; }
          if (egg.y - egg.radius < 0) { egg.y = egg.radius; egg.vy = -egg.vy * restitution; }
        }

        for (let i = 0; i < current.length; i++) {
          for (let j = i + 1; j < current.length; j++) {
            const a = current[i], b = current[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const distSq = dx * dx + dy * dy;
            const minDist = a.radius + b.radius;
            if (distSq === 0 || distSq >= minDist * minDist) continue;
            const dist = Math.sqrt(distSq), overlap = minDist - dist;
            const nx = dx / dist, ny = dy / dist;
            a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
            const [avx, avy] = [a.vx, a.vy];
            a.vx = b.vx * restitution; a.vy = b.vy * restitution;
            b.vx = avx * restitution; b.vy = avy * restitution;
          }
        }

        eggsRef.current = current;
        setEggs(current);
      }

      prevSpinning = stateRef.current.isSpinning;
      frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className="relative w-full h-full" style={{ touchAction: 'pan-y' }}>
      {/* Background machine image */}
      <div className="absolute inset-0">
        <Image
          src="/images/gacha/mode2/main.png"
          alt="gacha machine"
          fill
          className="object-fill"
          unoptimized
          onLoadingComplete={() => {
            if (!hasNotifiedLoadedRef.current) {
              hasNotifiedLoadedRef.current = true;
              onLoaded?.();
            }
          }}
        />
      </div>

      {/* Box white background (behind eggs) — (27,74), 707×386 on 750×932 canvas */}
      <div
        className="absolute pointer-events-none"
        style={{ left: '3.6%', top: '7.94%', width: '94.27%', height: '41.42%' }}
      >
        <Image src="/images/gacha/mode2/box.svg" alt="" fill className="object-fill" unoptimized />
      </div>

      {/* Egg physics (on top of white box) */}
      <div
        className="absolute overflow-hidden"
        style={{ left: '3.6%', top: '7.94%', width: '94.27%', height: '41.42%' }}
      >
        <div className="absolute inset-0">
          {eggs.map((egg) => (
            <motion.div
              key={egg.id}
              className="absolute"
              style={{
                left: `${(egg.x - egg.radius) * 100}%`,
                top: `${(egg.y - egg.radius) * 100}%`,
                width: `${egg.radius * 2 * 100}%`,
                aspectRatio: '1 / 1',
                rotate: `${egg.angle}deg`,
              }}
            >
              <Image src={egg.src || EGG_IMAGES[0]} alt="capsule" fill className="object-contain brightness-110" unoptimized />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Switch knob — (299,524), 156×156 on 750×932; click also triggers purchase */}
      <motion.div
        className={`absolute ${isSoldOut ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
        style={{ left: '39.87%', top: '56.22%', width: '20.8%', height: '16.74%', zIndex: 10 }}
        animate={{ rotate: switchAngle }}
        transition={{ duration: 1, ease: 'easeInOut' }}
        onClick={() => { if (!isSoldOut && onPurchase) onPurchase(); }}
      >
        <Image src="/images/gacha/mode2/switch.png" alt="switch" fill className="object-contain" unoptimized />
      </motion.div>

      {/* Hole + dropping/waiting egg — (500,580), 157×157 on 750×932 */}
      <div
        className="absolute"
        style={{ left: '66.67%', top: '62.23%', width: '20.93%', height: '16.85%', zIndex: 10 }}
      >
        <Image src="/images/gacha/mode2/hole.svg" alt="hole" fill className="object-fill pointer-events-none" unoptimized />
        <div className="absolute inset-0 overflow-hidden">
          <AnimatePresence>
            {isDropping && (
              <motion.div
                key="dropping-egg"
                initial={{ y: '-140%', opacity: 1 }}
                animate={{ y: '10%', opacity: 1 }}
                transition={{ duration: 0.8, ease: 'easeInOut' }}
                className="absolute inset-0 flex items-start justify-center"
              >
                <div className="relative w-[77%] h-[77%]">
                  <Image src={dropEggSrc} alt="dropping capsule" fill className="object-contain brightness-110" unoptimized />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {isWaiting && (
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={() => onHoleClick?.()}
            >
              <div className="relative w-[77%] h-[77%]">
                <Image src={dropEggSrc} alt="waiting capsule" fill className="object-contain brightness-110" unoptimized />
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Buttons (same % positions as classic) */}
      <ImageButton
        src="/images/gacha/mode2/btn2.png"
        alt="推一下"
        text="推一下"
        className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '5.33%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
        onClick={() => {
          if (isSoldOut) return;
          const audio = manualPushSoundRef.current;
          if (audio) { audio.currentTime = 0; void audio.play().catch(() => {}); }
          onPush?.();
        }}
      />
      <ImageButton
        src="/images/gacha/mode2/btn1.png"
        alt="立即轉蛋"
        text="立即轉蛋"
        className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '31.73%', top: '84.5%', width: '36.53%', height: '11.2%', zIndex: 20 }}
        onClick={() => { if (!isSoldOut && onPurchase) onPurchase(); }}
      />
      <ImageButton
        src="/images/gacha/mode2/btn2.png"
        alt="試試看"
        text="試試看"
        className={`absolute ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{ left: '69.6%', top: '84.5%', width: '25.06%', height: '11.2%', zIndex: 20 }}
        onClick={() => { if (!isSoldOut && onTrial) onTrial(); }}
      />

      {isSoldOut && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
          style={{ bottom: '0%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 15 }}
        >
          <div className="mt-16 inline-flex h-8 items-center px-4 rounded-full bg-black/90 shadow-lg">
            <span className="text-[14px] font-black tracking-widest text-yellow-300">該商品已完抽</span>
          </div>
        </div>
      )}
    </div>
  );
}
