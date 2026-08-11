'use client';

import { cn } from '@/lib/utils';
import { setSoundMuted } from '@/lib/soundPrefs';
import { useSoundMuted } from '@/hooks/useSoundMuted';

/**
 * 聲音開關 —— 浮在機台右上角的半透明圓鈕
 *
 * 造型沿用挑戰機台（`app/challenge/[id]/page.tsx`）那顆：38px 圓形、
 * `bg-black/30` + backdrop-blur、白色線條圖示，靜音時疊一條紅色斜槓。
 * 機台背景深淺不一（轉蛋各主題差很多），半透明黑底是唯一在每個主題上
 * 都看得見的做法，所以不要改成白底或跟著主題色走。
 *
 * 狀態存在 `lib/soundPrefs`，不是元件自己的 state —— 同一頁可能有多個
 * 發聲來源，換頁後也要記得玩家的選擇。
 */
export function SoundToggle({ className }: { className?: string }) {
  const muted = useSoundMuted();

  return (
    <button
      type="button"
      onClick={() => setSoundMuted(!muted)}
      aria-label={muted ? '開啟音效' : '關閉音效'}
      aria-pressed={muted}
      className={cn(
        'pointer-events-auto w-[38px] h-[38px] rounded-full bg-black/30 backdrop-blur-sm',
        'flex items-center justify-center text-white transition-transform active:scale-95',
        className,
      )}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        {muted && <line x1="3" y1="3" x2="21" y2="21" stroke="#ef4444" strokeWidth={2.5} />}
      </svg>
    </button>
  );
}

export default SoundToggle;
