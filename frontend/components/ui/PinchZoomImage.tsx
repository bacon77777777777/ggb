'use client';

import Image from 'next/image';
import { useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

/**
 * 可雙指縮放／移動的圖片（放開就彈回原位）
 *
 * 全站「看大圖」的地方共用這一支：品項詳情彈窗、機台上的「點擊顯示圖片」。
 *
 * 手勢分工（用 pointer events，滑鼠與觸控同一套）：
 *   兩指  → 撐開縮放 ＋ 拖移，放開任一指就彈回 1 倍原位
 *   一指  → 沒放大時是左右滑切換上一項／下一項（呼叫端有給才啟用）；
 *           放大狀態下則是單指拖移，方便看細節
 *
 * 幾個實作上的坑：
 *   ・容器要 `touch-action: none`，否則雙指會被瀏覽器搶去做頁面縮放
 *   ・縮放的原點固定在容器中心，並以「兩指中點的位移」當平移量 ——
 *     這樣手感才跟系統相簿一致
 *   ・彈回用 CSS transition，手勢進行中要關掉，不然每一幀都在補間會頓
 */
interface Props {
  src: string;
  alt: string;
  className?: string;
  /** 有給才啟用單指左右滑切換 */
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** 單指點一下（沒有滑動也沒有縮放時）*/
  onTap?: () => void;
  priority?: boolean;
}

const MAX_SCALE = 5;
const SWIPE_THRESHOLD = 60;

export default function PinchZoomImage({
  src, alt, className, onSwipeLeft, onSwipeRight, onTap, priority,
}: Props) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [animating, setAnimating] = useState(true);

  /** 目前按著的指頭 */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** 手勢起始狀態 */
  const start = useRef({ dist: 0, cx: 0, cy: 0, scale: 1, tx: 0, ty: 0, moved: false });

  const centreOf = () => {
    const pts = [...pointers.current.values()];
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    return { cx, cy };
  };
  const distOf = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const beginGesture = useCallback(() => {
    const { cx, cy } = centreOf();
    start.current = { dist: distOf(), cx, cy, scale, tx, ty, moved: false };
    setAnimating(false);
  }, [scale, tx, ty]);

  const reset = useCallback(() => {
    setAnimating(true);
    setScale(1); setTx(0); setTy(0);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    beginGesture();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const n = pointers.current.size;
    const { cx, cy } = centreOf();
    const dx = cx - start.current.cx;
    const dy = cy - start.current.cy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) start.current.moved = true;

    if (n >= 2) {
      const d = distOf();
      if (start.current.dist > 0) {
        const next = Math.min(MAX_SCALE, Math.max(1, start.current.scale * (d / start.current.dist)));
        setScale(next);
      }
      setTx(start.current.tx + dx);
      setTy(start.current.ty + dy);
      return;
    }

    // 單指：放大狀態下才拖移；沒放大時留給左右滑切換
    if (start.current.scale > 1.01) {
      setTx(start.current.tx + dx);
      setTy(start.current.ty + dy);
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const was = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);

    // 還有指頭按著 → 重設基準，讓剩下那指接手拖移，不要跳一下
    if (pointers.current.size > 0) { beginGesture(); return; }

    const dx = was ? was.x - start.current.cx : 0;
    const zoomed = start.current.scale > 1.01 || scale > 1.01;

    if (!zoomed && !start.current.moved && onTap) { onTap(); }
    else if (!zoomed && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) onSwipeLeft?.();   // 往左滑 → 下一項
      else onSwipeRight?.();
    }
    reset();
  };

  return (
    <div
      className={cn('relative select-none overflow-hidden', className)}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <div
        className="h-full w-full will-change-transform"
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
          transition: animating ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
        }}
      >
        <Image
          src={src}
          alt={alt}
          width={960}
          height={960}
          className="pointer-events-none h-full w-full object-contain"
          draggable={false}
          unoptimized
          priority={priority}
        />
      </div>
    </div>
  );
}
