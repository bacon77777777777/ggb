/**
 * 把遊々亭（yuyu-tei.jp）某一彈的卡表匯進來，建成一筆「卡包模式」抽卡商品。
 *
 * 為什麼另寫一支而不是沿用 import/insert_competitor_products：
 *   那兩支是給一番賞／盒玩用的，不認得 cards_per_pack，也寫死了要同時寫 STG＋PROD。
 *   卡包模式有自己的硬性條件（見下），而且這批只進 STG。
 *
 * 卡包模式的三條硬性條件（migration 584/586/590）：
 *   1. total_count 必須是 cards_per_pack 的整數倍，否則 products_pack_stock_check 擋下
 *   2. machine_theme='card_peel' 只有 cards_per_pack>=2 才准用
 *   3. 大賞（A賞）張數不能超過包數 —— 排籤時一包最多放一張大賞，超過會 PACK_MODE_TOO_MANY_MAJOR
 *
 * 一律寫成 status='pending' + is_active=false：active 會被 trg_auto_seal_on_publish
 * 立刻排籤封存，之後連數量都改不了。老闆換完圖／改完名再自己上架。
 *
 * **不留外站網址**：卡圖全部搬到自己的 R2。熱連別人的圖，對方換檔名或擋 referer
 * 我們就整批破圖，而且每個玩家開商品頁都會把 referer 送過去。
 *
 * 用法：
 *   cd backend && export $(grep -v '^#' .env.local | xargs) \
 *     && npx tsx scripts/import_yuyutei_pack.ts <selection.json> <out.json> [--db=STG|PROD] [--apply]
 *   不加 --apply 只搬圖 + 乾跑 SQL（rollback），不會真的寫入。
 *   --db 預設 STG。R2 是兩環境共用，複製到 PROD 時吃 out.json 就不會重傳圖。
 *
 * selection.json 帶 `card_set`（遊々亭系列代碼，如 m06；沒帶就從 src 的 `yuyutei:<代碼>` 取）。
 * 寫完商品會**在這台機器上抓一次**遊々亭標價當翻牌「+N」體感值（Vercel 抓不到，只有本機能抓），
 * 對不到卡號的由 DB 補賞等體感值 —— 抽卡商品一定有值、一定會跳。
 */
import fs from 'fs'
import sharp from 'sharp'
import { Client } from 'pg'
import { r2Upload } from '../lib/r2'
import { fillCardPricesPg } from '../lib/cardPrices'

const DBS = {
  STG: 'postgresql://postgres.zqxxmdbvtwuiocebaxvk:pdsCNbpWjJb4ikpR@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  PROD: 'postgresql://postgres.akdqleelvqvjhjnfkpfq:OhpiiPc5OshSrtHt@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres',
}
const SUPPLIER_ID = 3   // 吉吉比（兩環境都有）

interface Prize { level: string; name: string; image: string; qty: number; rare: string }
interface Item {
  src: string; type: string; category: string; name: string; price: number
  image: string | null; cards_per_pack: number; total_count: number; prizes: Prize[]
  card_set?: string
}
/** 遊々亭系列代碼：selection 帶的優先，否則從 src `yuyutei:m06` 取 */
const cardSetOf = (it: Item) => (it.card_set ?? (/^yuyutei:([a-z0-9]+)/i.exec(it.src)?.[1] ?? '')).trim().toLowerCase() || null

const [, , inPath, outPath] = process.argv
const apply = process.argv.includes('--apply')
const dbArg = (process.argv.find(a => a.startsWith('--db=')) ?? '--db=STG').slice(5).toUpperCase()
if (!(dbArg in DBS)) { console.error(`--db 只接受 ${Object.keys(DBS).join(' / ')}`); process.exit(1) }
const DB_URL = DBS[dbArg as keyof typeof DBS]
if (!inPath || !outPath) {
  console.error('用法：tsx scripts/import_yuyutei_pack.ts <selection.json> <out.json> [--apply]')
  process.exit(1)
}
const items: Item[] = JSON.parse(fs.readFileSync(inPath, 'utf8'))

