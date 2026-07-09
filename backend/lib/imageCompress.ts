import sharp from 'sharp'

const OPTS: Record<string, { w: number; h: number; q: number }> = {
  products:    { w: 800,  h: 800,  q: 85 },
  banners:     { w: 1200, h: 400,  q: 88 },
  avatars:     { w: 400,  h: 400,  q: 85 },
  marketplace: { w: 800,  h: 800,  q: 85 },
}

export async function compressToWebP(buf: Buffer, bucket = 'products'): Promise<Buffer> {
  const { w, h, q } = OPTS[bucket] ?? { w: 1200, h: 1200, q: 85 }
  return sharp(buf)
    .resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: q })
    .toBuffer()
}
