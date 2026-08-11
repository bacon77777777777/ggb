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

/**
 * 取「內容區」——扣掉上下左右的純色留白之後，真正有畫面的那個方框
 *
 * 電ホビ的 og:image 常常是把直式照片放進 1200×630 的畫布，左右補白邊。
 * 站方浮水印是壓在**照片**的角落，不是畫布角落 —— 實測一張內容區從
 * x=285 才開始，浮水印就落在 x≈285，而我們的白墊蓋在畫布右上，
 * 兩者差了半張圖，等於完全沒蓋到（老闆截圖的第二張就是這個）。
 *
 * 沒有留白的圖，回傳的就是整張圖，行為跟以前一樣。
 */
export async function contentBox(buf: Buffer): Promise<{ left: number; top: number; width: number; height: number }> {
  const meta = await sharp(buf).metadata()
  const W = meta.width ?? 0, H = meta.height ?? 0
  try {
    const { info } = await sharp(buf).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true })
    const left = Math.max(0, -(info.trimOffsetLeft ?? 0))
    const top = Math.max(0, -(info.trimOffsetTop ?? 0))
    const width = Math.min(info.width || W, W - left)
    const height = Math.min(info.height || H, H - top)
    // 整張都被裁光（純色圖）或裁過頭時退回原尺寸
    if (width < W * 0.3 || height < H * 0.3) return { left: 0, top: 0, width: W, height: H }
    return { left, top, width, height }
  } catch {
    return { left: 0, top: 0, width: W, height: H }
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
    const canvasW = meta.width ?? 0, canvasH = meta.height ?? 0
    if (!canvasW || !canvasH) return null
    // 角落一律以內容區為準（留白邊的圖，浮水印貼在照片角落而非畫布角落）
    const box = await contentBox(buf)
    const W = box.width, H = box.height
    const logoW = Math.round(W * 0.21)
    const logoH = Math.round((logoW * 107) / 300)
    const pad = Math.round(logoW * 0.05)

    /*
     * 白墊要蓋掉的是「站方浮水印」，不是「我們的 logo」—— 這兩件事以前
     * 綁在一起（墊子剛好等於 logo + padding），所以只要浮水印比我們的 logo
     * 大一點點，右邊就會露出一截（老闆截圖：GGB logo 旁邊還看得到
     * 「HOBBY WEB」）。
     *
     * 關鍵：**浮水印是固定像素大小，不隨圖片縮放**。實測
     *   1200×630 封面圖 → 約 180×53px（15% 寬）
     *   800×800  內文圖 → 約 144×50px（18% 寬）
     * 但白墊是按圖寬算的，圖越小墊子越小 —— 640 寬的圖只有 147px 墊子
     * 對上 150px 的浮水印，右邊就露出那一小截（老闆截圖看到的「ジ」）。
     *
     * 所以下限要同時有比例與絕對值：比例 30%／11% 顧大圖，
     * 絕對 210×66px 顧小圖，兩者取大的那個。
     *
     * logo 本身的大小與位置不變（維持貼齊角落 + padding），只有白色區域
     * 往圖內延伸 —— 老闆已經看過的版面不會跑掉。
     */
    /*
     * 白墊的涵蓋範圍要對齊「問模型的範圍」：偵測時送的是上／下緣各
     * 16% 高的長條，模型回答的 TL/TR/BL/BR 指的是那條長條的左／右 30%。
     * 白墊蓋滿同一塊區域，模型只要角落答對，站標就必然被蓋住 ——
     * 以前白墊只有 11% 高、30% 寬，模型答對了還是可能露出來。
     */
    const plateW = Math.max(logoW + pad * 2, Math.round(W * 0.30), 210)
    const plateH = Math.max(logoH + pad * 2, Math.round(H * 0.16), 66)
    const left = box.left + (corner.endsWith('left') ? 0 : W - plateW)
    const top = box.top + (corner.startsWith('top') ? 0 : H - plateH)
    // logo 貼外側角落，白墊往內延伸
    const logoLeft = corner.endsWith('left') ? pad : plateW - pad - logoW
    const logoTop = corner.startsWith('top') ? pad : plateH - pad - logoH

    const plate = Buffer.from(
      `<svg width="${plateW}" height="${plateH}"><path d="${wmPlatePath(plateW, plateH, corner)}" fill="white" fill-opacity="0.97"/></svg>`
    )
    const logoResized = await sharp(logo).resize(logoW, logoH).png().toBuffer()
    return await sharp(buf)
      .composite([
        { input: plate, top, left },
        { input: logoResized, top: top + logoTop, left: left + logoLeft },
      ])
      .jpeg({ quality: 88 })
      .toBuffer()
  } catch { return null }
}
