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
  if (!fx) throw new Error('抓不到 JPY→TWD 匯率')
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
    // 批次寫（逐筆對 Seoul 來回 1000 多趟會跑超過 10 分鐘）
    const rows = prizes.flatMap(z => { const jpy = minByNo.get(String(z.card_no)); return jpy === undefined ? [] : [{ id: z.id, no: z.card_no, jpy, display: toDisplayValue(jpy, fx) }] })
    const matched = rows.length
    if (rows.length) {
      await c.query('UPDATE product_prizes AS pp SET market_display_value = v.val::numeric FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::numeric[]) AS val) v WHERE pp.id = v.id',
        [rows.map(r => r.id), rows.map(r => r.display)]); updated += rows.length
      await c.query(`INSERT INTO card_market_prices (prize_id, source, card_set, card_no, jpy, fx_jpy_twd, twd, display_value, fetched_at)
        SELECT unnest($1::bigint[]), 'yuyu-tei', $2, unnest($3::text[]), unnest($4::int[]), $5, unnest($6::int[]), unnest($7::numeric[]), $8`,
        [rows.map(r => r.id), set, rows.map(r => r.no), rows.map(r => r.jpy), fx, rows.map(r => Math.round(r.jpy * fx)), rows.map(r => r.display), fetchedAt]); history += rows.length
    }
    console.log(`  ${set}: cards ${cards.length}, matched ${matched}`)
    await new Promise(r => setTimeout(r, 800))
  }
  console.log(JSON.stringify({ fx, updated, history }))
  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
