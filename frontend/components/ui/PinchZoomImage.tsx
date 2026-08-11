'use client';

import Image from 'next/image';
import { useRef, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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

/**
 * 吃掉緊接在 onTap 之後那一發 click（幽靈點擊）
 *
 * 瀏覽器在 pointerup 之後還會補一發 click。呼叫端常見的寫法是「點圖片收起，
 * 收起後原位掛一塊透明層讓玩家點回來」—— onTap 收起圖片、React 重繪把透明層
 * 掛上，然後那發 click 就打在剛掛上的透明層，等於自己把自己又打開，玩家看到
 * 的是「點了沒反應」。
 *
 * 真機 iOS/Android 的 click 會落在 touchstart 當下的元素，所以不會踩到；
 * **但桌面瀏覽器的裝置模擬模式會**（Safari 的裝置工具、Chrome DevTools 的
 * device toolbar 都重現得出來）。老闆就是在 Safari 裝置工具下回報這個問題。
 *
 * 修在這裡而不是各呼叫端，是因為轉蛋、盒玩、抽卡、品項詳情全都走這支元件。
 */
function swallowNextClick() {
  if (typeof window === 'undefined') return;
  const kill = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); cleanup(); };
  const cleanup = () => {
    window.removeEventListener('click', kill, true);
    window.clearTimeout(timer);
  };
  // 沒等到 click 就自己拆掉，不要留著攔到玩家下一次真正的點擊
  const timer = window.setTimeout(cleanup, 400);
  window.addEventListener('click', kill, true);
}

export default function PinchZoomImage({
  src, alt, className, onSwipeLeft, onSwipeRight, onTap, priority,
}: Props) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [animating, setAnimating] = useState(true);

  /**
   * 放大時把圖搬到 body 底下的全螢幕圖層。
   *
   * 呼叫端的容器幾乎都會裁切 —— 品項詳情的 bottom sheet 是 overflow-y-auto、
   * 機台的商品圖疊在 overflow-hidden 的機台框裡。留在原地放大，超出容器的部分
   * 會被切掉，等於「放大」只放大了看得到的那一塊。
   *
   * 外框留在原地負責接手勢（尺寸不變、hit-test 不受影響），只有會動的那層
   * 搬去 fixed 圖層照著原本的位置畫。
   */
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const zoomed = scale > 1.01;
  useLayoutEffect(() => {
    if (!zoomed) { setRect(null); return; }
    const el = boxRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, [zoomed]);

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

    if (!zoomed && !start.current.moved && onTap) { onTap(); swallowNextClick(); }
    else if (!zoomed && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) onSwipeLeft?.();   // 往左滑 → 下一項
      else onSwipeRight?.();
    }
    reset();
  };

  const img = (
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
  );

  return (
    <div
      ref={boxRef}
      className={cn('relative select-none overflow-hidden', className)}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {/* 沒放大時就地顯示；放大時這裡留空，由下面的全螢幕圖層接手 */}
      {!(zoomed && rect) && (
        <div
          className="h-full w-full will-change-transform"
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            transition: animating ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}
        >
          {img}
        </div>
      )}

      {zoomed && rect && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[4000]">
          {/* 壓一層暗底，放大時圖才不會跟後面的內容糊在一起 */}
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute will-change-transform"
            style={{
              left: rect.left, top: rect.top, width: rect.width, height: rect.height,
              transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            }}
          >
            {img}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
