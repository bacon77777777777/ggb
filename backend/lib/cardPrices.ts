/**
 * 抽卡翻牌的「+10,000」體感數字 —— 每日抓價（老闆 2026-09-03）
 *
 * 來源：遊々亭（yuyu-tei.jp）各系列的日圓**標價**（不是成交價；穩、每日可抓、無反爬，帶 UA 即可）。
 * 匯率：open.er-api.com（免費、免金鑰、每日更新）。台灣銀行的 CSV 端點有 Cloudflare 驗證，
 *       照公司規則不繞。匯率只用來算台幣參考值存檔，**顯示值不吃匯率**：
 *       顯示值 = 日圓 × 0.22 取 5 的倍數，跟匯入商品定價同一把尺（CLAUDE.md 的日圓換算慣例），
 *       數字才不會每天跟著匯率跳。
 * 對應：商品 `card_set`（遊々亭 vers 代碼，如 sv10、m02）＋ 品項 `card_no`（3 位卡號）。
 *       同一個卡號有多個版本（鏡面／異版）時取**最低價**，寧可保守也不要誇大體感。
 * 顯示：`product_prizes.market_display_value`，前台 <100 不跳。歷史寫 `card_market_prices`。
 */
import { getSupabaseAdmin } from './supabaseAdmin'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const JPY_TO_G = 0.22

export const toDisplayValue = (jpy: number) => Math.round((jpy * JPY_TO_G) / 5) * 5

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
  const res = await fetch(`https://yuyu-tei.jp/sell/poc/s/${setCode}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
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
      const display = toDisplayValue(jpy)
      history.push({
        prize_id: z.id, source: 'yuyu-tei', card_set: set, card_no: z.card_no, jpy,
        fx_jpy_twd: fx, twd: fx ? Math.round(jpy * fx) : null, display_value: display, fetched_at: fetchedAt,
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
