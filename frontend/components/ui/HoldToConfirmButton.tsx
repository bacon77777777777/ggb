'use client';

import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { hapticLight, hapticNotify } from '@/lib/haptics';

/**
 * 按住集氣確認 —— 商城原型（sell/proto/mall.ts 的 bindHold）的 React 版。
 *
 * 防手滑三件套跟原版一致：
 *   ・按住 0.8 秒，白色光條從左走到右，走完才算數
 *   ・提早放開 → 光條退回去，交給 onAbort 提示（原版是「請按住直到光條走完」）
 *   ・開始時輕震一下、完成時成功震動（lib/haptics，iOS 的 navigator.vibrate 是死的）
 *
 * 樣式由呼叫端的 className 決定（各處按鈕底色不同），這裡只補
 * relative/overflow 與光條本身。
 */
export function HoldToConfirmButton({
  onConfirm,
  onAbort,
  disabled,
  duration = 800,
  className,
  children,
}: {
  onConfirm: () => void;
  /** 按不夠久放開時叫（拿去 toast 提示），完成後的放開不會叫 */
  onAbort?: () => void;
  disabled?: boolean;
  /** 集氣毫秒數 */
  duration?: number;
  className?: string;
  children: ReactNode;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const t0 = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || timer.current) return;
    e.preventDefault();
    const f = fillRef.current;
    if (!f) return;
    t0.current = Date.now();
    f.style.transition = `width ${duration}ms linear`;
    f.style.width = '100%';
    hapticLight();
    timer.current = setTimeout(() => {
      timer.current = null;
      f.style.transition = 'none';
      f.style.width = '0';
      hapticNotify('SUCCESS');
      onConfirm();
    }, duration);
  };

  const stop = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const f = fillRef.current;
    if (f) {
      f.style.transition = 'width .15s';
      f.style.width = '0';
    }
    // 完成的那次放開 Date.now()-t0 已超過 duration，不會誤觸提示
    if (t0.current && Date.now() - t0.current < duration - 20) onAbort?.();
    t0.current = 0;
  };

  return (
    <button
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={cn('relative overflow-hidden select-none', className)}
      style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      <div
        ref={fillRef}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-0 bg-white/30"
      />
      <span className="relative z-[1] inline-flex items-center justify-center gap-1.5">{children}</span>
    </button>
  );
}

export default HoldToConfirmButton;
