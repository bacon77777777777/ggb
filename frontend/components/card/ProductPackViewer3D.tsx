'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';

interface ProductPackViewer3DProps {
  packImage: string;
  showSSRGlare?: boolean;
  interactive?: boolean;
}

const MAX_ANGLE = 180;
const PACK_THICKNESS = 5;

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export function ProductPackViewer3D({
  packImage,
  showSSRGlare = true,
  interactive = true,
}: ProductPackViewer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 0, y: 0 });

  const updateTilt = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    const dx = x - 0.5;
    const dy = y - 0.5;

    const verticalFactor = 0.15;
    const horizontalFactor = 0.5;

    const rotateX = -dy * MAX_ANGLE * 2 * verticalFactor;
    const rotateY = dx * MAX_ANGLE * 2 * horizontalFactor;

    const glareX = clamp(-dx * 40, -30, 30);
    const glareY = clamp(-dy * 40, -30, 30);

    setTilt({ x: rotateX, y: rotateY });
    setGlare({ x: glareX, y: glareY });
  };

  const resetTilt = () => {
    setTilt({ x: 0, y: 0 });
    setGlare({ x: 0, y: 0 });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    updateTilt(event.clientX, event.clientY);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return;
    event.stopPropagation();
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return;
    event.stopPropagation();
    const touch = event.touches[0];
    if (!touch) return;
    updateTilt(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return;
    event.stopPropagation();
    resetTilt();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    event.stopPropagation();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    event.stopPropagation();
    updateTilt(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    event.stopPropagation();
    resetTilt();
  };

  return (
    <div className="w-full max-w-[375px] h-[463px] mx-auto flex items-center justify-center pointer-events-none">
      <div
        ref={containerRef}
        className="relative pointer-events-auto w-fit h-fit"
        style={{ perspective: 1000 }}
        onMouseMove={interactive ? handleMouseMove : undefined}
        onMouseLeave={interactive ? resetTilt : undefined}
        onTouchStart={interactive ? handleTouchStart : undefined}
        onTouchMove={interactive ? handleTouchMove : undefined}
        onTouchEnd={interactive ? handleTouchEnd : undefined}
        onPointerDown={interactive ? handlePointerDown : undefined}
        onPointerMove={interactive ? handlePointerMove : undefined}
        onPointerUp={interactive ? handlePointerUp : undefined}
      >
        <div
          className="relative w-[168px] aspect-[650/1047] touch-none"
          style={{
            transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
            transformStyle: 'preserve-3d',
            transition: 'transform 160ms ease-out',
          }}
        >
          <div
            className="absolute inset-0 rounded-[8px] overflow-hidden"
            style={{
              transform: `translateZ(${PACK_THICKNESS / 2}px)`,
              backfaceVisibility: 'hidden',
            }}
          >
            <Image
              src={packImage}
              alt="Card Pack Front"
              fill
              className="object-cover select-none"
              unoptimized
            />
          </div>

          <div
            className="absolute inset-0 rounded-[8px] overflow-hidden"
            style={{
              transform: `rotateY(180deg) translateZ(${PACK_THICKNESS / 2}px)`,
              backfaceVisibility: 'hidden',
            }}
          >
            <Image
              src="/images/card/back.png"
              alt="Card Pack Back"
              fill
              className="object-cover select-none"
              unoptimized
            />
          </div>

          {/* Side edges — colored faces for 3D pack thickness feel */}
          <div
            style={{
              position: 'absolute',
              top: 0, bottom: 0,
              right: -PACK_THICKNESS / 2,
              width: PACK_THICKNESS,
              transform: 'rotateY(-90deg)',
              background: 'linear-gradient(to bottom, #e8e4dc, #b8b0a8)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0, bottom: 0,
              left: -PACK_THICKNESS / 2,
              width: PACK_THICKNESS,
              transform: 'rotateY(90deg)',
              background: 'linear-gradient(to bottom, #e8e4dc, #b8b0a8)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0, right: 0,
              top: -PACK_THICKNESS / 2,
              height: PACK_THICKNESS,
              transform: 'rotateX(90deg)',
              background: 'linear-gradient(to right, #d0ccc4, #e8e4dc, #d0ccc4)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0, right: 0,
              bottom: -PACK_THICKNESS / 2,
              height: PACK_THICKNESS,
              transform: 'rotateX(-90deg)',
              background: 'linear-gradient(to right, #d0ccc4, #e8e4dc, #d0ccc4)',
            }}
          />

          {showSSRGlare && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                WebkitMaskImage: "url('/images/card/mask.svg')",
                maskImage: "url('/images/card/mask.svg')",
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
              }}
            >
              <div
                className="w-[160%] h-[160%] opacity-50"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.85), rgba(255,255,255,0) 40%)',
                  transform: `translate(${glare.x}px, ${glare.y}px) rotate(20deg)`,
                  transition: 'transform 120ms ease-out',
                }}
              />
            </div>
          )}

          {showSSRGlare && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                WebkitMaskImage: "url('/images/card/mask.svg')",
                maskImage: "url('/images/card/mask.svg')",
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
              }}
            >
              <div className="absolute -top-4 -left-2 w-10 h-10 bg-white/70 rounded-full blur-lg opacity-0 pack-sparkle-1" />
              <div className="absolute top-6 -right-3 w-8 h-8 bg-cyan-200/80 rounded-full blur-lg opacity-0 pack-sparkle-2" />
              <div className="absolute bottom-0 left-4 w-9 h-9 bg-amber-200/80 rounded-full blur-lg opacity-0 pack-sparkle-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
