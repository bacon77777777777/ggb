/**
 * 文章封面／內文圖的浮水印遮蓋
 *
 * 由 news-agent（新文章）與 scripts/backfill_news_watermark.ts（既有文章回填）
 * 共用，確保兩邊蓋出來的樣式完全一致 —— 先前回填腳本自己寫過一份，
 * 會產生跟正式流程不同的視覺結果。
 *
 * 作法：不裁切，保留原圖。
 *
 * 角落由 dengekiWm 的四角模板比對決定（900px 高解析版，30 張實測 97%）。
 * 曾經有「分數前兩名的角落先模糊再蓋」的雙保險，老闆看了嫌模糊一塊醜，
 * 已拿掉 —— 改走「把挑角準確率拉高」路線。殘餘風險：極少數挑錯角時
 * logo 會蓋在空白處、原浮水印露出（實測 30 張出現 1 張，且那張連
 * 人工標記都判不一致）。
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

/** 蓋掉站方浮水印：在指定角落壓白色圓角墊 + GGB logo，保留原圖 */
export async function brandCoverImage(
  buf: Buffer,
  corner: WmCorner,
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

    const plate = Buffer.from(
      `<svg width="${plateW}" height="${plateH}"><path d="${wmPlatePath(plateW, plateH, corner)}" fill="white" fill-opacity="0.97"/></svg>`
    )
    const logoResized = await sharp(logo).resize(logoW, logoH).png().toBuffer()
    return await sharp(buf)
      .composite([
        { input: plate, top, left },
        { input: logoResized, top: top + pad, left: left + pad },
      ])
      .jpeg({ quality: 88 })
      .toBuffer()
  } catch { return null }
}
