import sharp from 'sharp'

const OPTS: Record<string, { w: number; h: number; q: number }> = {
  products:    { w: 800,  h: 800,  q: 85 },
  banners:     { w: 1200, h: 400,  q: 88 },
  // 彈窗主視覺多為直式且文案畫在圖裡，沿用 banners 的 1200x400 會被壓到只剩 300 寬
  promos:      { w: 1200, h: 1600, q: 90 },
  /*
   * App 開屏廣告：滿版直式，且會被 object-cover 拉到整個螢幕。
   *
   * 檔案還是存在 banners/ 底下（同一個後台頁管理），但**不能沿用 banners 的
   * 1200x400** —— 一張 1080x1920 的直式圖套進去，高度卡在 400 就被壓成
   * 185x400，在 iPhone 16（1179x2556）上等於放大 6.4 倍，糊到不能看。
   * 這個坑 promos 踩過一次，開屏是後來加的沒跟著修（2026-08-20 修正）。
   *
   * 1290x2796 是 iPhone 16 Pro Max 的實體像素，蓋得住所有在賣的機型。
   */
  app_splash:  { w: 1290, h: 2796, q: 92 },
  avatars:     { w: 200,  h: 200,  q: 85 },
  marketplace: { w: 800,  h: 800,  q: 85 },
}

export async function compressToWebP(buf: Buffer, bucket = 'products'): Promise<Buffer> {
  const { w, h, q } = OPTS[bucket] ?? { w: 1200, h: 1200, q: 85 }
  return sharp(buf)
    .resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: q })
    .toBuffer()
}
