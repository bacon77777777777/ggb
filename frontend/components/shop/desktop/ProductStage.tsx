'use client';

/**
 * 電腦版／平板商品頁的「舞台」—— 樣式**照 packs.com 量的**（老闆 2026-09-04：「介面一模一樣，去抓他的樣式」）
 *
 * 量測來源：packs.com 商品頁（The Hobbit）在 1920×1080 的 computed style，
 * 數值直接抄，不要「差不多」：
 *
 * | 東西 | packs 的值 |
 * |---|---|
 * | 舞台底 | `radial-gradient(114% 67.23% at 50% 70.24%, #6341c3, #4b2aa5 38%, #250576)`，圓角 12、內縮 2px 一圈 `inset 0 0 0 2px rgba(0,0,0,.3)` |
 * | 舞台大小 | 972 × 920：寬吃左欄、高**貼著視窗**（不是正方形），所以是 `aspect-square` 再用 `max-h` 壓 |
 * | 背景花紋 | 同心環分段的 SVG，`mix-blend-mode: screen`、opacity .125、放大 1.3；另有一層閃爍星點（canvas） |
 * | 角落鈕 | 40px 圓、`rgba(255,255,255,.15)` 毛玻璃 blur 10、上緣 1px 亮邊／下緣 2px 暗邊（emboss）、svg 20px |
 * | 小標／標題 | 「CARDS FROM」12px 灰；標題 28px／950（我們最粗只有 900）、行高 1.1 |
 * | 膠囊 | 36 高、左右 18、圓角 36、14px/700、`rgba(243,244,246,.1)` ＋由上到下 0→.15 的白漸層、內描邊 1px、下方 2px 實影 |
 * | 數量 | 48 高膠囊 `#5a3ab4`，中間值 50×40 圓角 8 `#442792`，加減各 45×40，16px/700 |
 * | 主鈕 | 44 高、圓角 8、左右 15、14px/700、`#52fa7f` 綠底深字（hover `#6afb90`）、emboss 邊 |
 * | 次鈕 | 同尺寸毛玻璃 `rgba(255,255,255,.15)`（hover .2） |
 * | 底部列 | padding 20，數量列在上、按鈕列在下、間距 10 |
 *
 * 機台元件是 750 畫布（寬 375 × 高 466 的直式盒子）配 transform: scale 縮放，
 * 這裡量框的實際寬高，扣掉上下留給標題區與操作列的高度，算出剛好塞得下的 scale。
 *
 * ⚠️ 中獎彈窗、購買彈窗要當 `overlays` 傳進來，這裡 portal 到 body ——
 * 框外層是 sticky（自成堆疊層），彈窗直接掛在裡面會被右欄的卡片蓋過去。
 */

import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 舞台邊長不到 600px（1024 寬的視窗）時走緊湊尺寸，操作列才塞得下三顆 */
const StageContext = createContext<{ compact: boolean }>({ compact: false });
export const useStageCompact = () => useContext(StageContext).compact;

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/* ── packs.com 的色票（--base-*／--accent-*）── */
export const STAGE_COLORS = {
  page: '#14171e',
  card: '#181b24',
  text: '#f3f4f6',
  textMuted: '#b6bcc9',
  textDim: '#8e95a5',
  textFaint: '#757f91',
  accent: '#52fa7f',
  accentHover: '#6afb90',
  accentText: '#14171e',
} as const;

export const STAGE_BACKGROUND =
  'radial-gradient(114% 67.23% at 50% 70.24%, #6341c3 0%, #4b2aa5 38.17%, #250576 100%)';

/**
 * 毛玻璃（packs 的 `.btn--glass.btn--emboss`）。
 * 底色用 class 而不是 inline style，hover 才蓋得過去。
 */
export const stageGlassClass = cn(
  'bg-[rgba(255,255,255,0.15)] text-white backdrop-blur-[10px]',
  'border-t border-t-[rgba(243,244,246,0.3)] border-b-2 border-b-[rgba(16,19,24,0.3)]',
  'shadow-[inset_0_1px_2.6px_0_rgba(255,255,255,0.1)]',
  'transition-[background-color,transform] duration-[275ms] ease-out',
  'hover:bg-[rgba(255,255,255,0.2)] disabled:opacity-60 disabled:hover:bg-[rgba(255,255,255,0.15)]',
);

