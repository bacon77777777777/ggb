/**
 * 換掉商品主圖：本機資料夾 → 轉 WebP → 上傳 R2 → 更新兩個環境的 products.image_url
 *
 * 檔名要帶得出「換哪一件」。目前約定是沿用匯入時的檔名，中間那段數字是來源 id：
 *   import-1786368952411-835-main 1.png  →  835
 * 對應到 DB 是找 image_url 裡含 `-835-main.` 的那筆。
 *
 * 為什麼轉 WebP：老闆給的是 PNG（單張 350~560KB），原本匯入的 webp 只有 50KB 上下。
 * 商品卡是首頁一次列幾十張的東西，直接放 PNG 會把 egress 吃掉一大塊。
 *
 * 為什麼給新檔名而不是覆蓋原 key：R2 前面有 CDN 快取，覆蓋同一個 key 會有一段
 * 時間新舊圖並存，玩家看到哪張看運氣。換 key 就沒有這個問題。
 *
 * 用法：
 *   cd backend && export $(grep -v '^#' .env.local | xargs) \
 *     && npx tsx scripts/replace_product_main_images.ts <圖片資料夾> [--apply]
 *   不加 --apply 只列出對應關係，不動任何東西。
 */

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { Client } from 'pg'
import { r2Upload } from '../lib/r2'

const DBS = [
  { name: 'STG', url: 'postgresql://postgres.zqxxmdbvtwuiocebaxvk:pdsCNbpWjJb4ikpR@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres' },
  { name: 'PROD', url: 'postgresql://postgres.akdqleelvqvjhjnfkpfq:OhpiiPc5OshSrtHt@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres' },
]

const dir = process.argv[2]
const apply = process.argv.includes('--apply')
if (!dir) {
  console.error('用法：tsx scripts/replace_product_main_images.ts <圖片資料夾> [--apply]')
  process.exit(1)
}

async function main() {
  const files = fs.readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f))
  const stamp = Date.now()

  const jobs: { srcId: string; file: string; url?: string }[] = []
  for (const f of files) {
    const m = f.match(/-(\d+)-main/)
    if (!m) { console.warn(`跳過（檔名看不出商品）：${f}`); continue }
    jobs.push({ srcId: m[1], file: f })
  }
  console.log(`找到 ${jobs.length} 張可對應的圖${apply ? '' : '（乾跑，不會動到資料）'}\n`)

  for (const j of jobs) {
    const raw = fs.readFileSync(path.join(dir, j.file))
    const webp = await sharp(raw).webp({ quality: 86 }).toBuffer()
    const pct = Math.round((1 - webp.length / raw.length) * 100)
    console.log(`${j.srcId}：${(raw.length / 1024).toFixed(0)}KB → ${(webp.length / 1024).toFixed(0)}KB WebP（省 ${pct}%）`)
    if (apply) j.url = await r2Upload(`products/main-${stamp}-${j.srcId}.webp`, webp, 'image/webp')
  }

  for (const db of DBS) {
    const c = new Client({ connectionString: db.url })
    await c.connect()
    let hit = 0, miss = 0
    for (const j of jobs) {
      const like = `%-${j.srcId}-main.%`
      if (!apply) {
        const r = await c.query('SELECT id, name FROM products WHERE image_url LIKE $1', [like])
        r.rows.length ? hit++ : miss++
        console.log(`  [${db.name}] ${j.srcId} → ${r.rows.map(x => `#${x.id} ${x.name.slice(0, 22)}`).join(', ') || '找不到對應商品'}`)
        continue
      }
      const r = await c.query('UPDATE products SET image_url = $1, updated_at = now() WHERE image_url LIKE $2 RETURNING id', [j.url, like])
      r.rowCount ? hit++ : miss++
      console.log(`  [${db.name}] ${j.srcId} → 更新 ${r.rowCount} 筆`)
    }
    console.log(`[${db.name}] 命中 ${hit}、沒對到 ${miss}\n`)
    await c.end()
  }
  if (!apply) console.log('確認無誤後加上 --apply 才會真的上傳與更新。')
}

main().catch(e => { console.error(e); process.exit(1) })
