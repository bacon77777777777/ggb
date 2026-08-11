/**
 * 把 import_competitor_products.ts 產出的 out.json 寫進 STG／PROD
 *
 * 一律寫成 `status='pending'`（後台顯示「待上架」）、`is_active=false`：
 * PROD 是正式站，帶著外站圖片與外文品名的商品不能直接出現在店面。
 * 老闆換完圖／改完名再自己上架。
 *
 * 為什麼是 pending 而不是 active：`trg_auto_seal_on_publish` 看到 active 就會
 * 立刻排籤封存，而封存後 `guard_sealed_product` 會擋掉所有賞項異動 ——
 * 上一批就是這樣，老闆想改個數量都改不了。pending 進來、上架時才封存才對。
 *
 * 機率依 migration 516 的規則算：品項數量 ÷ 商品總數量 × 100，最後賞固定 0
 * （觸發式，不進輪盤）。products.total_count 不含最後賞。
 *
 * 用法：
 *   cd backend && npx tsx scripts/insert_competitor_products.ts <out.json> [--apply]
 *   不加 --apply 只試算，不寫入。
 */

import fs from 'fs'
import { Client } from 'pg'

const DBS = [
  { name: 'STG', url: 'postgresql://postgres.zqxxmdbvtwuiocebaxvk:pdsCNbpWjJb4ikpR@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres' },
  { name: 'PROD', url: 'postgresql://postgres.akdqleelvqvjhjnfkpfq:OhpiiPc5OshSrtHt@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres' },
]

const SUPPLIER_ID = 3   // 吉吉比（兩個環境都有）

interface Prize { level: string; is_last: boolean; name: string; image: string | null; qty: number }
interface Item {
  src: string; type: string; category: string
  name: string; price: number; image: string | null
  prizes: Prize[]; total_count: number
}

const [, , inPath] = process.argv
const apply = process.argv.includes('--apply')
if (!inPath) {
  console.error('用法：tsx scripts/insert_competitor_products.ts <out.json> [--apply]')
  process.exit(1)
}

const items: Item[] = JSON.parse(fs.readFileSync(inPath, 'utf8'))

const description = (src: string) => src.startsWith('fc:')
  ? '匯入自 fortune-cookie（fortune-cookie.tokyo）公開商品頁，名稱／文案／圖片待替換'
  : '匯入自潮玩家公開商品頁，圖片與文案待替換'

async function run(db: typeof DBS[number]) {
  const c = new Client({ connectionString: db.url })
  await c.connect()
  const ids: Record<string, number[]> = {}

  try {
    await c.query('BEGIN')
    for (const it of items) {
      const total = it.total_count
      if (!total) throw new Error(`${it.name} 總數量為 0`)

      const { rows } = await c.query(
        `INSERT INTO products
           (name, category, price, type, status, is_active, supplier_id,
            image_url, description, total_count, remaining, remaining_count, sales)
         VALUES ($1,$2,$3,$4,'pending',false,$5,$6,$7,$8,$8,0,0)
         RETURNING id`,
        [it.name, it.category, it.price, it.type, SUPPLIER_ID, it.image, description(it.src), total],
      )
      const pid = rows[0].id as number
      ;(ids[it.type] ??= []).push(pid)

      for (const p of it.prizes) {
        await c.query(
          `INSERT INTO product_prizes
             (product_id, level, name, image_url, total, remaining, probability, is_last_one)
           VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`,
          [pid, p.level, p.name.slice(0, 255), p.image, p.qty,
           p.is_last ? 0 : +(p.qty * 100 / total).toFixed(6), p.is_last],
        )
      }
    }
    if (apply) { await c.query('COMMIT') } else { await c.query('ROLLBACK') }
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  }

  const range = (a: number[]) => a.length ? `${Math.min(...a)}–${Math.max(...a)}（${a.length} 件）` : '無'
  console.log(`[${db.name}]${apply ? '' : '（試算，已 rollback）'}`)
  for (const [t, a] of Object.entries(ids)) console.log(`  ${t.padEnd(9)} ${range(a)}`)
  await c.end()
}

async function main() {
  const prizes = items.reduce((s, i) => s + i.prizes.length, 0)
  console.log(`${items.length} 件商品、${prizes} 個品項${apply ? '' : '（乾跑，不會寫入）'}\n`)
  for (const db of DBS) await run(db)
  if (!apply) console.log('\n確認無誤後加上 --apply 才會真的寫入。')
}

main().catch(e => { console.error(e); process.exit(1) })
