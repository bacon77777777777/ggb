import sharp from 'sharp'

const W = 1080
const H = 1080
const BRAND_COLOR = '#7c3aed' // violet-700

function escapeXml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const char of text) {
    line += char
    if (line.length >= maxChars) {
      lines.push(line)
      line = ''
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 3) // 最多 3 行
}

export async function generateProductImage(opts: {
  productImageUrl?: string | null
  productName: string
  priceLabel: string // e.g. '每抽 NT$50'
  style: 'promotional' | 'story' | 'urgency'
}): Promise<Buffer> {
  const { productName, priceLabel, style } = opts

  // 風格色彩
  const styleMap = {
    promotional: { accent: '#f59e0b', label: '🔥 限時活動' },
    story:       { accent: '#10b981', label: '✨ 新品到貨' },
    urgency:     { accent: '#ef4444', label: '⚡ 最後機會' },
  }
  const { accent, label } = styleMap[style]

  // 嘗試下載商品圖
  let productImgBuffer: Buffer | null = null
  if (opts.productImageUrl) {
    try {
      const res = await fetch(opts.productImageUrl)
      if (res.ok) productImgBuffer = Buffer.from(await res.arrayBuffer())
    } catch { /* ignore */ }
  }

  // 背景
  const bg = await sharp({
    create: { width: W, height: H, channels: 4, background: '#0f0f0f' },
  }).png().toBuffer()

  const nameLines = wrapText(productName, 18)
  const nameSvgLines = nameLines
    .map((l, i) => `<text x="80" y="${680 + i * 72}" font-size="64" fill="white" font-weight="bold" font-family="sans-serif">${escapeXml(l)}</text>`)
    .join('\n')

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- 頂部 brand bar -->
    <rect x="0" y="0" width="${W}" height="12" fill="${BRAND_COLOR}"/>
    <!-- 底部漸層遮罩 -->
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect x="0" y="480" width="${W}" height="600" fill="url(#grad)"/>
    <!-- 風格標籤 -->
    <rect x="60" y="620" width="280" height="52" rx="26" fill="${accent}"/>
    <text x="200" y="655" font-size="28" fill="white" font-weight="bold" font-family="sans-serif" text-anchor="middle">${escapeXml(label)}</text>
    <!-- 商品名稱 -->
    ${nameSvgLines}
    <!-- 價格 -->
    <text x="80" y="${680 + nameLines.length * 72 + 20}" font-size="44" fill="${accent}" font-weight="bold" font-family="sans-serif">${escapeXml(priceLabel)}</text>
    <!-- logo 右下 -->
    <text x="${W - 60}" y="${H - 40}" font-size="28" fill="rgba(255,255,255,0.5)" font-family="sans-serif" text-anchor="end">ggb.tw</text>
    <!-- 底部 brand bar -->
    <rect x="0" y="${H - 12}" width="${W}" height="12" fill="${BRAND_COLOR}"/>
  </svg>`

  const overlayBuf = Buffer.from(overlay)

  if (productImgBuffer) {
    // 商品圖縮放置中（上半部 540px）
    const productResized = await sharp(productImgBuffer)
      .resize(600, 540, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()

    return sharp(bg)
      .composite([
        { input: productResized, top: 60, left: 240 },
        { input: overlayBuf, top: 0, left: 0 },
      ])
      .jpeg({ quality: 90 })
      .toBuffer()
  }

  return sharp(bg)
    .composite([{ input: overlayBuf, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer()
}