/** 卡圖搬到 R2。遊々亭的 front 尺寸是 500x700 的 JPEG，一張 ~550KB，一律轉 WebP */
async function moveImage(url: string, key: string): Promise<string> {
  // 已經在自己的 R2 上就不要再搬一次（乾跑完拿 out.json 再跑 --apply 的情況）
  if (process.env.R2_PUBLIC_URL && url.startsWith(process.env.R2_PUBLIC_URL)) return url
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://yuyu-tei.jp/' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const webp = await sharp(buf).webp({ quality: 82 }).toBuffer()
  return r2Upload(`products/${key}.webp`, webp, 'image/webp')
}

async function main() {
  for (const it of items) {
    if (it.total_count % it.cards_per_pack !== 0) {
      throw new Error(`${it.name}：總張數 ${it.total_count} 不是每包 ${it.cards_per_pack} 張的整數倍`)
    }
    const packs = it.total_count / it.cards_per_pack
    const majors = it.prizes.filter(p => /^A賞$|SSR|超稀有|SP賞/.test(p.level))
      .reduce((s, p) => s + p.qty, 0)
    if (majors > packs) throw new Error(`${it.name}：大賞 ${majors} 張 > ${packs} 包，排籤會失敗`)

    // 併發 6：遊々亭是別人的站，不要打太兇
    const stamp = Date.now()
    for (let i = 0; i < it.prizes.length; i += 6) {
      const batch = it.prizes.slice(i, i + 6)
      await Promise.all(batch.map(async (p, j) => {
        p.image = await moveImage(p.image, `card-${stamp}-${i + j}`)
      }))
      process.stdout.write(`\r  搬圖 ${Math.min(i + 6, it.prizes.length)}/${it.prizes.length}`)
    }
    console.log('')
  }
  fs.writeFileSync(outPath, JSON.stringify(items, null, 1))

  const c = new Client({ connectionString: DB_URL })
  await c.connect()
  const created: number[] = []
  try {
    await c.query('BEGIN')
    for (const it of items) {
      const { rows } = await c.query(
        `INSERT INTO products
           (name, category, price, type, status, is_active, supplier_id, image_url, description,
            machine_theme, cards_per_pack, total_count, remaining, remaining_count, sales, card_set)
         VALUES ($1,$2,$3,$4,'pending',false,$5,NULL,$6,'card_peel',$7,$8,$8,0,0,$9)
         RETURNING id`,
        [it.name, it.category, it.price, it.type, SUPPLIER_ID,
         `卡表取自遊々亭公開頁（${it.src}），一包 ${it.cards_per_pack} 張、共 ${it.total_count / it.cards_per_pack} 包。商品圖／卡包正反面／卡牌背面待上傳，部分卡名待覆核。`,
         it.cards_per_pack, it.total_count, cardSetOf(it)],
      )
      const pid = rows[0].id as number
      created.push(pid)
      for (const p of it.prizes) {
        await c.query(
          `INSERT INTO product_prizes
             (product_id, level, name, image_url, total, remaining, probability, is_last_one, display_mode)
           VALUES ($1,$2,$3,$4,$5,$5,$6,false,'static')`,
          [pid, p.level, p.name.slice(0, 255), p.image, p.qty,
           +(p.qty * 100 / it.total_count).toFixed(6)],
        )
      }
      console.log(`[${dbArg}] ${it.name} → 商品 id ${pid}、${it.prizes.length} 個品項`)
    }
    if (apply) await c.query('COMMIT')
    else { await c.query('ROLLBACK'); console.log('（乾跑，已 rollback；確認後加 --apply）') }
  } catch (e) { await c.query('ROLLBACK'); await c.end(); throw e }

  // 寫完就抓一次行情（交易外；抓價失敗不該把已匯入的商品退掉）
  if (apply && created.length) {
    console.log(`[${dbArg}] 翻牌 +N 行情（遊々亭，抓這一次）`)
    try {
      const r = await fillCardPricesPg(c, { productIds: created, log: console.log })
      console.log(`  → 真價 ${r.updated} 筆、體感值 ${r.fallback} 筆`)
    } catch (e) { console.error(`  ✗ 抓行情失敗：${(e as Error).message}（品項已由 DB 補體感值）`) }
  }
  await c.end()
}

main().catch(e => { console.error(e); process.exit(1) })