/** 40px 圓形玻璃鈕（返回／規則／收藏／分享／音效）—— 給 <button> 與 <Link> 共用 */
export const stageIconButtonClass = cn(
  'pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
  stageGlassClass,
  'active:scale-95 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:stroke-[2.25]',
);

export function StageIconButton({
  label, className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn(stageIconButtonClass, className)} {...rest}>
      {children}
    </button>
  );
}

/** 膠囊（packs 的 `.pill--outline-frosted.pill--sm`）：三段 box-shadow 寫 inline，tailwind 的 arbitrary 多重陰影不可靠 */
const PILL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(to bottom, rgba(243,244,246,0), rgba(243,244,246,0.15)), rgba(243,244,246,0.1)',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15), inset 0 -10px 20px -10px rgba(255,255,255,0.15), 0 2px 0 0 rgba(0,0,0,0.15)',
};

export function StagePill({ className, style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const compact = useStageCompact();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-full font-bold leading-none text-[#f3f4f6] backdrop-blur-[12px]',
        compact ? 'h-8 px-3.5 text-[13px]' : 'h-9 px-[18px] text-[14px]',
        className,
      )}
      style={{ ...PILL_STYLE, ...style }}
    >
      {children}
    </span>
  );
}

/** 底部操作列的按鈕：accent 綠色主鈕（立即轉蛋）、glass 毛玻璃（推一下／試試看） */
export function StageButton({
  variant = 'glass', className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'accent' | 'glass' }) {
  const compact = useStageCompact();
  return (
    <button
      type="button"
      className={cn(
        'pointer-events-auto inline-flex shrink-0 items-center justify-center gap-[5px] whitespace-nowrap rounded-lg font-bold leading-none',
        compact ? 'h-10 px-3 text-[13px]' : 'h-11 px-[15px] text-[14px]',
        'active:scale-[0.98] disabled:cursor-default',
        variant === 'accent'
          ? cn(
              'bg-[#52fa7f] text-[#14171e] transition-[background-color,transform] duration-[275ms] ease-out hover:bg-[#6afb90]',
              'border-t border-t-[rgba(243,244,246,0.3)] border-b-2 border-b-[rgba(16,19,24,0.3)]',
              'disabled:opacity-60 disabled:hover:bg-[#52fa7f]',
            )
          : stageGlassClass,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 數量加減（packs 的 `.stepper--purple`） */
export function StageStepper({
  value, min = 1, max, onChange, disabled,
}: { value: number; min?: number; max: number; onChange: (v: number) => void; disabled?: boolean }) {
  const compact = useStageCompact();
  const btn = cn(
    'flex items-center justify-center text-[#f3f4f6] transition-opacity disabled:opacity-40',
    compact ? 'h-8 w-9' : 'h-10 w-[45px]',
  );
  return (
    <div
      className={cn(
        'pointer-events-auto inline-flex shrink-0 items-center gap-[2px] rounded-full bg-[#5a3ab4] font-bold tabular-nums text-[#f3f4f6]',
        compact ? 'h-10 text-[14px]' : 'h-12 text-[16px]',
      )}
      style={{ boxShadow: 'inset 0 0 0 3px #5a3ab4' }}
    >
      <button type="button" aria-label="減少數量" className={btn}
        disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus className="h-[13px] w-[13px] stroke-[3]" />
      </button>
      <div className={cn('flex items-center justify-center rounded-lg bg-[#442792]', compact ? 'h-8 w-10' : 'h-10 w-[50px]')}>{value}</div>
      <button type="button" aria-label="增加數量" className={btn}
        disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus className="h-[13px] w-[13px] stroke-[3]" />
      </button>
    </div>
  );
}

/* ── 背景花紋：同心環分段（packs 的 `.container-spinner-background`，一張 849² 的 SVG）── */
const RAYS_SIZE = 849;
function raysPath(rings: number, segs: number): string {
  const c = RAYS_SIZE / 2;
  const r0 = c * 0.08;
  const f = (n: number) => n.toFixed(1);
  let d = '';
  for (let i = 0; i < rings; i++) {
    const a = r0 + (c - r0) * (i / rings);
    const b = r0 + (c - r0) * ((i + 1) / rings);
    for (let j = 0; j < segs; j++) {
      if ((i + j) % 2) continue;
      const t0 = (j / segs) * Math.PI * 2;
      const t1 = ((j + 1) / segs) * Math.PI * 2;
      d += `M${f(c + a * Math.cos(t0))},${f(c + a * Math.sin(t0))}`
        + `A${f(a)},${f(a)} 0 0 1 ${f(c + a * Math.cos(t1))},${f(c + a * Math.sin(t1))}`
        + `L${f(c + b * Math.cos(t1))},${f(c + b * Math.sin(t1))}`
        + `A${f(b)},${f(b)} 0 0 0 ${f(c + b * Math.cos(t0))},${f(c + b * Math.sin(t0))}Z`;
    }
  }
  return d;
}
const RAYS_D = raysPath(12, 24);

function StageRays() {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${RAYS_SIZE} ${RAYS_SIZE}`}
      className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[114%] w-[114%] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.09] mix-blend-screen"
      style={{ maskImage: 'radial-gradient(circle, #000 25%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle, #000 25%, transparent 70%)' }}
    >
      <path d={RAYS_D} fill="#fff" />
    </svg>
  );
}

/* ── 閃爍星點（packs 用 sparticles canvas；這裡 18 顆四角星走 CSS 動畫，位置固定不隨機）── */
function lcg(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}
const SPARKLES = (() => {
  const r = lcg(7);
  return Array.from({ length: 18 }, (_, i) => ({
    x: 5 + r() * 90, y: 8 + r() * 84, s: 5 + r() * 9,
    dur: 2.6 + r() * 3, delay: r() * 4,
    c: i % 5 === 0 ? '#2a0f6b' : i % 3 === 0 ? '#cdbfff' : '#ffffff',
  }));
})();
const STAR_D = 'M12 0C12.6 7.2 16.8 11.4 24 12C16.8 12.6 12.6 16.8 12 24C11.4 16.8 7.2 12.6 0 12C7.2 11.4 11.4 7.2 12 0Z';

function StageSparkles() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
      {SPARKLES.map((p, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="stage-sparkle absolute"
          style={{
            left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, color: p.c,
            '--dur': `${p.dur.toFixed(2)}s`, '--delay': `${p.delay.toFixed(2)}s`,
          } as React.CSSProperties}
        >
          <path d={STAR_D} fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}

export interface ProductStageProps {
  /** 標題上方的小標（packs 的「CARDS FROM」）：分類名 */
  eyebrow?: React.ReactNode;
  /** 沒給標題（cardx 版：標題在右側面板）就不畫標題區，機台可以更大 */
  title?: React.ReactNode;
  /** 標題底下的膠囊列（價格／剩餘／幾人在看） */
  pills?: React.ReactNode;
  /** 底部：數量列（在按鈕列上方） */
  quantity?: React.ReactNode;
  /** 底部：按鈕列 */
  controls: React.ReactNode;
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  bottomLeft?: React.ReactNode;
  bottomRight?: React.ReactNode;
  /** 機台原生尺寸（未縮放的畫布盒子） */
  machineWidth: number;
  machineHeight: number;
  /** 上下各留給標題區／操作列的高度（px）。不給就照舞台大小自動取 */
  topInset?: number;
  bottomInset?: number;
  /** 拿算好的 scale 畫機台 */
  renderMachine: (scale: number) => React.ReactNode;
  /** 彈窗（中獎／購買），會 portal 到 body */
  overlays?: React.ReactNode;
  /** 舞台底（預設 packs 的紫色） */
  background?: string;
  className?: string;
}

export function ProductStage({
  eyebrow, title, pills, quantity, controls,
  topLeft, topRight, bottomLeft, bottomRight,
  machineWidth, machineHeight, topInset: topInsetProp, bottomInset: bottomInsetProp,
  renderMachine, overlays, background = STAGE_BACKGROUND, className,
}: ProductStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const side = Math.min(box.w, box.h);
  const compact = side > 0 && side < 600;
  const hasHeader = !!(eyebrow || title || pills);
  // 標題區：上留白 25 ＋ 小標 12 ＋ 標題 35 ＋ 12 ＋ 膠囊 36 ＋ 喘息；沒標題區就只留角落鈕那一列
  // 操作列：20 ＋（數量列 48 ＋ 10）＋ 44 ＋ 20
  const topInset = topInsetProp ?? (hasHeader ? (compact ? 124 : 144) : (topLeft || topRight ? (compact ? 64 : 76) : 24));
  const bottomInset = bottomInsetProp ?? (quantity ? (compact ? 128 : 150) : (compact ? 80 : 92));
  const areaH = Math.max(0, box.h - topInset - bottomInset);
  const areaW = Math.max(0, box.w - 40);
  const scale = box.w > 0 && box.h > 0 ? Math.min(areaH / machineHeight, areaW / machineWidth) : 0;
  const mw = Math.round(machineWidth * scale);
  const mh = Math.round(machineHeight * scale);

  return (
    <StageContext.Provider value={{ compact }}>
      <div
        ref={ref}
        data-testid="product-stage"
        className={cn(
          // 寬吃滿欄、高最多到視窗（packs：1080 高的視窗裡舞台 920 高）
          // 正方形、吃滿欄寬（cardx 的主圖區就是欄寬正方形）
          'relative aspect-square w-full select-none overflow-hidden rounded-xl text-[#f3f4f6]',
          className,
        )}
        style={{ background }}
      >
        <StageRays />
        <StageSparkles />

        {/* 機台：置中、fit 在標題區與操作列之間 */}
        <div
          className="absolute inset-0 z-[2] flex items-center justify-center"
          style={{ paddingTop: topInset, paddingBottom: bottomInset }}
        >
          {/* 機台圖四角是深色底（圖檔本身），圓角＋投影讓它像一片立在舞台上的面板，不是一塊貼圖 */}
          {scale > 0 && (
            <div className="relative overflow-hidden rounded-xl" style={{ width: mw, height: mh, boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)' }}>
              {renderMachine(scale)}
            </div>
          )}
        </div>

        {/* 內縮一圈的暗邊（packs 的 `.container-spinner:before`） */}
        <div className="pointer-events-none absolute inset-[2px] z-[5] rounded-[10px]" style={{ boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.3)' }} />

        {/* 標題區：小標／標題／膠囊，置中。左右留 75px 給角落鈕（packs 的 details 寬 822／972） */}
        {hasHeader && <div className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center text-center',
          compact ? 'px-[60px] pt-4' : 'px-[75px] pt-[25px]',
        )}>
          {eyebrow && (
            <div className={cn('font-bold uppercase leading-none tracking-[0.12em] text-[#b6bcc9]', compact ? 'text-[11px]' : 'text-[12px]')}>
              {eyebrow}
            </div>
          )}
          {/* text-inherit：全域樣式給 h1 的是深色字 */}
          <h1 className={cn(
            'max-w-full truncate px-1 pb-1 font-black leading-[1.1] tracking-tight text-inherit',
            compact ? 'pt-1 text-[22px]' : 'pt-1.5 text-[28px]',
          )}>
            {title}
          </h1>
          {pills && (
            <div className={cn('pointer-events-auto flex flex-wrap items-center justify-center', compact ? 'mt-2 gap-2' : 'mt-3 gap-3')}>
              {pills}
            </div>
          )}
        </div>}

        {/* 四個角落的功能鈕 */}
        <div className={cn('pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between', compact ? 'p-4' : 'p-5')}>
          <div className="flex items-center gap-2">{topLeft}</div>
          <div className="flex items-center gap-2">{topRight}</div>
        </div>

        {/* 底部：左下音效｜數量列＋按鈕列置中｜右下。左右各固定 40px，中間才是真的置中 */}
        <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between', compact ? 'gap-2 p-4' : 'gap-3 p-5')}>
          <div className="flex min-w-10 shrink-0 items-center gap-2">{bottomLeft}</div>
          <div className={cn('flex min-w-0 flex-1 flex-col items-center', compact ? 'gap-2' : 'gap-2.5')}>
            {quantity}
            <div className="pointer-events-auto max-w-full">{controls}</div>
          </div>
          <div className="flex min-w-10 shrink-0 items-center justify-end gap-2">{bottomRight}</div>
        </div>

        {/* 彈窗掛 body（理由見檔頭） */}
        {mounted && overlays && createPortal(overlays, document.body)}
      </div>
    </StageContext.Provider>
  );
}
