/**
 * 主題色
 *
 * ── 為什麼是 RGB 通道值而不是色碼 ──
 * 站上大量使用 `bg-primary/5`、`border-primary/10` 這種透明度寫法。
 * Tailwind 的 <alpha-value> 只能塞進 `rgb(R G B / <alpha-value>)` 這個形式，
 * 所以變數存的必須是 "238 77 45" 而不是 "#EE4D2D" —— 存色碼的話
 * 所有帶 /數字 的類別都會直接失效，而且是靜默失效（顏色變成透明或全黑）。
 *
 * ── 為什麼四個階都存起來，不是只存主色 ──
 * 現在這四個值是當初手調的，彼此不是同一條數學公式推出來的
 *（dark 降的飽和度比 light 升的多）。只存主色的話，預設主題就會跟
 * 現在的畫面對不起來。所以後台挑一個主色、系統推導出另外三階，
 * 但存進資料庫的是四個結果值。
 */

export type ThemePalette = {
  /** 主色 */
  primary: string;
  /** 按下、hover 的深一階 */
  dark: string;
  /** 深底上要讀得出來的淺一階 */
  light: string;
  /** 極淺底色，用在標籤與區塊背景 */
  soft: string;
};

/** 站上現在的顏色。改這裡等於改預設主題 */
export const DEFAULT_PALETTE: ThemePalette = {
  primary: '#EE4D2D',
  dark: '#D9441F',
  light: '#FF7043',
  soft: '#FFF4EF',
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** '#EE4D2D' → [238, 77, 45]。看不懂的輸入回 null，讓呼叫端決定要不要退回預設 */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** [238, 77, 45] → '#ee4d2d' */
export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

/** '#EE4D2D' → '238 77 45'（CSS 變數要的格式） */
export function hexToTriplet(hex: string): string | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgb.join(' ') : null;
}

/*
 * 顏色的推導（主色 → dark / light / soft）刻意不放在這裡，而是在後台
 * backend/lib/theme.ts。存進資料庫的是推導後的四個值，前台只負責讀出來用 ——
 * 兩邊各放一套 HSL 數學遲早會走鐘，而且走鐘時前台顯示的顏色會跟後台預覽的不一樣。
 */

/** 產生要塞進 <style> 的那段 CSS。回 null 代表沿用 globals.css 裡的預設值 */
export function paletteToCss(p: Partial<ThemePalette> | null): string | null {
  if (!p) return null;
  const lines: string[] = [];
  const push = (name: string, hex?: string) => {
    if (!hex) return;
    const t = hexToTriplet(hex);
    if (t) lines.push(`--primary${name}: ${t};`);
  };
  push('', p.primary);
  push('-dark', p.dark);
  push('-light', p.light);
  push('-soft', p.soft);
  return lines.length ? `:root{${lines.join('')}}` : null;
}
