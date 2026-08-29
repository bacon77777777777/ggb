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
import { WM_STAMP_BASE64 } from './newsWatermarkStamp'

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
 * 文字是預先排好的 PNG 圖章（`newsWatermarkStamp.ts`），執行期只做
 * 縮放 → 旋轉 → 補透明邊 → 平鋪，**完全不碰字型**。
 * 第一版用 SVG `<text>`，在沒有系統字型的 serverless 上會靜靜地畫出空白 ——
 * 詳細的驗證數據寫在那支檔案的檔頭，不要改回去。
 *
 * 補透明邊就是間距：旋轉後的圖章右邊補 30%、下面補 55%，`tile: true`
 * 就會照這個週期無縫重複，不用自己算斜向的相位差。
 *
 * 濃淡（白字 0.15 疊黑影 0.075）已經烙進 PNG。老闆的標準是「不要影響圖片閱讀」。
 * 兩層不能省：白色單層在白底商品照上幾乎看不見，而玩具新聞的官方宣傳圖有一半
 * 是白底 —— 淡到 0.15 之後，白底那邊**完全**靠黑影那一層撐著。
 *
 * 全程本地 sharp，不呼叫任何服務。
 */
/** 文字寬度佔圖寬的比例 */
const WM_WIDTH_RATIO = 0.30
/** 圖章原始寬度（放大只會糊，取原寬當上限） */
const WM_MAX_W = 818
/** 小圖也要看得出來，但不要蓋滿整張 */
const WM_MIN_W = 90
const WM_ANGLE = -30
/** 旋轉後往右／往下補多少透明邊當間距（相對於旋轉後的尺寸） */
const WM_GAP_X = 0.30
const WM_GAP_Y = 0.55

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

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

    const stamp = Buffer.from(WM_STAMP_BASE64, 'base64')
    const stampW = Math.max(WM_MIN_W, Math.min(WM_MAX_W, Math.round(W * WM_WIDTH_RATIO)))
    const rotated = await sharp(stamp).resize(stampW)
      .rotate(WM_ANGLE, { background: TRANSPARENT })
      .png().toBuffer()
    const rm = await sharp(rotated).metadata()
    const tile = await sharp(rotated).extend({
      top: 0, left: 0,
      bottom: Math.round((rm.height ?? 1) * WM_GAP_Y),
      right:  Math.round((rm.width  ?? 1) * WM_GAP_X),
      background: TRANSPARENT,
    }).png().toBuffer()

    return await sharp(buf).composite([{ input: tile, tile: true, blend: 'over' }]).png().toBuffer()
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
    // logo 佔內容寬 15%（原 21%）。白墊就是 logo 加一圈 padding，見下方說明
    const logoW = Math.round(W * 0.15)
    const logoH = Math.round(logoW / await getLogoRatio(logo))
    const pad = Math.round(logoW * 0.05)

    /*
     * 白墊尺寸：**剛好包住 logo，不多一分**（老闆 2026-08-29：「白底太寬了吧」）
     *
     * 原本有兩個下限（比例 18%／10%、絕對 190×58px），用意是「就算站方浮水印
     * 比我們的 logo 大也蓋得住」。但代價是白墊遠大於 logo —— 640 寬的圖上是
     * 190×58 的白塊配 96×31 的 logo，看起來就是一塊莫名其妙的白底。
     *
     * 拿掉下限的判斷依據：唯一真的會壓站標的來源（電撃ホビー）已於同日移除，
     * 而這個分支近期每次觸發**都是誤判**（實測四次：oneone 的 BANDAI 食玩圓標、
     * ©創通・サンライズ、※画像はイメージです，以及一張卡牌實拍照的空白角落）。
     * 為了幾乎不會發生的情況在圖上留一大塊白，不划算。
     *
     * **代價要知道**：真的遇到比 logo 大的站方浮水印時會露出一截。
     * 若之後又出現這種來源，正解是把那張圖丟掉（跟內文圖同一套規則），
     * 不是把白墊放大回去。
     */
    const plateW = logoW + pad * 2
    const plateH = logoH + pad * 2
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
