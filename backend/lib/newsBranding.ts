/**
 * 文章封面／內文圖的浮水印遮蓋
 *
 * 由 news-agent（新文章）與 scripts/backfill_news_watermark.ts（既有文章回填）
 * 共用，確保兩邊蓋出來的樣式完全一致 —— 先前回填腳本自己寫過一份，
 * 會產生跟正式流程不同的視覺結果。
 *
 * 作法：不裁切，保留原圖。
 *
 * 角落由 dengekiWm 的四角模板比對決定，但那個比對實測只有 82% 準
 *（22 張電ホビ 實圖，見 dengekiWm.ts 的註解）。挑錯角的後果最糟：
 * GGB logo 蓋在空白處，站方的浮水印照樣露在另一角。
 *
 * 所以分兩層處理 ——
 *   **分數前兩名的角落都先模糊掉**：實測 22 張裡，真正的浮水印
 *     100% 落在前兩名之內（兩張挑錯的，正確答案都排第 2）。
 *     模糊過的浮水印已經認不出來，漏網的風險就沒了。
 *   **只有第一名壓 GGB logo**：兩顆 logo 太醜，而且模糊本身就夠了。
 *     第一名那格的模糊會被白墊完全蓋住，畫面上只看得到一處模糊。
 *
 * 全程本地運算（sharp），不呼叫付費服務。
 */
import sharp from 'sharp'
import type { WmCorner } from './dengekiWm'

// GGB logo（蓋浮水印用），模組層快取
let _logoBuf: Buffer | null = null
async function getLogoBuffer(): Promise<Buffer | null> {
  if (_logoBuf) return _logoBuf
  try {
    const url = `${(process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://www.ggb.com.tw').replace(/\/$/, '')}/images/logo.png`
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    _logoBuf = Buffer.from(await res.arrayBuffer())
    return _logoBuf
  } catch { return null }
}



// 白墊貼齊指定角落（朝圖內側的那個角圓角）
function wmPlatePath(w: number, h: number, corner: WmCorner): string {
  const r = Math.round(h / 4)
  switch (corner) {
    case 'top-right':    return `M0 0 H${w} V${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V0 Z`
    case 'top-left':     return `M0 0 H${w} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H0 V0 Z`
    case 'bottom-right': return `M${r} 0 H${w} V${h} H0 V${r} A${r} ${r} 0 0 1 ${r} 0 Z`
    case 'bottom-left':  return `M0 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h} H0 Z`
  }
}

/**
 * 把某個角落糊掉。
 *
 * 裁下那一塊、重壓模糊、再用同一個圓角形狀貼回去 —— 圓角是為了讓它看起來
 * 像刻意的設計，而不是一塊壞掉的方形。模糊半徑跟區塊大小成比例，
 * 小圖才不會糊過頭、大圖才不會糊不掉。
 */
async function blurCorner(
  base: sharp.Sharp, W: number, H: number, corner: WmCorner, w: number, h: number,
): Promise<{ input: Buffer; top: number; left: number } | null> {
  try {
    const left = corner.endsWith('left') ? 0 : W - w
    const top = corner.startsWith('top') ? 0 : H - h
    const patch = await base.clone()
      .extract({ left, top, width: w, height: h })
      .blur(Math.max(6, Math.round(Math.min(w, h) / 5)))
      .png().toBuffer()
    const mask = Buffer.from(
      `<svg width="${w}" height="${h}"><path d="${wmPlatePath(w, h, corner)}" fill="white"/></svg>`
    )
    const rounded = await sharp(patch)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png().toBuffer()
    return { input: rounded, top, left }
  } catch { return null }
}

/**
 * 蓋掉站方浮水印。
 *
 * corner        壓 GGB logo 的那一角（比對分數第一名）
 * blurCorners   要一起糊掉的角落（通常是前兩名）。挑錯角時的保險，
 *               實測正確答案 100% 落在前兩名內
 */
export async function brandCoverImage(
  buf: Buffer,
  corner: WmCorner,
  blurCorners: WmCorner[] = [],
): Promise<Buffer | null> {
  try {
    const logo = await getLogoBuffer()
    if (!logo) return null
    const meta = await sharp(buf).metadata()
    const W = meta.width ?? 0, H = meta.height ?? 0
    if (!W || !H) return null
    const logoW = Math.round(W * 0.21)
    const logoH = Math.round((logoW * 107) / 300)
    const pad = Math.round(logoW * 0.05)
    const plateW = logoW + pad * 2
    const plateH = logoH + pad * 2
    const left = corner.endsWith('left') ? 0 : W - plateW
    const top = corner.startsWith('top') ? 0 : H - plateH

    const base = sharp(buf)
    // 模糊要先貼、logo 後貼，第一名那格的模糊才會被白墊蓋掉
    const blurs = (await Promise.all(
      [...new Set([corner, ...blurCorners])].map(c => blurCorner(base, W, H, c, plateW, plateH)),
    )).filter((x): x is { input: Buffer; top: number; left: number } => x !== null)

    const plate = Buffer.from(
      `<svg width="${plateW}" height="${plateH}"><path d="${wmPlatePath(plateW, plateH, corner)}" fill="white" fill-opacity="0.97"/></svg>`
    )
    const logoResized = await sharp(logo).resize(logoW, logoH).png().toBuffer()
    return await sharp(buf)
      .composite([
        ...blurs,
        { input: plate, top, left },
        { input: logoResized, top: top + pad, left: left + pad },
      ])
      .jpeg({ quality: 88 })
      .toBuffer()
  } catch { return null }
}
