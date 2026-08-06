/**
 * 主題色的推導
 *
 * 後台挑一個主色，這裡推出 dark / light / soft 三階，四個值一起存進
 * platform_settings。前台只負責把存好的值讀出來套用，不做任何推導 ——
 * 兩邊各放一套 HSL 數學遲早會走鐘，走鐘時前台的顏色會跟後台預覽的不一樣。
 *
 * 位移量是從站上原本那四個手調值反推的：
 *   #EE4D2D  hsl(10, 85%, 55%)   主色
 *   #D9441F  hsl(12, 75%, 49%)   飽和度 -10、明度 -6
 *   #FF7043  hsl(14, 100%, 63%)  飽和度 +15、明度 +8
 *   #FFF4EF  hsl(19, 100%, 97%)  只保留色相，明度拉到接近白
 * 所以換成別的主色時，明暗關係跟現在一致，不會出現「深色階比主色還亮」。
 */

export type ThemePalette = {
  primary: string
  dark: string
  light: string
  soft: string
}

/** 站上原本的顏色。後台按「還原預設」就是回到這一組 */
export const DEFAULT_PALETTE: ThemePalette = {
  primary: '#EE4D2D',
  dark: '#D9441F',
  light: '#FF7043',
  soft: '#FFF4EF',
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l * 100]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === R) h = 60 * (((G - B) / d) % 6)
  else if (max === G) h = 60 * ((B - R) / d + 2)
  else h = 60 * ((R - G) / d + 4)
  return [(h + 360) % 360, s * 100, l * 100]
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const S = clamp(s, 0, 100) / 100, L = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = L - c / 2
  const seg = Math.floor((((h % 360) + 360) % 360) / 60)
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** 從主色推出完整四階。看不懂的輸入回預設，不讓壞值寫進資料庫 */
export function derivePalette(baseHex: string): ThemePalette {
  const rgb = hexToRgb(baseHex)
  if (!rgb) return DEFAULT_PALETTE
  const [h, s, l] = rgbToHsl(rgb)
  return {
    primary: rgbToHex(rgb),
    dark: rgbToHex(hslToRgb([h + 2, s - 10, l - 6])),
    light: rgbToHex(hslToRgb([h + 4, s + 15, l + 8])),
    soft: rgbToHex(hslToRgb([h + 9, 100, 97])),
  }
}

/**
 * 白字壓在這個顏色上讀不讀得出來。
 *
 * 主色最常見的用途就是「白字按鈕」。挑到太淺的顏色（例如亮黃）時，
 * 按鈕上的字會幾乎看不見，而後台如果不提醒，這件事要等玩家反映才會發現。
 * 用 WCAG 的相對亮度算對比度，低於 3 就示警。
 */
export function contrastWithWhite(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 21
  const lin = rgb.map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  return 1.05 / (lum + 0.05)
}
