/**
 * 從本機抓遊々亭行情、直接用 postgres 連線寫進指定環境。
 *
 * 為什麼有這支：Vercel 機房（serverless 與 edge 都是）被遊々亭擋 403；本機（台灣 IP）抓得到。
 * 平常不需要跑 —— 匯入腳本寫完商品就會自己抓一次；這支是想整批重抓時用的。
 *
 *   CARD_PRICES_DB_URL="postgresql://…" npx tsx scripts/card_prices_run_pg.ts [--product=869]
 */
import { Client } from 'pg'
import { fillCardPricesPg } from '../lib/cardPrices'

async function main() {
  const url = process.env.CARD_PRICES_DB_URL
  if (!url) throw new Error('缺 CARD_PRICES_DB_URL')
  const only = process.argv.find(a => a.startsWith('--product='))?.slice(10)
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    const r = await fillCardPricesPg(c, { productIds: only ? only.split(',').map(Number) : undefined, log: console.log })
    console.log(JSON.stringify(r))
  } finally { await c.end() }
}
main().catch(e => { console.error(e); process.exit(1) })
