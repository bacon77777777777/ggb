'use client';

import { cn } from '@/lib/utils';
import { setSoundMuted } from '@/lib/soundPrefs';
import { useSoundMuted } from '@/hooks/useSoundMuted';

/**
 * 聲音開關 —— 浮在機台右上角的半透明圓鈕
 *
 * 造型：38px 圓形立體鈕（深色球面漸層＋內緣高光＋外投影），白色線條圖示，
 * 靜音時整顆轉紅。老闆 2026-08-19 指定全類別統一成這個樣式。
 *
 * ⚠ 舊限制仍然成立：機台背景深淺不一（轉蛋各主題差很多），**不可以改成白底或
 * 跟著主題色走**，那會在某些主題上整顆消失。現在的立體版底色是不透明的深藍灰，
 * 深色淺色背景上都看得見，符合這條限制 —— 換樣式時別把它改亮。
 *
 * `flat` 變體保留原本的 `bg-black/30`，目前沒有人用，留著是給日後
 * 「某個主題立體版真的不合」時的退路。
 *
 * 狀態存在 `lib/soundPrefs`，不是元件自己的 state —— 同一頁可能有多個
 * 發聲來源，換頁後也要記得玩家的選擇。
 */
/**
 * `raised` 是立體版（漸層＋內緣高光＋外投影），給抽卡商品頁那種淺色背景用。
 * 預設維持 `flat` —— 上面那段限制還在：機台主題背景深淺差很多，
 * 半透明黑底是唯一每個主題都看得見的做法，不要整組換掉。
 */
/*
 * 用行內樣式而不是 tailwind 的 arbitrary class：多重 box-shadow 寫成
 * `shadow-[a,b,c]` 沒被解析出來（實測 computed 是透明），只剩漸層，
 * 結果上下各出現一條硬邊而不是立體感（老闆回報「上下邊緣怪怪的」）。
 *
 * 漸層刻意做四段而不是 from/via/to 三段 —— 三段的中間轉折太陡，
 * 在圓形上會看成一條橫帶。
 */
export const RAISED_STYLE: React.CSSProperties = {
  /* 光源在上方：用 radial 從頂端打下來，比 linear 更像球面受光 */
  background:
    'radial-gradient(115% 100% at 50% -10%, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0.10) 32%,' +
    ' rgba(0,0,0,0.10) 64%, rgba(0,0,0,0.32) 100%), rgba(52,58,76,0.78)',
  boxShadow:
    '0 6px 14px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.22),' +
    // 高光用負 spread 往內收，才不會在最上緣壓出一條硬白線
    ' inset 0 2px 4px -2px rgba(255,255,255,0.85),' +
    // 底部內陰影同樣往內收，做出「下緣往回捲」的厚度
    ' inset 0 -8px 12px -7px rgba(0,0,0,0.55),' +
    // 極淡的一圈描邊取代 1px 白邊框：邊框在暗底那半圈會變成一道光暈
    ' inset 0 0 0 1px rgba(255,255,255,0.10)',
};

/** 靜音時整顆轉紅（老闆 2026-08-19）—— 只在立體版生效，扁平版維持原本的紅斜槓 */
export const RAISED_STYLE_MUTED: React.CSSProperties = {
  background:
    'radial-gradient(115% 100% at 50% -10%, rgba(255,255,255,0.55) 0%, rgba(238,86,96,0.96) 30%,' +
    ' rgba(206,34,48,1) 66%, rgba(146,18,30,1) 100%)',
  boxShadow:
    '0 6px 14px rgba(150,20,32,0.36), 0 1px 3px rgba(110,14,24,0.26),' +
    ' inset 0 2px 4px -2px rgba(255,255,255,0.95),' +
    ' inset 0 -8px 12px -7px rgba(90,10,20,0.6),' +
    ' inset 0 0 0 1px rgba(255,255,255,0.14)',
};

export function SoundToggle({ className, variant = 'raised' }: {
  className?: string;
  variant?: 'flat' | 'raised';
}) {
  const muted = useSoundMuted();

  return (
    <button
      type="button"
      onClick={() => setSoundMuted(!muted)}
      aria-label={muted ? '開啟音效' : '關閉音效'}
      aria-pressed={muted}
      className={cn(
        'pointer-events-auto w-[38px] h-[38px] rounded-full',
        variant === 'raised' ? '' : 'backdrop-blur-sm',
        'flex items-center justify-center text-white transition-all active:scale-95',
        variant === 'raised' ? 'active:translate-y-[1px]' : 'bg-black/30',
        className,
      )}
      style={variant === 'raised' ? (muted ? RAISED_STYLE_MUTED : RAISED_STYLE) : undefined}
    >
      <svg className="w-5 h-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        {/* 立體版靜音時整顆是紅底，斜槓維持紅色會看不見，改白色 */}
        {muted && (
          <line x1="3" y1="3" x2="21" y2="21"
                stroke={variant === 'raised' ? '#fff' : '#ef4444'} strokeWidth={2.5} />
        )}
      </svg>
    </button>
  );
}

export default SoundToggle;
