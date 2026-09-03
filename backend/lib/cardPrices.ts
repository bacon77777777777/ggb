/**
 * 抽卡翻牌的「+10,000」體感數字（老闆 2026-09-03）
 *
 * **只在商品匯入那一次抓，之後不抓**（老闆：反正只是體驗）。真價只有本機抓得到 ——
 * 遊々亭擋所有機房 IP：Vercel iad1 的 serverless 與 edge runtime、Supabase Seoul 的 pg_net
 * 全部 403，Hobby 方案又不吃 preferredRegion（2026-09-03 三種都試過）。所以：
 *   - 匯入腳本（insert_competitor_products / import_yuyutei_pack，在這台 Mac 跑）寫完商品就呼叫
 *     `fillCardPricesPg()` 抓真價，抓不到的由 `apply_card_value_fallback()` 補賞等體感值
 *   - DB trigger `trg_prize_value_fallback`（migration 692）保底：任何管道新增的抽卡品項沒有值就補
 *   - `runCardPriceUpdate()`（supabase client 版）留給 /api/cron/card-price-daily 手動觸發用，
 *     在 Vercel 上實際抓不到，排程已拿掉（migration 691）
 *
 * 來源：遊々亭（yuyu-tei.jp）各系列的日圓**標價**（不是成交價；本機帶瀏覽器 UA 即可）。
 * 匯率：open.er-api.com（免費、免金鑰、每日更新）。台灣銀行的 CSV 端點有 Cloudflare 驗證，
 *       照公司規則不繞。**顯示值 = 日圓 × 當日匯率的台幣，保留小數兩位**（老闆 2026-09-03 定案：
 *       30～80 円的普卡也要換算、也要跳，所以不取 5 的倍數、不設門檻）。抓不到匯率就跳過這一輪。
 * 對應：商品 `card_set`（遊々亭 vers 代碼，如 sv10、m02）＋ 品項 `card_no`（3 位卡號）。
 *       同一個卡號有多個版本（鏡面／異版）時取**最低價**，寧可保守也不要誇大體感。
 * 顯示：`product_prizes.market_display_value`，有值就跳、不設門檻。歷史寫 `card_market_prices`。
 */
import type { Client as PgClient } from 'pg'
import { getSupabaseAdmin } from './supabaseAdmin'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
/** 日圓 × 匯率 → 台幣，小數兩位 */
export const toDisplayValue = (jpy: number, fx: number) => Math.round(jpy * fx * 100) / 100

export async function fetchJpyTwd(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/JPY', { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const j = await res.json() as { result?: string; rates?: Record<string, number> }
    const v = j?.rates?.TWD
    return typeof v === 'number' && v > 0 ? v : null
  } catch { return null }
}

export interface SetCard { no: string; rarity: string; name: string; jpy: number }

/** 遊々亭系列頁：每張卡是 <img alt="130/098 UR ロケット団のミュウツーex"> … <strong>1,234 円</strong> */
export function parseSetPage(html: string): SetCard[] {
  const out: SetCard[] = []
  const re = /alt="(\d{3})\/\d{3}\s+(\S+)\s+([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const tail = html.slice(m.index, m.index + 3000)
    const pm = /<strong[^>]*>\s*([\d,]+)\s*円/.exec(tail)
    if (!pm) continue
    const jpy = Number(pm[1].replace(/,/g, ''))
    if (!Number.isFinite(jpy) || jpy <= 0) continue
    out.push({ no: m[1], rarity: m[2], name: m[3].trim(), jpy })
  }
  return out
}

