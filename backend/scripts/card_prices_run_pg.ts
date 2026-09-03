/**
 * 從本機抓遊々亭行情、直接用 postgres 連線寫進指定環境（老闆 2026-09-03 推正當天）。
 *
 * 為什麼有這支：正式站的 cron 跑在 Vercel 機房，遊々亭擋機房 IP 一律 403；本機（台灣 IP）抓得到。
 * 邏輯與 lib/cardPrices.ts 一樣（同卡號取最低價、日圓 × 0.22 取 5 的倍數），只是寫入改走 pg。
 *
 *   CARD_PRICES_DB_URL="postgresql://…" npx tsx scripts/card_prices_run_pg.ts
 */
import { Client } from 'pg'
import { fetchJpyTwd, fetchSetCards, toDisplayValue } from '../lib/cardPrices'

async function main() {
  const url = process.env.CARD_PRICES_DB_URL
  if (!url) throw new Error('缺 CARD_PRICES_DB_URL')
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const fx = await fetchJpyTwd()
  const { rows: products } = await c.query<{ id: number; card_set: string }>("SELECT id, card_set FROM products WHERE type='card' AND card_set IS NOT NULL")
  const bySet = new Map<string, number[]>()
  for (const p of products) { const s = p.card_set.trim().toLowerCase(); bySet.set(s, [...(bySet.get(s) ?? []), Number(p.id)]) }
  const fetchedAt = new Date().toISOString()
  let updated = 0, history = 0
  for (const [set, ids] of bySet) {
    let cards
    try { cards = await fetchSetCards(set) } catch (e) { console.error(`  ✗ ${set}: ${(e as Error).message}`); continue }
    const minByNo = new Map<string, number>()
    for (const k of cards) minByNo.set(k.no, Math.min(minByNo.get(k.no) ?? Infinity, k.jpy))
    const { rows: prizes } = await c.query<{ id: number; card_no: string }>('SELECT id, card_no FROM product_prizes WHERE product_id = ANY($1) AND card_no IS NOT NULL', [ids])
    let matched = 0
    for (const z of prizes) {
      const jpy = minByNo.get(String(z.card_no)); if (jpy === undefined) continue
      const display = toDisplayValue(jpy)
      await c.query('UPDATE product_prizes SET market_display_value = $1 WHERE id = $2', [display, z.id]); updated++
      await c.query('INSERT INTO card_market_prices (prize_id, source, card_set, card_no, jpy, fx_jpy_twd, twd, display_value, fetched_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [z.id, 'yuyu-tei', set, z.card_no, jpy, fx, fx ? Math.round(jpy * fx) : null, display, fetchedAt]); history++; matched++
    }
    console.log(`  ${set}: cards ${cards.length}, matched ${matched}`)
    await new Promise(r => setTimeout(r, 800))
  }
  console.log(JSON.stringify({ fx, updated, history }))
  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
