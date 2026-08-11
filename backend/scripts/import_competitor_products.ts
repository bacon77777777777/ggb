/**
 * 把外站抓來的商品圖搬到 GGB 自己的 R2（主圖順便蓋掉對方站標）
 *
 * 前身是 import_external_images.ts（潮玩家第一批 12 件、clove 4 件）。差別：
 *   1. 主圖會呼叫 coverSourceLogo() 在左上角壓白墊 + GGB logo
 *      —— 潮玩家的主圖左上角固定壓著他們的站標，直接用等於幫對方打廣告
 *   2. 吃的是新的 selection.json 格式（src / type / category / prizes[]）
 *
 * **不留外站網址**：熱連別人的圖有兩個問題 —— 對方換檔名或擋 referer 我們就整批破圖，
 * 而且每個玩家開商品頁都會把 referer 送到對方伺服器。
 * R2 是 STG／PROD 共用，所以圖只上傳一次、兩邊寫同一個網址。
 *
 * 品項圖依老闆指示「先不處理」，原檔上傳；只有超過 400KB 的才轉 WebP
 * （商品頁一次要載幾十張品項圖，放著 1MB 的 PNG 會把 egress 吃掉）。
 *
 * 用法：
 *   cd backend && export $(grep -v '^#' .env.local | xargs) \
 *     && npx tsx scripts/import_competitor_products.ts <selection.json> <out.json>
 */

import fs from 'fs'
import sharp from 'sharp'
import { r2Upload } from '../lib/r2'
import { coverSourceLogo } from '../lib/productBranding'

interface Prize { level: string; is_last: boolean; name: string; image: string | null; qty: number }
interface Item {
  src: string; type: string; category: string
  name: string; price: number; image: string | null
  prizes: Prize[]; total_count: number
}

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error('用法：tsx scripts/import_competitor_products.ts <selection.json> <out.json>')
  process.exit(1)
}

const items: Item[] = JSON.parse(fs.readFileSync(inPath, 'utf8'))

const CONTENT_TYPE: Record<string, string> = {
  webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
}

/** 依來源站帶對應 header；潮玩家的圖床會看 referer */
function headers(url: string): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36' }
  if (url.includes('slimetoy')) h.Referer = 'https://slimetoy.com.tw/'
  if (url.includes('fortune-cookie')) h.Referer = 'https://fortune-cookie.tokyo/'
  return h
}

async function download(url: string): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: headers(url), signal: AbortSignal.timeout(30_000) })
      if (res.ok) return Buffer.from(await res.arrayBuffer())
      if (res.status === 404) { console.warn(`  ✗ 404 ${url}`); return null }
    } catch { /* 逾時／連線失敗，重試 */ }
    await new Promise(r => setTimeout(r, 400 * attempt))
  }
  console.warn(`  ✗ 下載失敗 ${url}`)
  return null
}

const stats = { main: 0, prize: 0, converted: 0, fail: 0 }

/** 主圖：蓋 logo（限潮玩家）→ WebP */
async function putMain(url: string, key: string): Promise<string | null> {
  const buf = await download(url)
  if (!buf) { stats.fail++; return null }
  const out = url.includes('slimetoy')
    ? await coverSourceLogo(buf)
    : await sharp(buf).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()
  stats.main++
  return await r2Upload(`${key}.webp`, out, 'image/webp')
}

/** 品項圖：原檔上傳，過大才轉 WebP */
async function putPrize(url: string, key: string): Promise<string | null> {
  const buf = await download(url)
  if (!buf) { stats.fail++; return null }
  if (buf.length > 400 * 1024) {
    const webp = await sharp(buf).resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()
    stats.prize++; stats.converted++
    return await r2Upload(`${key}.webp`, webp, 'image/webp')
  }
  const ext = (url.split('?')[0].split('.').pop() || 'webp').toLowerCase()
  stats.prize++
  return await r2Upload(`${key}.${ext}`, buf, CONTENT_TYPE[ext] ?? 'image/webp')
}

/** 同時最多 6 條連線，別把對方站打掛 */
async function pool<T>(jobs: (() => Promise<T>)[], size = 6) {
  const running: Promise<void>[] = []
  for (const job of jobs) {
    const p = job().then(() => { running.splice(running.indexOf(p), 1) })
    running.push(p)
    if (running.length >= size) await Promise.race(running)
  }
  await Promise.all(running)
}

async function main() {
  const stamp = Date.now()
  for (const [n, it] of items.entries()) {
    const srcId = it.src.split(':')[1]
    console.log(`[${n + 1}/${items.length}] ${it.category} ${it.name.slice(0, 30)}（品項 ${it.prizes.length}）`)

    if (it.image) it.image = await putMain(it.image, `products/import-${stamp}-${srcId}-main`)

    await pool(it.prizes.map((p, i) => async () => {
      if (!p.image) return
      p.image = await putPrize(p.image, `products/import-${stamp}-${srcId}-p${i + 1}`)
    }))
  }

  fs.writeFileSync(outPath, JSON.stringify(items, null, 1))
  console.log(`\n完成：主圖 ${stats.main}、品項圖 ${stats.prize}（其中 ${stats.converted} 張過大轉 WebP）、失敗 ${stats.fail} → ${outPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