export async function fetchSetCards(setCode: string): Promise<SetCard[]> {
  const res = await fetch(`https://yuyu-tei.jp/sell/poc/s/${setCode}`, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,zh-TW;q=0.9,en;q=0.8',
      'Referer': 'https://yuyu-tei.jp/',
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`yuyu-tei ${setCode} → ${res.status}`)
  const html = await res.text()
  // 找不到的代碼會落到「一覧」通用頁：標題沒有 [代碼] 就當抓錯，不要拿別的系列的價
  if (!new RegExp(`\\[${setCode.replace(/^([a-z]+)0*(\\d)/, '$1$2')}`, 'i').test(html) && !/\[[A-Z]+\d/.test(html.slice(0, 5000))) {
    throw new Error(`yuyu-tei ${setCode}：不是系列頁（代碼可能不對）`)
  }
  return parseSetPage(html)
}

export interface RunSummary {
  fx: number | null
  sets: { set: string; products: number; cards: number; matched: number; error?: string }[]
  updatedPrizes: number
  historyRows: number
}

export async function runCardPriceUpdate(): Promise<RunSummary> {
  const supabase = getSupabaseAdmin()
  const fx = await fetchJpyTwd()
  if (!fx) throw new Error('抓不到 JPY→TWD 匯率，這一輪跳過')
  const { data: products, error: pErr } = await supabase
    .from('products').select('id, card_set').eq('type', 'card').not('card_set', 'is', null)
  if (pErr) throw pErr
  const bySet = new Map<string, number[]>()
  for (const p of products ?? []) {
    const set = String(p.card_set).trim().toLowerCase()
    if (!set) continue
    bySet.set(set, [...(bySet.get(set) ?? []), Number(p.id)])
  }

  const summary: RunSummary = { fx, sets: [], updatedPrizes: 0, historyRows: 0 }
  const fetchedAt = new Date().toISOString()

  for (const [set, productIds] of bySet) {
    const entry = { set, products: productIds.length, cards: 0, matched: 0 } as RunSummary['sets'][number]
    summary.sets.push(entry)
    let cards: SetCard[]
    try { cards = await fetchSetCards(set) } catch (e) { entry.error = (e as Error).message; continue }
    entry.cards = cards.length
    // 同卡號取最低價
    const minByNo = new Map<string, number>()
    for (const c of cards) minByNo.set(c.no, Math.min(minByNo.get(c.no) ?? Infinity, c.jpy))

    const { data: prizes, error: zErr } = await supabase
      .from('product_prizes').select('id, product_id, card_no').in('product_id', productIds).not('card_no', 'is', null)
    if (zErr) { entry.error = zErr.message; continue }

    const history: Record<string, unknown>[] = []
    for (const z of prizes ?? []) {
      const jpy = minByNo.get(String(z.card_no))
      if (jpy === undefined) continue
      const display = toDisplayValue(jpy, fx)
      history.push({
        prize_id: z.id, source: 'yuyu-tei', card_set: set, card_no: z.card_no, jpy,
        fx_jpy_twd: fx, twd: Math.round(jpy * fx), display_value: display, fetched_at: fetchedAt,
      })
      const { error: uErr } = await supabase.from('product_prizes').update({ market_display_value: display }).eq('id', z.id)
      if (!uErr) summary.updatedPrizes++
    }
    entry.matched = history.length
    if (history.length) {
      const { error: hErr } = await supabase.from('card_market_prices').insert(history)
      if (hErr) entry.error = hErr.message; else summary.historyRows += history.length
    }
    // 對外站客氣一點：一個系列一次請求，之間停一下
    await new Promise(r => setTimeout(r, 800))
  }
  return summary
}

export interface PgFillOptions {
  /** 只處理這些商品；不給就是全部有 card_set 的抽卡商品 */
  productIds?: number[]
  log?: (line: string) => void
}

/**
 * 本機版：抓遊々亭真價、用 pg 連線批次寫入，再跑 `apply_card_value_fallback()` 把對不到的補上體感值。
 * 匯入腳本在 --apply 寫完商品後呼叫；同一連線、不開交易（抓價失敗不該把已匯入的商品退掉）。
 * 逐筆對 Seoul 來回 1000 多趟會跑超過 10 分鐘，所以 UPDATE／INSERT 都走 unnest 批次。
 */
export async function fillCardPricesPg(c: PgClient, opts: PgFillOptions = {}): Promise<{ fx: number | null; updated: number; fallback: number }> {
  const log = opts.log ?? (() => {})
  const fx = await fetchJpyTwd()
  const filter = opts.productIds ? 'AND id = ANY($1)' : ''
  const params = opts.productIds ? [opts.productIds] : []
  const { rows: products } = await c.query<{ id: number; card_set: string }>(
    `SELECT id, card_set FROM products WHERE type='card' AND card_set IS NOT NULL ${filter}`, params)
  const bySet = new Map<string, number[]>()
  for (const p of products) { const s = p.card_set.trim().toLowerCase(); if (s) bySet.set(s, [...(bySet.get(s) ?? []), Number(p.id)]) }

  let updated = 0
  if (!fx) log('  ✗ 抓不到 JPY→TWD 匯率，這次只補體感值')
  else {
    const fetchedAt = new Date().toISOString()
    for (const [set, ids] of bySet) {
      let cards: SetCard[]
      try { cards = await fetchSetCards(set) } catch (e) { log(`  ✗ ${set}: ${(e as Error).message}`); continue }
      const minByNo = new Map<string, number>()
      for (const k of cards) minByNo.set(k.no, Math.min(minByNo.get(k.no) ?? Infinity, k.jpy))
      const { rows: prizes } = await c.query<{ id: number; card_no: string }>(
        'SELECT id, card_no FROM product_prizes WHERE product_id = ANY($1) AND card_no IS NOT NULL', [ids])
      const rows = prizes.flatMap(z => { const jpy = minByNo.get(String(z.card_no)); return jpy === undefined ? [] : [{ id: z.id, no: z.card_no, jpy, display: toDisplayValue(jpy, fx) }] })
      if (rows.length) {
        await c.query('UPDATE product_prizes AS pp SET market_display_value = v.val::numeric FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::numeric[]) AS val) v WHERE pp.id = v.id',
          [rows.map(r => r.id), rows.map(r => r.display)])
        await c.query(`INSERT INTO card_market_prices (prize_id, source, card_set, card_no, jpy, fx_jpy_twd, twd, display_value, fetched_at)
          SELECT unnest($1::bigint[]), 'yuyu-tei', $2, unnest($3::text[]), unnest($4::int[]), $5, unnest($6::int[]), unnest($7::numeric[]), $8`,
          [rows.map(r => r.id), set, rows.map(r => r.no), rows.map(r => r.jpy), fx, rows.map(r => Math.round(r.jpy * fx)), rows.map(r => r.display), fetchedAt])
        updated += rows.length
      }
      log(`  ${set}: 遊々亭 ${cards.length} 張，對到 ${rows.length}/${prizes.length}`)
      // 對外站客氣一點：一個系列一次請求，之間停一下
      await new Promise(r => setTimeout(r, 800))
    }
  }
  const { rows: [fb] } = await c.query<{ n: number }>('SELECT apply_card_value_fallback() AS n')
  const fallback = Number(fb?.n ?? 0)
  if (fallback) log(`  對不到來源的 ${fallback} 個品項補了賞等體感值`)
  return { fx, updated, fallback }
}
