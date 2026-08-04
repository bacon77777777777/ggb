import sharp from 'sharp'

const OPTS: Record<string, { w: number; h: number; q: number }> = {
  products:    { w: 800,  h: 800,  q: 85 },
  banners:     { w: 1200, h: 400,  q: 88 },
  // 彈窗主視覺多為直式且文案畫在圖裡，沿用 banners 的 1200x400 會被壓到只剩 300 寬
  promos:      { w: 1200, h: 1600, q: 90 },
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
