/**
 * 把外站抓來的商品圖搬到 GGB 自己的 R2
 *
 * 匯入用（潮玩家 slimetoy.com.tw、clove oripa.clove.jp 的公開商品頁）。**不留外站網址**：
 * 熱連別人的圖有兩個問題 —— 對方換檔名或擋 referer 我們就整批破圖，
 * 而且每個玩家開商品頁都會把 referer 送到對方伺服器。
 *
 * R2 是 STG／PROD 共用，所以圖只上傳一次、兩邊寫同一個網址。
 *
 * 用法：
 *   cd backend && export $(grep -v '^#' .env.local | xargs) \
 *     && npx tsx scripts/import_external_images.ts <selection.json> <out.json>
 */

import fs from 'fs'
import { r2Upload } from '../lib/r2'

/** 來源站的圖片主機。JSON 裡是相對路徑時才會用到（clove 給的是絕對網址） */
const CDN = 'https://img.slimetoy.com.tw/'

interface Prize { level: string; name: string; image: string | null; qty: number }
interface Item { src_id: number; type: string; name: string; price: number; image: string | null; prizes: Prize[] }

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error('用法：tsx scripts/import_external_images.ts <selection.json> <out.json>')
  process.exit(1)
}

const items: Item[] = JSON.parse(fs.readFileSync(inPath, 'utf8'))

/** 外站路徑 → 完整網址。已經是絕對網址就原樣用 */
function absolute(p: string): string {
  return /^https?:\/\//.test(p) ? p : CDN + p.replace(/^\//, '')
}

const CONTENT_TYPE: Record<string, string> = {
  webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
}

/** 下載後上傳到 R2，回傳自家公開網址。失敗回 null，讓呼叫端決定要不要放棄整筆 */
async function relocate(src: string, key: string): Promise<string | null> {
  const url = absolute(src)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://slimetoy.com.tw/' } })
    if (!res.ok) { console.warn(`  ✗ ${res.status} ${url}`); return null }
    const buf = Buffer.from(await res.arrayBuffer())
    const ext = (url.split('.').pop() || 'webp').split('?')[0].toLowerCase()
    return await r2Upload(`${key}.${ext}`, buf, CONTENT_TYPE[ext] ?? 'image/webp')
  } catch (e) {
    console.warn(`  ✗ ${url} — ${e instanceof Error ? e.message : e}`)
    return null
  }
}

async function main() {
  const stamp = Date.now()
  let ok = 0, fail = 0

  for (const it of items) {
    console.log(`\n[${it.type}] ${it.name}`)

    if (it.image) {
      const u = await relocate(it.image, `products/import-${stamp}-${it.src_id}-main`)
      if (u) { it.image = u; ok++ } else { it.image = null; fail++ }
    }

    for (const [i, p] of it.prizes.entries()) {
      if (!p.image) continue
      const u = await relocate(p.image, `products/import-${stamp}-${it.src_id}-p${i + 1}`)
      if (u) { p.image = u; ok++ } else { p.image = null; fail++ }
    }
    console.log(`  主圖＋品項圖共 ${1 + it.prizes.length} 張`)
  }

  fs.writeFileSync(outPath, JSON.stringify(items, null, 1))
  console.log(`\n完成：成功 ${ok} 張、失敗 ${fail} 張 → ${outPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
