import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageButton } from '@/components/ui/ImageButton';

interface GachaMachineVisualProps {
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
  disableButtons?: boolean;
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

  const play = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  };

  return play;
};

export function GachaMachineVisual(props: GachaMachineVisualProps) {
  const {
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
    disableButtons = false,
  } = props;
  const createInitialEggs = (): Egg[] => {
    const count = 15;
    const radius = 0.1;

    const total = count;
    const sources: string[] = [];
    const others = [EGG_IMAGES[0], EGG_IMAGES[2]];

    for (let i = 0; i < Math.min(2, total); i += 1) {
      sources.push(EGG_IMAGES[1]);
    }

    for (let i = 0; i < total - sources.length; i += 1) {
      sources.push(others[i % others.length]);
    }

    for (let i = sources.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = sources[i];
      sources[i] = sources[j];
      sources[j] = tmp;
    }

    const eggs: Egg[] = [];

    for (let i = 0; i < count; i += 1) {
      let placed = false;
      let attempts = 0;

      while (!placed && attempts < 50) {
        const x = radius + Math.random() * (1 - radius * 2);
        const y = 0.7 + Math.random() * 0.18;

        const overlapping = eggs.some((egg) => {
          const dx = egg.x - x;
          const dy = egg.y - y;
          const distSq = dx * dx + dy * dy;
          const minDist = egg.radius + radius;
          return distSq < minDist * minDist * 0.9;
        });

        if (!overlapping) {
          eggs.push({
            id: i,
            x,
            y,
            vx: 0,
            vy: 0,
            radius,
            src: sources[i] || EGG_IMAGES[0],
            angle: 0,
            angularVelocity: 0,
          });
          placed = true;
        }

        attempts += 1;
      }

      if (!placed) {
        eggs.push({
          id: i,
          x: radius + Math.random() * (1 - radius * 2),
          y: 0.8,
          vx: 0,
          vy: 0,
          radius,
          src: sources[i] || EGG_IMAGES[0],
          angle: 0,
          angularVelocity: 0,
        });
      }
    }

    return eggs;
  };

  const manualPushSoundRef = useRef<HTMLAudioElement | null>(null);
  const autoPushSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const manual = new Audio('/audio/gachapush.mp3');
    manual.preload = 'auto';
    manualPushSoundRef.current = manual;

    const auto = new Audio('/audio/gacha.mp3');
    auto.preload = 'auto';
    autoPushSoundRef.current = auto;

    return () => {
      if (manualPushSoundRef.current) {
        manualPushSoundRef.current.pause();
        manualPushSoundRef.current.src = '';
        manualPushSoundRef.current.load();
      }
      if (autoPushSoundRef.current) {
        autoPushSoundRef.current.pause();
        autoPushSoundRef.current.src = '';
        autoPushSoundRef.current.load();
      }
    };
  }, []);
  const playDropSound = useDropSound();
  const [eggs, setEggs] = useState<Egg[]>(() => createInitialEggs());
  const eggsRef = useRef<Egg[]>(eggs);
  const [dropEggSrc, setDropEggSrc] = useState<string>(EGG_IMAGES[0]);
  const dropEggAltIndexRef = useRef(0);

  const isSpinning = state === 'spinning';
  const isShaking = state === 'shaking';
  const isDropping = state === 'dropping';
  const isWaiting = state === 'waiting';

  const stateRef = useRef({ isSpinning, isShaking });
  const prevIsShaking = useRef(false);
  const prevIsDropping = useRef(isDropping);
  const lastShakeTimeRef = useRef<number | null>(null);
  const hasNotifiedLoadedRef = useRef(false);

  useEffect(() => {
    eggsRef.current = eggs;
  }, [eggs]);

  useEffect(() => {
    if (isSoldOut) {
      setEggs([]);
    }
  }, [isSoldOut]);

  useEffect(() => {
    stateRef.current = { isSpinning, isShaking };
  }, [isSpinning, isShaking]);

  const applyShakeImpulseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    applyShakeImpulseRef.current = () => {
      if (pushSoundMode === 'auto') {
        const audio = autoPushSoundRef.current;
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
          void audio.play().catch(() => {});
        }
      }
      lastShakeTimeRef.current = performance.now() / 1000;
      const next = eggsRef.current.map((egg) => {
        const angle = Math.random() * Math.PI * 2;
        const strength = 4;
        return {
          ...egg,
          vx: egg.vx + Math.cos(angle) * strength,
          vy: egg.vy - Math.abs(Math.sin(angle)) * strength - 6,
        };
      });
      eggsRef.current = next;
      setEggs(next);
    };
  }, [pushSoundMode]);

  useEffect(() => {
    const timeouts: number[] = [];

    if (isShaking && !prevIsShaking.current && applyShakeImpulseRef.current) {
      const repeats = Math.max(1, Math.floor(shakeRepeats));
      const baseInterval = pushSoundMode === 'manual' ? 0 : 1000;
      const jitter = 0;
      for (let i = 0; i < repeats; i += 1) {
        const offset = (Math.random() - 0.5) * jitter;
        const delay = Math.max(0, i * baseInterval + offset);
        const id = window.setTimeout(() => {
          if (stateRef.current.isShaking) {
            applyShakeImpulseRef.current?.();
          }
        }, delay);
        timeouts.push(id);
      }
    }

    prevIsShaking.current = isShaking;

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [isShaking, shakeRepeats, pushSoundMode]);

  useEffect(() => {
    if (isDropping && !prevIsDropping.current) {
      if (isSoldOut || hasHighTierPending) {
        setDropEggSrc(EGG_IMAGES[1] || EGG_IMAGES[0]);
      } else {
        const pool = [EGG_IMAGES[0], EGG_IMAGES[2]];
        const nextIndex = dropEggAltIndexRef.current % pool.length;
        dropEggAltIndexRef.current += 1;
        setDropEggSrc(pool[nextIndex]);
      }

      playDropSound();
    }
    prevIsDropping.current = isDropping;
  }, [isDropping, isSoldOut, hasHighTierPending, playDropSound]);

  useEffect(() => {
    let frameId: number;
    let lastTime: number | null = null;
    let prevSpinning = stateRef.current.isSpinning;
    let spinStartTime = 0;
    let lastTurbulenceChange = 0;
    let forceX = 0;
    let forceY = 0;
    let torqueStrength = 0;

    const step = (time: number) => {
      if (lastTime === null) {
        lastTime = time;
      }
      const deltaMs = time - lastTime;
      lastTime = time;
      const dt = Math.min(deltaMs / 1000, 0.033);

      if (dt > 0) {
        const gravity = 18;
        const floorY = 0.98;
        const restitution = 0.8;
        const friction = 0.995;
        const angularFriction = 0.98;

        const { isSpinning: spinning } = stateRef.current;
        const nowSec = time / 1000;

        const lastShakeTime = lastShakeTimeRef.current;
        const shouldFreezeAfterShake =
          !spinning && lastShakeTime !== null && nowSec - lastShakeTime > 2;

        if (shouldFreezeAfterShake) {
          prevSpinning = spinning;
          frameId = requestAnimationFrame(step);
          return;
        }

        if (spinning && !prevSpinning) {
          spinStartTime = nowSec;
          lastTurbulenceChange = nowSec;
          forceX = 0;
          forceY = -60;
          torqueStrength = 0;
        }

        if (!spinning && prevSpinning) {
          spinStartTime = 0;
        }

        const spinElapsed = spinning && spinStartTime > 0 ? nowSec - spinStartTime : 0;

        const current = eggsRef.current.map((egg) => ({ ...egg }));

        for (let i = 0; i < current.length; i += 1) {
          const egg = current[i];

          egg.vy += gravity * dt;

          if (spinning) {
            if (spinElapsed < 0.5) {
              const burstStrength = 120;
              egg.vy -= burstStrength * dt;
              egg.vx += (Math.random() - 0.5) * burstStrength * 0.4 * dt;
              egg.angularVelocity += (Math.random() - 0.5) * 200 * dt;
            } else if (spinElapsed < 3.5) {
              const changeInterval = 0.15;
              if (nowSec - lastTurbulenceChange > changeInterval) {
                const baseUp = -40;
                forceX = (Math.random() - 0.5) * 80;
                forceY = baseUp - Math.random() * 30;
                torqueStrength = (Math.random() - 0.5) * 300;
                lastTurbulenceChange = nowSec;
              }

              egg.vx += forceX * dt;
              egg.vy += forceY * dt;
              egg.angularVelocity += torqueStrength * dt;
            } else if (spinElapsed < 4) {
              // 冷卻期：不再加任何外力，只保留重力與阻力
            }
          }

          egg.vx *= friction;
          egg.vy *= friction;
          egg.angularVelocity *= angularFriction;

          egg.x += egg.vx * dt;
          egg.y += egg.vy * dt;
          egg.angle += egg.angularVelocity * dt;

          if (egg.x - egg.radius < 0) {
            egg.x = egg.radius;
            egg.vx = -egg.vx * restitution;
          }
          if (egg.x + egg.radius > 1) {
            egg.x = 1 - egg.radius;
            egg.vx = -egg.vx * restitution;
          }

          if (egg.y + egg.radius > floorY) {
            egg.y = floorY - egg.radius;
            egg.vy = -egg.vy * restitution;
          }
          if (egg.y - egg.radius < 0) {
            egg.y = egg.radius;
            egg.vy = -egg.vy * restitution;
          }
        }

        for (let i = 0; i < current.length; i += 1) {
          for (let j = i + 1; j < current.length; j += 1) {
            const a = current[i];
            const b = current[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distSq = dx * dx + dy * dy;
            const minDist = a.radius + b.radius;
            if (distSq === 0) continue;
            if (distSq < minDist * minDist) {
              const dist = Math.sqrt(distSq);
              const overlap = minDist - dist;
              const nx = dx / dist;
              const ny = dy / dist;

              a.x -= nx * overlap * 0.5;
              a.y -= ny * overlap * 0.5;
              b.x += nx * overlap * 0.5;
              b.y += ny * overlap * 0.5;

              const avx = a.vx;
              const avy = a.vy;
              a.vx = b.vx * restitution;
              a.vy = b.vy * restitution;
              b.vx = avx * restitution;
              b.vy = avy * restitution;
            }
          }
        }

        eggsRef.current = current;
        setEggs(current);
      }

      prevSpinning = stateRef.current.isSpinning;

      frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className="relative w-full h-full" style={{ touchAction: 'pan-y' }}>
      <div className="absolute inset-0">
        <Image
          src="/images/gacha/main.png"
          alt="gacha machine"
          fill
          className="object-fill"
          unoptimized
          onLoadingComplete={() => {
            if (!hasNotifiedLoadedRef.current) {
              hasNotifiedLoadedRef.current = true;
              if (onLoaded) onLoaded();
            }
          }}
        />
      </div>

      <div
        className="absolute overflow-hidden"
        style={{
          left: '8%',
          top: '10.58%',
          width: '84%',
          height: '36%',
        }}
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
        <Image src="/images/gacha/box.svg" alt="gacha box" fill className="object-contain pointer-events-none" unoptimized />
      </div>

      <div
        className="absolute"
        style={{
          left: '41.2%',
          top: '55.87%',
          width: '17.47%',
          height: '12.16%',
        }}
      >
        <Image src="/images/gacha/hole.svg" alt="hole" fill className="object-contain pointer-events-none" unoptimized />
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
              key="waiting-egg"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={() => {
                if (onHoleClick) onHoleClick();
              }}
            >
              <div className="relative w-[77%] h-[77%]">
                <Image src={dropEggSrc} alt="waiting capsule" fill className="object-contain brightness-110" unoptimized />
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <ImageButton
        src="/images/gacha/btn2.png"
        alt="推一下"
        text="推一下"
        className={`absolute ${isSoldOut || disableButtons ? 'grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{
          left: '5.33%',
          top: '84.5%',
          width: '25.06%',
          height: '11.2%',
          zIndex: 20,
        }}
        onClick={() => {
          if (isSoldOut || disableButtons) return;
          const audio = manualPushSoundRef.current;
          if (audio) {
            audio.currentTime = 0;
            void audio.play().catch(() => {});
          }
          if (onPush) onPush();
        }}
      />

      <ImageButton
        src="/images/gacha/btn1.png"
        alt="立即轉蛋"
        text="立即轉蛋"
        className={`absolute ${isSoldOut || disableButtons ? 'grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{
          left: '31.73%',
          top: '84.5%',
          width: '36.53%',
          height: '11.2%',
          zIndex: 20,
        }}
        onClick={() => {
          if (!isSoldOut && !disableButtons && onPurchase) onPurchase();
        }}
      />

      <ImageButton
        src="/images/gacha/btn2.png"
        alt="試試看"
        text="試試看"
        className={`absolute ${isSoldOut || disableButtons ? 'grayscale pointer-events-none' : ''}`}
        textClassName="text-base md:text-lg"
        style={{
          left: '69.6%',
          top: '84.5%',
          width: '25.06%',
          height: '11.2%',
          zIndex: 20,
        }}
        onClick={() => {
          if (!isSoldOut && !disableButtons && onTrial) onTrial();
        }}
      />

      <div className="absolute inset-0 pointer-events-none">
        <Image
          src="/images/gacha/boxmask.png"
          alt="gacha box overlay"
          fill
          className="object-contain object-top"
          unoptimized
        />
      </div>

      {isSoldOut && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
          style={{ bottom: '0%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10 }}
        >
          <div className="mt-16 inline-flex h-8 items-center px-4 rounded-full bg-black/90 shadow-lg">
            <span className="text-[14px] font-black tracking-widest text-yellow-300">
              該商品已完抽
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
