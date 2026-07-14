'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

interface ProductPackViewer3DProps {
  packImage: string;
  backImage?: string;
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

function sampleEdgeGradient(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  side: 'left' | 'right',
): { top: string; bot: string } {
  const x = side === 'left' ? 0 : W - 3;
  const third = Math.max(1, Math.floor(H / 3));
  const avg = (data: Uint8ClampedArray) => {
    let r = 0, g = 0, b = 0;
    const px = data.length / 4;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    return `rgb(${Math.round(r / px)},${Math.round(g / px)},${Math.round(b / px)})`;
  };
  return {
    top: avg(ctx.getImageData(x, 0, 3, third).data),
    bot: avg(ctx.getImageData(x, H - third, 3, third).data),
  };
}

const FALLBACK = { top: '#e8e4dc', bot: '#b8b0a8' };

export function ProductPackViewer3D({
  packImage,
  backImage = '/images/card/back.png',
  showSSRGlare = true,
  interactive = true,
}: ProductPackViewer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 0, y: 0 });
  const [leftEdge,  setLeftEdge]  = useState(FALLBACK);
  const [rightEdge, setRightEdge] = useState(FALLBACK);

  // 取樣 packImage 左右邊緣色
  useEffect(() => {
    if (!packImage) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        setLeftEdge(sampleEdgeGradient(ctx, W, H, 'left'));
        setRightEdge(sampleEdgeGradient(ctx, W, H, 'right'));
      } catch {
        // CORS taint 或其他錯誤 — 保留預設色
      }
    };
    img.src = packImage;
  }, [packImage]);

  const updateTilt = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    const dx = x - 0.5;
    const dy = y - 0.5;

    const rotateX = -dy * MAX_ANGLE * 2 * 0.15;
    const rotateY =  dx * MAX_ANGLE * 2 * 0.5;

    setTilt({ x: rotateX, y: rotateY });
    setGlare({ x: clamp(-dx * 40, -30, 30), y: clamp(-dy * 40, -30, 30) });
  };

  const resetTilt = () => {
    setTilt({ x: 0, y: 0 });
    setGlare({ x: 0, y: 0 });
  };

  const handleMouseMove  = (e: React.MouseEvent<HTMLDivElement>)   => { if (interactive) updateTilt(e.clientX, e.clientY); };
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>)   => { if (interactive) e.stopPropagation(); };
  const handleTouchMove  = (e: React.TouchEvent<HTMLDivElement>)   => { if (!interactive) return; e.stopPropagation(); const t = e.touches[0]; if (t) updateTilt(t.clientX, t.clientY); };
  const handleTouchEnd   = (e: React.TouchEvent<HTMLDivElement>)   => { if (interactive) { e.stopPropagation(); resetTilt(); } };
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => { if (interactive) e.stopPropagation(); };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => { if (interactive) { e.stopPropagation(); updateTilt(e.clientX, e.clientY); } };
  const handlePointerUp   = (e: React.PointerEvent<HTMLDivElement>) => { if (interactive) { e.stopPropagation(); resetTilt(); } };

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
          {/* Front face */}
          <div
            className="absolute inset-0 rounded-[8px] overflow-hidden"
            style={{ transform: `translateZ(${PACK_THICKNESS / 2}px)`, backfaceVisibility: 'hidden' }}
          >
            <Image src={packImage} alt="Card Pack Front" fill className="object-cover select-none" unoptimized />
          </div>

          {/* Back face */}
          <div
            className="absolute inset-0 rounded-[8px] overflow-hidden"
            style={{ transform: `rotateY(180deg) translateZ(${PACK_THICKNESS / 2}px)`, backfaceVisibility: 'hidden' }}
          >
            <Image src={backImage} alt="Card Pack Back" fill className="object-cover select-none" unoptimized />
          </div>

          {/* Right edge — 取樣自 packImage 右邊緣色 */}
          <div
            style={{
              position: 'absolute',
              top: 0, bottom: 0,
              right: -PACK_THICKNESS / 2,
              width: PACK_THICKNESS,
              transform: 'rotateY(-90deg)',
              background: `linear-gradient(to bottom, ${rightEdge.top}, ${rightEdge.bot})`,
            }}
          />

          {/* Left edge — 取樣自 packImage 左邊緣色 */}
          <div
            style={{
              position: 'absolute',
              top: 0, bottom: 0,
              left: -PACK_THICKNESS / 2,
              width: PACK_THICKNESS,
              transform: 'rotateY(90deg)',
              background: `linear-gradient(to bottom, ${leftEdge.top}, ${leftEdge.bot})`,
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
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.85), rgba(255,255,255,0) 40%)',
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
