'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';

interface BoosterPackProps {
  packImage: string;
  cardBackImages: string[];
  onComplete?: () => void;
}

type BoosterPhase = 'idle' | 'charging' | 'tearing' | 'reveal' | 'done';

export default function BoosterPackOpenEffect({
  packImage,
  cardBackImages,
  onComplete,
}: BoosterPackProps) {
  const [phase, setPhase] = useState<BoosterPhase>('idle');
  const cardCount = cardBackImages.length;

  useEffect(() => {
    if (phase !== 'reveal') return;
    const timer = setTimeout(() => {
      setPhase('done');
      onComplete?.();
    }, 3000);
    return () => clearTimeout(timer);
  }, [phase, onComplete]);

  const handleTap = () => {
    if (phase !== 'idle') return;
    setPhase('charging');
    setTimeout(() => {
      setPhase('tearing');
      setTimeout(() => {
        setPhase('reveal');
      }, 260);
    }, 950);
  };

  const showFlash = phase === 'tearing' || phase === 'reveal';

  return (
    <div className="relative w-full max-w-[420px] mx-auto h-[330px] flex items-center justify-center">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-40 h-40 rounded-full bg-gradient-to-tr from-amber-300 via-orange-500 to-pink-500 blur-3xl opacity-30" />
      </div>

      <AnimatePresence>
        {(phase === 'idle' || phase === 'charging' || phase === 'tearing') && (
          <motion.button
            type="button"
            onClick={handleTap}
            className="relative w-60 h-[21rem] focus:outline-none"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{
              scale: 1,
              opacity: 1,
              y: 0,
            }}
          >
            <motion.div
              className="absolute inset-0"
              animate={
                phase === 'idle'
                  ? {
                      y: [0, -8, 0],
                    }
                  : {
                      y: 0,
                    }
              }
              transition={
                phase === 'idle'
                  ? {
                      duration: 2.2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }
                  : { duration: 0.2 }
              }
            >
              {phase !== 'tearing' && (
                <motion.div
                  className="absolute inset-0 overflow-hidden"
                  animate={
                    phase === 'charging'
                      ? {
                          rotate: [-3, 3, -2, 2, -1, 1, 0],
                        }
                      : { rotate: 0 }
                  }
                  transition={
                    phase === 'charging'
                      ? {
                          duration: 0.8,
                          ease: 'easeInOut',
                        }
                      : { duration: 0.2 }
                  }
                >
                  <Image
                    src={packImage}
                    alt=""
                    fill
                    className="object-contain"
                    priority
                  />
                </motion.div>
              )}
            </motion.div>

            {phase === 'tearing' && (
              <>
                <motion.div
                  className="absolute inset-0 overflow-hidden"
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 0, y: -120 }}
                  transition={{ duration: 0.26, ease: 'easeIn' }}
                  style={{
                    clipPath:
                      'polygon(0% 0%, 100% 0%, 100% 15%, 80% 17%, 60% 13%, 40% 17%, 20% 13%, 0% 15%)',
                  }}
                >
                  <Image src={packImage} alt="" fill className="object-contain" />
                </motion.div>

                <motion.div
                  className="absolute inset-0 overflow-hidden"
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 0, y: 120 }}
                  transition={{ duration: 0.26, ease: 'easeOut' }}
                  style={{
                    clipPath:
                      'polygon(0% 17%, 20% 15%, 40% 19%, 60% 15%, 80% 19%, 100% 15%, 100% 100%, 0% 100%)',
                  }}
                >
                  <Image src={packImage} alt="" fill className="object-contain" />
                </motion.div>
              </>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(phase === 'reveal' || phase === 'done') && (
          <div className="relative w-48 h-60 flex items-center justify-center">
            {cardCount > 1 ? (
              <>
                {Array.from({ length: cardCount }).map((_, index, arr) => {
                  const center = (arr.length - 1) / 2;
                  const offset = index - center;
                  const rotate = offset * 12;
                  const translateX = offset * 18;
                  const translateY = Math.abs(offset) * 4;
                  const delay = 0.08 * index;

                  return (
                    <motion.div
                      key={index}
                      className="absolute w-32 aspect-[650/930]"
                      initial={{ opacity: 0, x: 0, y: 20, scale: 0.7, rotate: 0 }}
                      animate={{
                        opacity: 1,
                        x: translateX,
                        y: translateY,
                        scale: index === arr.length - 1 ? 1 : 0.92,
                        rotate,
                      }}
                      transition={{ duration: 0.45, ease: 'easeOut', delay }}
                    >
                      <div className="relative w-full h-full">
                        <Image
                          src={
                            cardBackImages[index] ||
                            cardBackImages[cardBackImages.length - 1] ||
                            '/images/card/cardback4.png'
                          }
                          alt=""
                          fill
                          className="object-cover"
                          priority={index === arr.length - 1}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </>
            ) : (
              <motion.div
                key="card"
                initial={{ opacity: 0, scale: 0.5, y: 40 }}
                animate={{ opacity: 1, scale: [0.5, 1.08, 1], y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="relative w-40 aspect-[650/930]"
              >
                <div className="absolute -inset-0.5 bg-neutral-200/10 opacity-80" />
                <div className="absolute inset-1 bg-black overflow-hidden">
                  <Image
                    src={cardBackImages[0] || '/images/card/cardback4.png'}
                    alt=""
                    fill
                    className="object-cover"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-white/10 mix-blend-screen" />
                </div>
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFlash && (
          <motion.div
            key="flash"
            className="fixed inset-0 z-[1300] bg-white pointer-events-none"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
