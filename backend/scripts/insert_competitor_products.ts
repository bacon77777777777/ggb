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
 *   cd backend && npx tsx scripts/insert_competitor_products.ts <out.json> [--apply] [--only=STG]
 *   不加 --apply 只試算，不寫入。
 *   `--only=STG`／`--only=PROD` 只寫其中一個環境（老闆說「先建在 stg」時用）。
 *
 * out.json 的每一件商品另外可以帶三個選填欄位（沒帶就照舊）：
 *   cards_per_pack  抽卡一包幾張（1／3／5／10，migration 666）
 *   pack_style      卡包樣式 builtin／custom
 *   machine_theme   個別指定開包演出；留空＝跟著全站預設走
 *   description     商品說明。**這是玩家看得到的欄位**（商品頁內文＋分享卡的 OG
 *                   description），沒帶就留空，不會自動塞任何字。
 *   card_set        抽卡：遊々亭系列代碼（sv10、m06…）。寫完商品會**在這台機器上抓一次**
 *                   遊々亭標價當翻牌「+N」體感值（Vercel 抓不到，只有本機能抓）；沒帶或對不到
 *                   卡號的品項由 DB 補賞等體感值，所以抽卡商品一定有值、一定會跳。
 */

import fs from 'fs'
import { Client } from 'pg'
import { fillCardPricesPg } from '../lib/cardPrices'

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
  cards_per_pack?: number; pack_style?: string; machine_theme?: string; description?: string
  card_set?: string
}

const [, , inPath] = process.argv
const apply = process.argv.includes('--apply')
const only = (process.argv.find(a => a.startsWith('--only='))?.split('=')[1] ?? '').toUpperCase()
if (!inPath) {
  console.error('用法：tsx scripts/insert_competitor_products.ts <out.json> [--apply]')
  process.exit(1)
}

const items: Item[] = JSON.parse(fs.readFileSync(inPath, 'utf8'))

/**
 * 商品說明。
 *
 * ⚠️ **絕對不要在這裡塞內部備註。** 舊版沒帶 description 時會自動填
 * 「匯入自◯◯公開商品頁，圖片與文案待替換」，2026-09-02 老闆把剛建好的商品網址
 * 貼進 LINE，那段字就變成分享卡的說明文出現在對話裡 —— `description` 同時是
 * 商品頁內文與 OG description，玩家看得到。
 *
 * 要提醒老闆的事寫在對話與 DEVLOG，不要寫進 DB。沒有成品文案就留空。
 */
const description = (it: Item) => it.description ?? ''

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
            image_url, description, total_count, remaining, remaining_count, sales,
            cards_per_pack, pack_style, machine_theme, card_set)
         VALUES ($1,$2,$3,$4,'pending',false,$5,$6,$7,$8,$8,0,0,$9,$10,$11,$12)
         RETURNING id`,
        [it.name, it.category, it.price, it.type, SUPPLIER_ID, it.image, description(it), total,
         it.type === 'card' && (it.cards_per_pack ?? 1) > 1 ? it.cards_per_pack : null,
         it.pack_style === 'custom' ? 'custom' : 'builtin',
         it.machine_theme || null,
         it.type === 'card' && it.card_set ? it.card_set.trim().toLowerCase() : null],
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

  // 抽卡：寫完就抓一次行情（交易外；抓價失敗不該把已匯入的商品退掉）
  if (apply && ids.card?.length) {
    console.log(`  翻牌 +N 行情（遊々亭，抓這一次）`)
    try {
      const r = await fillCardPricesPg(c, { productIds: ids.card, log: console.log })
      console.log(`  → 真價 ${r.updated} 筆、體感值 ${r.fallback} 筆`)
    } catch (e) { console.error(`  ✗ 抓行情失敗：${(e as Error).message}（品項已由 DB 補體感值）`) }
  }
  await c.end()
}

async function main() {
  const prizes = items.reduce((s, i) => s + i.prizes.length, 0)
  console.log(`${items.length} 件商品、${prizes} 個品項${apply ? '' : '（乾跑，不會寫入）'}\n`)
  const targets = only ? DBS.filter(d => d.name === only) : DBS
  if (!targets.length) { console.error(`--only=${only} 不認得，只能是 STG 或 PROD`); process.exit(1) }
  if (only) console.log(`只寫 ${only}\n`)
  for (const db of targets) await run(db)
  if (!apply) console.log('\n確認無誤後加上 --apply 才會真的寫入。')
}

main().catch(e => { console.error(e); process.exit(1) })
