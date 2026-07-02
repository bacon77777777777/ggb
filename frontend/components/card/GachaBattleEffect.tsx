import { useEffect, useMemo, useRef, useState, memo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';

type Rarity = 'SSR' | 'SR' | 'R' | 'N';

export interface CardItem {
  id: string;
  rarity: Rarity;
  cardFrontImage: string;
}

interface GachaBattleEffectProps {
  isOpen: boolean;
  pullResults: CardItem[];
  onComplete?: () => void;
  productType?: string;
}

type Phase = 'loading' | 'intro' | 'qte' | 'outcome' | 'cards';

function getCardBackImage(rarity: Rarity) {
  if (rarity === 'SSR') return '/images/card/cardback1.png';
  if (rarity === 'SR') return '/images/card/cardback2.png';
  if (rarity === 'R') return '/images/card/cardback3.png';
  return '/images/card/cardback4.png';
}

export function GachaBattleEffect({ isOpen, pullResults, onComplete, productType }: GachaBattleEffectProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [clickCount, setClickCount] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [videoSources, setVideoSources] = useState<{ intro: string; qte: string; outcome: string } | null>(null);
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const qteVideoRef = useRef<HTMLVideoElement>(null);
  const outcomeVideoRef = useRef<HTMLVideoElement>(null);
  const tapAudioRef = useRef<HTMLAudioElement | null>(null);
  const videoUrlsRef = useRef<string[]>([]);

  const [targets, setTargets] = useState<{ id: number; x: number; y: number }[]>([]);
  const nextTargetIdRef = useRef(0);

  useEffect(() => {
    tapAudioRef.current = new Audio('/audio/sword1.mp3');
    tapAudioRef.current.volume = 0.6;
    tapAudioRef.current.load();
  }, []);

  // Spawning logic for custom type
  useEffect(() => {
    if (productType !== 'custom') return;

    // Reset targets if outside the time window
    if (currentTime < 8.5 || currentTime > 12.0) {
      if (targets.length > 0) {
        setTargets([]);
      }
      return;
    }

    // Initial spawn
    if (currentTime >= 8.5 && targets.length === 0 && clickCount === 0) {
      const initialTarget = {
        id: nextTargetIdRef.current++,
        x: 15 + Math.random() * 70, // 15% to 85%
        y: 20 + Math.random() * 60, // 20% to 80%
      };
      setTargets([initialTarget]);
    }
  }, [currentTime, productType, targets.length, clickCount]);

  // Auto-hide combo text after inactivity
  useEffect(() => {
    if (clickCount > 0 && clickPos) {
      const timer = setTimeout(() => {
        setClickPos(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [clickCount, clickPos]);

  const handleTargetHit = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Play sound
    if (tapAudioRef.current && !isMuted) {
      tapAudioRef.current.currentTime = 0;
      tapAudioRef.current.play().catch(() => {});
    }
    
    // Set click position for combo display
    setClickPos({ x: e.clientX, y: e.clientY });
    setClickCount(prev => prev + 1);

    // Generate next target immediately
    const nextTarget = {
      id: nextTargetIdRef.current++,
      x: 15 + Math.random() * 70,
      y: 20 + Math.random() * 60,
    };
    
    // Replace with new target
    setTargets([nextTarget]);
  };

  const hasSSR = useMemo(
    () => pullResults.some(card => card.rarity === 'SSR'),
    [pullResults]
  );
  
  useEffect(() => {
    // We can use hasSSR here for preloading specific assets if needed in future
    // Currently just logging or could be used for conditional preloading
    if (hasSSR) {
      // Logic for SSR specific preloading if needed
    }
  }, [hasSSR]);

  // Determine intro video source path
  const introVideoPath = useMemo(() => {
    if (productType === 'custom') return '/videos/video1.mp4';
    if (productType === 'blindbox') return '/videos/blindbox_op.mp4';
    return '/videos/card.mp4';
  }, [productType]);

  useEffect(() => {
    if (!isOpen) {
      setPhase('loading');
      setClickCount(0);
      setTimerStarted(false);
      setRevealedIds([]);
      setVideoSources(null);
      setCurrentTime(0);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    setPhase('loading');
    setClickCount(0);
    setTimerStarted(false);
    setRevealedIds([]);
    setCurrentTime(0);

    // Preload audio and video
    const preloadAssets = async () => {
      // Direct paths - no preloading to minimize wait time
      setVideoSources({
        intro: introVideoPath,
        qte: '/videos/video2_button.mp4',
        outcome: '/videos/video3_win.mp4'
      });
      
      setPhase('intro');
    };

    preloadAssets();

    return () => {
      // Cleanup object URLs if any
      if (videoUrlsRef.current.length > 0) {
        videoUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
        videoUrlsRef.current = [];
      }
    };
  }, [isOpen, introVideoPath]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Attempt to autoplay videos when they mount
    const playVideo = async (videoElement: HTMLVideoElement | null) => {
      if (videoElement) {
        try {
          // Ensure muted for autoplay
          videoElement.muted = isMuted;
          videoElement.playsInline = true;
          await videoElement.play();
        } catch (err) {
          console.log("Autoplay prevented:", err);
          // We can show a play button here if needed, but the overlay handles the initial click
        }
      }
    };

    if (phase === 'qte') playVideo(qteVideoRef.current);
    if (phase === 'outcome') playVideo(outcomeVideoRef.current);
  }, [phase, isMuted]);

  // Special effect for handling intro video ref since it's inside conditional rendering
  const introVideoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      node.muted = isMuted;
      node.playsInline = true;
      node.play().catch(err => console.log("Intro autoplay prevented:", err));
    }
  }, [isMuted]);

  const [isLoadingVideo, setIsLoadingVideo] = useState(true);

  if (!isOpen) return null;

  const handleFirstPress = () => {
    if (!timerStarted) {
      setTimerStarted(true);
      timerRef.current = setTimeout(() => {
        setPhase('outcome');
      }, 4000);
    }
  };

  const handleTapQTE = (e: React.MouseEvent) => {
    if (productType !== 'custom') {
      handleFirstPress();
    } else {
      // Play sound for custom type
      if (tapAudioRef.current && !isMuted) {
        tapAudioRef.current.currentTime = 0;
        tapAudioRef.current.play().catch(() => {});
      }
    }
    setClickCount(prev => prev + 1);
    setClickPos({ x: e.clientX, y: e.clientY });
  };

  const handleRevealCard = (id: string) => {
    if (revealedIds.includes(id)) return;
    setRevealedIds(prev => [...prev, id]);
  };

  const handleRevealAll = () => {
    setRevealedIds(pullResults.map(card => card.id));
  };

  const allRevealed =
    pullResults.length > 0 && revealedIds.length >= pullResults.length;

  const intensity = Math.min(1.2, 0.3 + clickCount * 0.03);

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/90">
      {/* Global Background */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/gacha_bg.png"
          alt=""
          fill
          className="object-cover filter brightness-[0.3] blur-[10px]"
          unoptimized
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* Main Container constrained to 560px */}
      <div className="relative w-full max-w-[560px] h-full overflow-hidden bg-black shadow-2xl ring-1 ring-white/10">
        {phase !== 'cards' && (
          <>
            <button
              type="button"
              className="absolute top-4 left-4 z-[1500] w-10 h-10 rounded-full bg-black/60 border border-white/30 flex items-center justify-center text-white backdrop-blur-sm transition-transform active:scale-95"
              onClick={() => setIsMuted((prev) => !prev)}
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
            <button
              type="button"
              className="absolute bottom-4 right-4 z-[1500] px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em] backdrop-blur-sm transition-transform active:scale-95"
              onClick={() => onComplete?.()}
            >
              SKIP
            </button>
          </>
        )}

        {phase === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 w-full h-full flex flex-col items-center justify-center bg-black gap-4"
          >
            <Loader2 className="w-12 h-12 text-white animate-spin" />
            <p className="text-white font-bold tracking-widest text-sm animate-pulse">
              資源下載中...
            </p>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {phase === 'intro' && videoSources && (
            <motion.div
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 1 }}
              className="relative z-10 w-full h-full flex items-center justify-center bg-black"
            >
              {isLoadingVideo && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/50 backdrop-blur-sm">
                  <Loader2 className="w-12 h-12 text-white animate-spin mb-4" />
                  <p className="text-white font-bold tracking-widest">載入動畫中...</p>
                </div>
              )}
              <video
                ref={introVideoRef}
                key="video1"
                autoPlay
                playsInline
                webkit-playsinline="true"
                x5-playsinline="true"
                muted={isMuted}
                className="w-full h-full object-cover"
                onLoadedData={() => setIsLoadingVideo(false)}
                onTimeUpdate={(e) => {
                  if (productType === 'custom') {
                    setCurrentTime(e.currentTarget.currentTime);
                  }
                }}
                onEnded={() => {
                  if (productType === 'custom') {
                    onComplete?.();
                  } else {
                    setPhase('qte');
                  }
                }}
                src={videoSources.intro}
              />

              {/* Interaction Overlay for Autoplay Issues */}
              <div 
                className="absolute inset-0 z-50 flex items-center justify-center bg-transparent"
                onClick={(e) => {
                  // Attempt to play video on user interaction if autoplay failed
                  const video = e.currentTarget.parentElement?.querySelector('video');
                  if (video && video.paused) {
                    video.play().catch(() => {});
                  }
                  
                  // Handle custom type interaction if video is playing
                  if (productType === 'custom' && video && !video.paused) {
                    // Pass click through to potential targets if any
                    // Since targets are rendered below this overlay, we might need a better approach
                    // Or just remove this overlay once video starts playing
                    // For now, let's just ensure video plays
                  }
                }}
                style={{ pointerEvents: currentTime > 0 ? 'none' : 'auto' }}
              >
              </div>

              {/* Custom Target Orbs */}
              <AnimatePresence>
                {productType === 'custom' && targets.map(target => (
                  <TargetOrb
                    key={target.id}
                    x={target.x}
                    y={target.y}
                    onHit={(e) => handleTargetHit(target.id, e)}
                  />
                ))}
              </AnimatePresence>
              
              {/* Floating Combo Text for Custom Type */}
              <AnimatePresence>
                {productType === 'custom' && clickCount > 0 && clickPos && (
                  <ComboCounter count={clickCount} x={clickPos.x} y={clickPos.y} />
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {phase === 'qte' && videoSources && (
            <motion.div
              key="qte"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 1 }}
              className="relative z-10 w-full h-full flex items-center justify-center overflow-hidden bg-black cursor-pointer"
              onClick={handleTapQTE}
            >
              {/* Background Video with Shaking Effect */}
              <motion.div
                className="absolute inset-0 w-[115%] h-[115%] -left-[7.5%] -top-[7.5%]"
                animate={{
                  x: [0, -15, 12, -8, 18, -5, 7, -12, 0],
                  y: [0, 10, -15, 5, -8, 12, -6, 9, 0]
                }}
                transition={{
                  duration: 0.2,
                  repeat: Infinity,
                  repeatType: "loop",
                  ease: "linear"
                }}
              >
                <video
                  ref={qteVideoRef}
                  key="video2_button"
                  autoPlay
                  playsInline
                  webkit-playsinline="true"
                  x5-playsinline="true"
                  loop
                  muted={isMuted}
                  className="w-full h-full object-cover opacity-60"
                  src={videoSources.qte}
                />
              </motion.div>

              <motion.div
                className="absolute inset-0"
                animate={{
                  x: [-4 * intensity, 4 * intensity, -3 * intensity, 3 * intensity, 0],
                  y: [-2 * intensity, 2 * intensity, -1 * intensity, 1 * intensity, 0],
                }}
                transition={{
                  duration: timerStarted ? 0.25 : 0.4,
                  repeat: timerStarted ? Infinity : 0,
                  repeatType: 'mirror',
                }}
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 0%, rgba(248,250,252,0.15), transparent 55%), radial-gradient(circle at 80% 100%, rgba(248,250,252,0.12), transparent 55%)",
                }}
              />

              <div className="relative z-10 flex flex-col items-center gap-6 pb-[200px] pl-[20px]">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut"
                  }}
                  className="relative w-[9.2rem] h-[9.2rem] md:w-[11.5rem] md:h-[11.5rem] focus:outline-none"
                >
                  <Image
                    src="/images/touch.png"
                    alt="Tap"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </motion.button>
              </div>

              {/* Floating Combo Text */}
              <AnimatePresence>
                {clickCount > 0 && clickPos && (
                  <ComboCounter count={clickCount} x={clickPos.x} y={clickPos.y} />
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {phase === 'outcome' && videoSources && (
            <motion.div
              key="outcome"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-10 w-full h-full flex items-center justify-center bg-black"
            >
              <video
                ref={outcomeVideoRef}
                key="video3_win"
                autoPlay
                playsInline
                webkit-playsinline="true"
                x5-playsinline="true"
                muted={isMuted}
                className="w-full h-full object-cover"
                onEnded={() => onComplete?.()}
                src={videoSources.outcome}
              />
            </motion.div>
          )}

          {phase === 'cards' && (
            <motion.div
              key="cards"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-10 w-full h-full flex items-center justify-center p-4"
            >
              <div className="absolute inset-0 -z-10">
                <Image
                  src="/images/gacha_bg.png"
                  alt=""
                  fill
                  className="object-cover filter brightness-[0.9] blur-[4px] scale-105"
                  unoptimized
                />
                <div className="absolute inset-0 bg-black/70" />
              </div>

              <div className="w-full h-full flex flex-col items-center justify-center">
                <div className="flex flex-col items-center gap-1 mb-4">
                  <p className="text-xs font-black text-neutral-300 tracking-[0.3em] uppercase">
                    battle result
                  </p>
                  <p className="text-base font-black text-white">
                    共抽到 {pullResults.length} 張卡牌
                  </p>
                </div>

                <div
                  className={cn(
                    'grid gap-2 w-full',
                    pullResults.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'
                  )}
                >
                  {pullResults.map(card => {
                    const isRevealed = revealedIds.includes(card.id);

                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => handleRevealCard(card.id)}
                        className="relative aspect-[650/930] rounded-xl bg-transparent focus:outline-none"
                      >
                        <div className="w-full h-full rounded-xl perspective-[1200px]">
                          <motion.div
                            className="relative w-full h-full rounded-xl shadow-[0_18px_40px_rgba(0,0,0,0.9)] bg-black"
                            style={{
                              transformStyle: 'preserve-3d',
                            }}
                            initial={{ rotateY: 0 }}
                            animate={{ rotateY: isRevealed ? 180 : 0 }}
                            transition={{ duration: 0.55, ease: 'easeInOut' }}
                          >
                            <div
                              className="absolute inset-0 rounded-xl overflow-hidden"
                              style={{ backfaceVisibility: 'hidden' }}
                            >
                              <Image
                                src={getCardBackImage(card.rarity)}
                                alt="card back"
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>

                            <div
                              className="absolute inset-0 rounded-xl overflow-hidden"
                              style={{
                                backfaceVisibility: 'hidden',
                                transform: 'rotateY(180deg)',
                              }}
                            >
                              <Image
                                src={card.cardFrontImage}
                                alt=""
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                          </motion.div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 w-full flex flex-col gap-2 items-center">
                  {!allRevealed && (
                    <button
                      type="button"
                      onClick={handleRevealAll}
                      className="text-primary font-black underline underline-offset-2 text-xs"
                    >
                      全部翻開
                    </button>
                  )}

                  <Button
                    size="lg"
                    className="w-full md:w-[320px] h-[44px] md:h-[52px] rounded-xl text-base md:text-lg font-black bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-xl shadow-blue-500/20"
                    onClick={onComplete}
                  >
                    完成
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const ComboCounter = memo(({ count, x, y }: { count: number, x: number, y: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, x: "-50%" }}
      animate={{ opacity: 1, scale: 1, x: "-50%" }}
      exit={{ opacity: 0, scale: 1.2, x: "-50%", transition: { duration: 0.5 } }}
      style={{
        position: 'fixed',
        left: x,
        top: y - 80, // Offset upwards by 80px to be visible above finger
        pointerEvents: 'none',
        zIndex: 2000,
        fontFamily: "'Noto Serif HK', serif",
      }}
      className="flex items-center gap-2 pointer-events-none"
    >
      <span className="text-2xl md:text-3xl font-black text-yellow-400 italic tracking-wider drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
        COMBO
      </span>
      <motion.span
        key={count}
        initial={{ scale: 2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          type: "spring",
          stiffness: 800,
          damping: 15,
          mass: 0.4
        }}
        className="text-4xl md:text-5xl font-black text-white italic drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
      >
        {count}
      </motion.span>
    </motion.div>
  );
});

ComboCounter.displayName = 'ComboCounter';

const TargetOrb = memo(({ x, y, onHit }: { x: number, y: number, onHit: (e: React.MouseEvent) => void }) => {
  return (
    <motion.button
      type="button"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ 
        scale: [1, 1.1, 1],
        opacity: 1 
      }}
      exit={{ scale: 1.5, opacity: 0, transition: { duration: 0.2 } }}
      transition={{ 
        scale: {
          repeat: Infinity,
          duration: 1.5,
          ease: "easeInOut"
        },
        opacity: { duration: 0.3 }
      }}
      onClick={(e) => {
        onHit(e);
      }}
      className="absolute w-24 h-24 rounded-full bg-white/30 backdrop-blur-[2px] shadow-[0_0_20px_rgba(255,255,255,0.8)] border border-white/60 flex items-center justify-center z-[2000] focus:outline-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        x: "-50%",
        y: "-50%"
      }}
    >
      <div className="w-[60%] h-[60%] rounded-full bg-white/40 shadow-[0_0_10px_rgba(255,255,255,1)]" />
    </motion.button>
  );
});

TargetOrb.displayName = 'TargetOrb';
