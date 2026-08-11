/**
 * 外站商品主圖蓋 GGB logo
 *
 * 潮玩家（slimetoy.com.tw）的商品主圖左上角固定壓著他們自己的站標，
 * 直接拿來用等於把對方招牌掛在我們店面上。作法沿用老闆先前手動修的那 12 張：
 * 左上角壓一塊白底，白底上放 GGB logo。
 *
 * 尺寸是從那 12 張成品量回來的（560×560 的圖）：
 *   白墊 202×74（36.1% × 13.2%）、logo 187×67（33.4% 寬）、貼在 (15, 6)
 * 全部換算成比例，換不同尺寸的來源圖也會蓋出同樣的視覺。
 *
 * 對方站標實測佔 [15,7]–[195,62]（34.8% × 11%），白墊比它大一圈，
 * 不會像情報那邊出現「蓋不完整、露出一截」的問題。
 *
 * 全程本地 sharp 運算，不呼叫任何付費服務。
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

/** 量測自既有成品的比例 */
const PLATE_W = 0.3607
const PLATE_H = 0.1321
const LOGO_W  = 0.3339
const LOGO_X  = 0.0268
const LOGO_Y  = 0.0107
const LOGO_RATIO = 300 / 107   // logo.png 是 600×214

let _logo: Buffer | null = null
function logoBuffer(): Buffer {
  if (!_logo) {
    _logo = fs.readFileSync(path.join(process.cwd(), '../frontend/public/images/logo.png'))
  }
  return _logo
}

/** 左上角壓白墊 + GGB logo，保留原圖其餘部分。輸出 WebP */
export async function coverSourceLogo(buf: Buffer, quality = 86): Promise<Buffer> {
  const meta = await sharp(buf).metadata()
  const W = meta.width ?? 0, H = meta.height ?? 0
  if (!W || !H) throw new Error('讀不出圖片尺寸')

  const plateW = Math.round(W * PLATE_W)
  const plateH = Math.round(H * PLATE_H)
  const logoW  = Math.round(W * LOGO_W)
  const logoH  = Math.round(logoW / LOGO_RATIO)

  const plate = Buffer.from(`<svg width="${plateW}" height="${plateH}"><rect width="${plateW}" height="${plateH}" fill="#ffffff"/></svg>`)
  const logo  = await sharp(logoBuffer()).resize(logoW, logoH).png().toBuffer()

  return await sharp(buf)
    .composite([
      { input: plate, top: 0, left: 0 },
      { input: logo, top: Math.round(H * LOGO_Y), left: Math.round(W * LOGO_X) },
    ])
    .webp({ quality })
    .toBuffer()
}
