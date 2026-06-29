'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const formatPrizeName = (name: string) => {
  if (!name) return '';
  const chunkSize = 15;
  const maxChars = chunkSize * 2;
  const trimmed = name.trim();
  const limited = trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed;
  const lines: string[] = [];

  for (let i = 0; i < limited.length && lines.length < 2; i += chunkSize) {
    lines.push(limited.slice(i, i + chunkSize));
  }

  if (trimmed.length > maxChars && lines.length === 2) {
    const last = lines[1];
    lines[1] = (last.slice(0, Math.max(last.length - 1, 0)) + '…').slice(0, chunkSize);
  }

  return lines.join('\n');
};

const useTearSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio('/audio/tanweraman-paper-rip-fast-252617.mp3');
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
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  };

  return play;
};

interface IchibanTicketProps {
  grade: string;
  prizeName: string;
  isOpened?: boolean;
  isLastOne?: boolean;
  ticketNumber?: number;
  onOpen?: () => void;
  className?: string;
  imageUrl?: string;
  coverImageUrl?: string;
  showPrizeDetail?: boolean;
}

export const IchibanTicket: React.FC<IchibanTicketProps> = ({
  grade,
  prizeName,
  isOpened: externalIsOpened,
  isLastOne = false,
  ticketNumber,
  onOpen,
  className,
  imageUrl,
  coverImageUrl,
  showPrizeDetail = false,
}) => {
  const [internalIsOpened, setInternalIsOpened] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const playTearSound = useTearSound();
  const isOpened = externalIsOpened !== undefined ? externalIsOpened : internalIsOpened;
  const formattedPrizeName = React.useMemo(() => formatPrizeName(prizeName), [prizeName]);

  const handleOpen = () => {
    if (!isOpened) {
      setInternalIsOpened(true);
      setDragProgress(1);
      playTearSound();
      onOpen?.();
    }
  };

  if (showPrizeDetail) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={cn(
          "relative w-full aspect-[3/4] flex flex-col items-center justify-between p-2 bg-transparent overflow-hidden",
          className
        )}
      >
        <div className="relative w-full flex-1 flex items-center justify-center bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden mb-2">
            {imageUrl ? (
              <div className="relative w-full h-full p-2">
                <Image 
                  src={imageUrl} 
                  alt={prizeName}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
            <div className="w-full h-full flex items-center justify-center bg-neutral-50 text-neutral-300 font-bold">?</div>
          )}
          
          <div className={cn(
            "absolute top-2 left-2 px-2 py-1 rounded-md text-[10px] font-black shadow-sm z-10",
            isLastOne ? "bg-black text-white" : "bg-neutral-900 text-white"
          )}>
            {grade}
          </div>

          {ticketNumber !== undefined && ticketNumber > 0 && (
            <div className="absolute top-2 right-2 text-[10px] font-bold text-neutral-500 bg-white/90 px-1.5 py-0.5 rounded shadow-sm border border-neutral-100">
              No.{ticketNumber}
            </div>
          )}
        </div>
        
        <div className="w-full h-auto min-h-[2.5rem] flex items-start justify-center text-center">
          <div className="text-[0.7rem] sm:text-sm font-black text-white drop-shadow-md leading-tight whitespace-pre-line">
            {formattedPrizeName}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div 
      className={cn(
        "relative w-full max-w-[416px] aspect-[2/1] group select-none perspective-1000",
        // Desktop: scale up by 19% (scale-[1.19])
        // Mobile: default scale
        "lg:scale-[1.19] lg:origin-center",
        !isOpened && "cursor-pointer",
        className
      )}
    >
      {/* Shadow layer for depth */}
      <div className="absolute inset-0 bg-black/10 rounded-[12px] blur-md translate-y-1 group-hover:translate-y-2 transition-transform will-change-transform" />

      {/* Main Ticket Base */}
      <div className="absolute inset-0 rounded-[12px] shadow-xl bg-[#F3F4F6] will-change-transform">
        
        {/* Inner Content Wrapper - Clipped */}
        <div className="absolute inset-0 rounded-[12px] overflow-hidden">
          {/* Background Image */}
          <Image 
            src="/images/bg.svg?v=10" 
            className="object-cover" 
            alt="ticket background"
            draggable={false}
            fill
            unoptimized
          />

          {/* The Result Content */}
          <div className="absolute inset-0 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {!showPrizeDetail ? (
                <motion.div
                  key="grade"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={isOpened ? { opacity: 1, scale: 1 } : {}}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ delay: 0.3, duration: 0.6, type: 'spring' }}
                  className="flex flex-col items-center justify-center w-full z-10 px-8 pl-14"
                >
                  <div className="flex items-baseline gap-0.5 sm:gap-1 text-center justify-center -mb-1">
                    <span className={cn(
                      "text-[40px] sm:text-5xl lg:text-[43px] font-black tracking-tighter leading-none font-amount",
                      isLastOne ? "text-yellow-600 drop-shadow-sm" : "text-[#D3D3D3]"
                    )}>
                      {(() => {
                        if (isLastOne) return "LAST";
                        const val = grade.replace('賞', '');
                        const num = parseInt(val);
                        return isNaN(num) ? val : num.toLocaleString();
                      })()}
                    </span>
                    <span className={cn(
                      "text-lg sm:text-lg lg:text-[16px] font-black",
                      isLastOne ? "text-yellow-700" : "text-[#D3D3D3]"
                    )}>
                      {isLastOne ? "ONE" : "賞"}
                    </span>
                  </div>
                  <div className="text-base sm:text-sm lg:text-[12.5px] font-black text-[#D3D3D3] text-center line-clamp-1 w-full mt-0.5 lg:-mt-[1px] leading-tight px-1">
                    {prizeName}
                  </div>
                  {ticketNumber !== undefined && ticketNumber > 0 && (
                    <div className="text-sm sm:text-xs lg:text-[11px] font-bold text-[#D3D3D3]/80 mt-0.5 lg:-mt-[1px]">
                      No. {ticketNumber.toString().padStart(3, '0')}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="prize"
                  initial={{ opacity: 0, rotateX: -90 }}
                  animate={{ opacity: 1, rotateX: 0 }}
                  exit={{ opacity: 0, rotateX: 90 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-center w-full h-full z-10 p-3 pl-4 gap-3"
                >
                  {/* Image Container */}
                  <div className="h-full aspect-square relative rounded-xl overflow-hidden shrink-0">
                    {imageUrl ? (
                      <Image 
                        src={imageUrl} 
                        alt={prizeName}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-neutral-50 text-neutral-300 font-bold">?</div>
                    )}
                  </div>
                  
                  {/* Text Content */}
                  <div className="flex-1 flex flex-col justify-center min-w-0 h-full py-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        "px-2 py-0.5 rounded text-sm font-black",
                        isLastOne ? "bg-black text-white" : "bg-neutral-900 text-white"
                      )}>
                        {grade}
                      </div>
                      {ticketNumber !== undefined && ticketNumber > 0 && (
                        <div className="text-sm font-bold text-neutral-400">
                          No.{ticketNumber}
                        </div>
                      )}
                    </div>
                    <div className="text-[0.7rem] sm:text-sm font-black text-neutral-900 leading-tight whitespace-pre-line pr-2">
                      {formattedPrizeName}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* The Tearable Cover Layer */}
        <AnimatePresence>
          {!isOpened && (
            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: 300 }}
              dragElastic={0.1}
              onDrag={(_, info) => {
                const distance = Math.max(info.offset.x, 0);
                const progress = Math.min(distance / 120, 1);
                setDragProgress(progress);
              }}
              onDragEnd={(_, info) => {
                const distance = Math.max(info.offset.x, 0);
                if (distance > 8) {
                  handleOpen();
                } else {
                  setDragProgress(0);
                }
              }}
              onClick={handleOpen}
              exit={{ 
                rotateY: -110,
                x: '110%',
                z: 400,
                opacity: 0,
                transition: { 
                  duration: 1, 
                  ease: [0.4, 0, 0.2, 1],
                }
              }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              style={{ 
                originX: 1,
                originY: 0.5,
                perspective: 2000,
                transformStyle: 'preserve-3d',
                zIndex: 50
              }}
              className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing will-change-transform"
            >
              <div className="absolute inset-0 backface-hidden flex items-center justify-center overflow-visible">
                {/* Cover Image Wrapper - Clipped */}
                <div className="absolute inset-0 rounded-[12px] overflow-hidden">
                  <div className="relative w-[105%] h-[105%] -translate-x-2 -translate-y-0.5">
                    <Image 
                      src={coverImageUrl || "/images/up.svg?v=8"}
                      className="object-cover" 
                      alt="cover" 
                      draggable={false}
                      fill
                      unoptimized
                    />
                  </div>
                </div>

                {/* Swipe progress indicator */}
                <div className="absolute bottom-3 left-6 right-6 h-1 rounded-full bg-black/10/0 pointer-events-none overflow-hidden">
                  <div
                    className="h-full bg-white/80"
                    style={{ width: `${dragProgress * 100}%`, transition: 'width 0.15s ease-out' }}
                  />
                </div>

                {/* Finger Swipe Guide - Not Clipped */}
                <motion.div 
                  className="absolute left-[25%] top-[65%] -translate-y-1/2 pointer-events-none"
                  animate={{ 
                    x: [0, 100],
                    opacity: [0, 1, 1, 0] 
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.1, 0.8, 1]
                  }}
                >
                  <div className="relative w-16 h-16 drop-shadow-md">
                    <Image 
                      src="/images/finger.png" 
                      alt="swipe" 
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Jagged Edge Mask - Optional/Simplified */}
        {isOpened && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-y-0 left-[10%] w-6 pointer-events-none z-40 overflow-hidden mt-2.5 mb-2.5"
          >
             {/* Removed the complex mask for now as it might clash with bg.svg, 
                 or user might want it to look like torn paper. 
                 Since we have bg.svg, maybe we don't need the dark overlay mask?
                 I'll comment it out or leave it if it adds a nice shadow effect.
                 I'll remove it to be clean, assuming bg.svg handles the look.
             */}
          </motion.div>
        )}
      </div>
    </div>
  );
};
