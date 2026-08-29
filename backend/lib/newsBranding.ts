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

/*
 * logo 的長寬比**從檔案量**，不寫死。
 *
 * 原本是 `logoH = logoW * 107 / 300`（對應 600×214 那版 logo.png）。
 * 2026-08-27 換品牌後 logo.png 變成 1554×500，寫死的比例不會有任何錯誤訊息，
 * 只是蓋在情報圖上的 logo 悄悄變形。換圖是遲早的事，改成量檔案。
 */
let _logoRatio: number | null = null
async function getLogoRatio(logo: Buffer): Promise<number> {
  if (_logoRatio) return _logoRatio
  const m = await sharp(logo).metadata()
  _logoRatio = (m.width ?? 600) / (m.height ?? 214)
  return _logoRatio
}



/**
 * 全圖斜向重複的網址浮水印（老闆 2026-08-29 指定：封面與內文圖都要蓋）
 *
 * 跟上面那個「白墊 + logo」是兩件不同的事，不要混在一起看：
 *   白墊 + logo —— 遮掉**別人**壓在角落的站標，只有偵測到才蓋，只蓋一角
 *   這支         —— 蓋**我們自己**的網址，不分來源、每張都蓋、蓋滿整張
 *
 * 用 SVG `<pattern>` 讓 librsvg 自己去平鋪，不用 sharp 的 tile 合成：
 * 斜向重複要無縫，得自己算相位差，交給 pattern + patternTransform 直接省掉。
 *
 * 兩層文字（黑底白字錯開 1px）是必要的：白色單層在白底商品照上幾乎看不見，
 * 而玩具新聞的官方宣傳圖有一半是白底。
 *
 * 參數是實際比對挑出來的（三種濃度各印一張白底 BANDAI 商品照與一張深色
 * banner 比對）：字級 = 圖寬/24、不透明度 0.45、-30 度。再淡就會在白底上
 * 消失，再濃就開始蓋掉商品細節。
 *
 * 全程本地 sharp，不呼叫任何服務。
 */
const WM_TEXT      = 'www.ggb.com.tw'
const WM_ANGLE     = -30
const WM_OPACITY   = 0.45
/** 字級 = 圖寬 / 這個數 */
const WM_FONT_DIV  = 24
/** 橫向、縱向的重複間距（相對於字級） */
const WM_GAP_X     = 1.4
const WM_GAP_Y     = 3.8
/** 小圖不要蓋到看不出東西 */
const WM_MIN_FONT  = 13

function wmPatternSvg(W: number, H: number): Buffer {
  const size = Math.max(WM_MIN_FONT, Math.round(W / WM_FONT_DIV))
  // 7.4em ≈ 'www.ggb.com.tw' 在 Helvetica bold 的寬度
  const tw = Math.round(size * 7.4 * WM_GAP_X)
  const th = Math.round(size * WM_GAP_Y)
  const cx = Math.round(tw / 2), cy = Math.round(th / 2)
  const off = Math.max(1, Math.round(size / 14))
  const font = 'font-family="Helvetica,Arial,sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="middle"'
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<defs><pattern id="wm" patternUnits="userSpaceOnUse" width="${tw}" height="${th}" patternTransform="rotate(${WM_ANGLE})">` +
    `<text x="${cx + off}" y="${cy + off}" font-size="${size}" ${font} fill="#000" fill-opacity="${(WM_OPACITY * 0.55).toFixed(3)}">${WM_TEXT}</text>` +
    `<text x="${cx}" y="${cy}" font-size="${size}" ${font} fill="#fff" fill-opacity="${WM_OPACITY}">${WM_TEXT}</text>` +
    `</pattern></defs><rect width="100%" height="100%" fill="url(#wm)"/></svg>`
  )
}

/**
 * 蓋上網址浮水印，回傳 PNG（無損）—— 讓呼叫端自己決定最後要編成 webp 還是 jpeg，
 * 才不會多壓一手。
 *
 * **一定要在 verifyBrandedClean 之後才呼叫**：滿版的文字會讓「還看不看得到
 * 別人的站標」那道視覺複驗整張都判成髒的。
 *
 * 失敗時回原圖而不是 null：少一層我們自家的浮水印是外觀問題，
 * 為它整篇不發不划算（別人的浮水印才是不能漏的那個）。
 */
export async function stampUrlWatermark(buf: Buffer): Promise<Buffer> {
  try {
    const meta = await sharp(buf).metadata()
    const W = meta.width ?? 0, H = meta.height ?? 0
    if (!W || !H) return buf
    return await sharp(buf)
      .composite([{ input: wmPatternSvg(W, H), blend: 'over' }])
      .png()
      .toBuffer()
  } catch { return buf }
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
    // logo 佔內容寬 15%（原 21%）。白墊至少要裝得下 logo，logo 太大白墊就跟著大 ——
    // 老闆嫌白底佔版面，這是主因之一
    const logoW = Math.round(W * 0.15)
    const logoH = Math.round(logoW / await getLogoRatio(logo))
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
     * 白墊尺寸：涵蓋「站方浮水印實際大小」即可，不再涵蓋「問模型的整段長條」。
     *
     * 原本為了保險，白墊蓋滿偵測長條（30% 寬 × 16% 高）—— 只要模型角落答對
     * 就必然蓋住。但那是一大塊白底（1280 寬的圖是 384×122），老闆嫌太佔版面。
     *
     * 改成貼著浮水印本身的尺寸抓：實測站標是**固定像素、不隨圖片縮放**的
     *   1200×630 封面 → 約 180×53px
     *   800×800 內文 → 約 144×50px
     * 所以絕對下限 190×58 就蓋得住，比例項只是大圖時多留一點餘裕。
     * 1280 寬的圖從 384×122 降到 230×88，白底面積剩約 43%。
     *
     * 代價：浮水印若離角落較遠（不貼邊），有機會露出來。實測的來源都是
     * 貼齊角落，真的遇到再把絕對下限調大即可。
     */
    const plateW = Math.max(logoW + pad * 2, Math.round(W * 0.18), 190)
    const plateH = Math.max(logoH + pad * 2, Math.round(H * 0.10), 58)
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
