import { createClaude } from '@/lib/aiUsage'
import { findImage } from '@/lib/imageFinder'

/**
 * 商品資料補齊
 *
 * 廠商的進貨單通常只有「品名、條碼、價格、數量」四樣東西。要能上架，
 * 還缺商品正式名稱、款式清單、商品圖、款式圖 —— 這一支負責把那些查回來。
 *
 * ── 為什麼不逐站寫 HTML 解析 ──
 * 站上原本有 23 個官網爬蟲，實測只剩 8 個能用：網域消失、版面改版、403 擋爬蟲。
 * 連 T-ARTS 這種大廠都抓不到（改過搜尋參數）。逐站解析是持續腐化的東西，
 * 今天修好下個月又壞三個。
 *
 * 改成：搜尋引擎幫我找到「哪一頁有這個商品」，Claude 幫我讀懂「那頁寫了什麼」。
 * 兩者都不在意站方怎麼改版。
 *
 * ── 為什麼一定要 Claude ──
 * 老闆要的是台灣譯名：ホッキョクグマ→北極熊、ワンピース→航海王（不是海賊王）、
 * 鬼滅の刃→鬼滅之刃。這種對應寫死字典永遠補不完，但給對提示詞就會做 ——
 * 情報系統的日文改寫已經證明可行。
 *
 * ── 成本 ──
 * Haiku，一筆商品一次呼叫，約 US$0.006。33 筆的檔案大約 US$0.2。
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
const MODEL = 'claude-haiku-4-5-20251001'

/** 這些網域不是商品頁（社群、搜尋引擎自己、圖床），抓了也讀不出東西 */
const SKIP_HOST = ['google', 'facebook', 'twitter', 'instagram', 'youtube', 'pinterest', 'duckduckgo']

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchText(url: string, timeout = 9000): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,zh-TW;q=0.9' },
      signal: AbortSignal.timeout(timeout),
    })
    if (!r.ok) return null
    return await r.text()
  } catch { return null }
}

/** DuckDuckGo 網頁搜尋，拿前幾個結果的網址 */
async function ddgLinks(query: string, limit = 4): Promise<string[]> {
  const html = await fetchText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query))
  if (!html) return []
  const urls = [...html.matchAll(/uddg=([^&"]+)/g)]
    .map(m => { try { return decodeURIComponent(m[1]) } catch { return '' } })
    .filter(u => u.startsWith('http') && !SKIP_HOST.some(h => u.includes(h)))
  return [...new Set(urls)].slice(0, limit)
}

/**
 * 抓可以拿來讀的頁面文字。
 *
 * 駿河屋放第一個 —— 實測用 JAN 查得到日文正式品名、廠商與定價，
 * 而且是伺服器端渲染，純文字抓得到。Yahoo 購物需要 JavaScript，抓下來
 * 只有版面沒有商品，所以不放。
 */
async function collectPages(name: string, barcode: string | null): Promise<string[]> {
  const jobs: Promise<string | null>[] = []

  if (barcode) {
    jobs.push(fetchText(`https://www.suruga-ya.jp/search?search_word=${barcode}`))
  }
  const query = barcode ? `${barcode}` : name
  const links = await ddgLinks(query)
  for (const u of links) jobs.push(fetchText(u))

  // 條碼查不到東西時，再用名字查一輪
  if (barcode && links.length === 0) {
    for (const u of await ddgLinks(name)) jobs.push(fetchText(u))
  }

  const htmls = await Promise.all(jobs)
  return htmls
    .filter((h): h is string => Boolean(h))
    // 每頁只取前 2500 字。商品資訊都在前段，後面是購物流程與footer，
    // 全部丟進去只是把 token 燒在版面上
    .map(h => stripHtml(h).slice(0, 2500))
    .filter(t => t.length > 200)
    .slice(0, 4)
}

export interface EnrichedProduct {
  /** 台灣譯名的商品正式名稱。查不到就回 null，呼叫端沿用原本的 */
  name: string | null
  distributor: string | null
  jpPriceYen: number | null
  /** 款式清單，已經翻成台灣用語 */
  variants: { name: string; level: string }[]
  /** 有幾款（頁面寫「全4種」時就是 4）。variants 抓不齊時仍然有參考價值 */
  variantCount: number | null
  confidence: 'high' | 'low'
}

const SYSTEM = `你是台灣潮玩電商的商品建檔助理。使用者會給你一個日本商品的「廠商進貨單名稱」與幾段從商品頁抓下來的文字，你要整理出可以直接上架的資料。

規則：
1. 全部輸出繁體中文，用**台灣**的譯名與用語。這點最重要：
   - ワンピース → 航海王（不是「海賊王」）
   - 鬼滅の刃 → 鬼滅之刃
   - ポケモン → 寶可夢（不是「神奇寶貝」）
   - 星のカービィ → 星之卡比
   - ちいかわ → 吉伊卡哇
   - ホッキョクグマ → 北極熊
   - 角色名一律用台灣官方譯名（炭治郎、魯夫、皮卡丘…）
2. 商品名要像台灣電商的商品名，不要保留日文、不要保留廠商的貨號與裝箱資訊
   （例如「@30x5」「040」這種）。
3. 款式（variants）就是這個扭蛋／盒玩／一番賞裡玩家會抽到的東西。
   一番賞用「A賞」「B賞」「最後賞」當 level；扭蛋與盒玩沒有賞等，
   level 一律填空字串。
4. 只寫頁面文字裡真的有的資訊。**不要編造款式名稱**。
   讀不出款式就回空陣列，但如果頁面有寫「全4種」之類的字樣，
   variant_count 要填 4。
5. 只回 JSON，不要任何說明文字。`

const SCHEMA = `{
  "name": "商品名稱（台灣譯名）或 null",
  "distributor": "代理商／製造商，例如 BANDAI、TAKARA TOMY A.R.T.S，或 null",
  "jp_price_yen": 日幣定價數字或 null,
  "variant_count": 款式總數數字或 null,
  "variants": [{ "name": "款式名稱（台灣譯名）", "level": "賞等或空字串" }],
  "confidence": "high 或 low"
}`

/**
 * 讀頁面、抽資料、翻成台灣用語。
 *
 * 找不到任何可讀的頁面時直接回 null，不呼叫 Claude —— 沒有原料就別花錢，
 * 讓 AI 對著空白猜出來的東西比沒有更糟。
 */
export async function enrichProduct(
  rawName: string,
  barcode: string | null,
  productType: string,
): Promise<EnrichedProduct | null> {
  const pages = await collectPages(rawName, barcode)
  if (!pages.length) return null

  const client = createClaude('product-enrich')
  const typeLabel =
    productType === 'ichiban' ? '一番賞'
    : productType === 'blindbox' ? '盒玩'
    : productType === 'gacha' ? '扭蛋'
    : productType

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content:
        `商品類型：${typeLabel}\n` +
        `進貨單名稱：${rawName}\n` +
        (barcode ? `國際條碼：${barcode}\n` : '') +
        `\n以下是搜尋到的商品頁文字：\n\n` +
        pages.map((p, i) => `--- 來源 ${i + 1} ---\n${p}`).join('\n\n') +
        `\n\n請依這個格式回覆：\n${SCHEMA}`,
    }],
  })

  const text = res.content.map(c => (c.type === 'text' ? c.text : '')).join('')
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null

  try {
    const d = JSON.parse(json)
    const variants = Array.isArray(d.variants)
      ? d.variants
          .map((v: { name?: string; level?: string }) => ({
            name: String(v?.name ?? '').trim(),
            level: String(v?.level ?? '').trim(),
          }))
          .filter((v: { name: string }) => v.name.length >= 1)
          .slice(0, 30)
      : []
    return {
      name: d.name ? String(d.name).trim() : null,
      distributor: d.distributor ? String(d.distributor).trim() : null,
      jpPriceYen: Number.isFinite(Number(d.jp_price_yen)) ? Number(d.jp_price_yen) : null,
      variants,
      variantCount: Number.isFinite(Number(d.variant_count)) ? Number(d.variant_count) : null,
      confidence: d.confidence === 'high' ? 'high' : 'low',
    }
  } catch { return null }
}

/**
 * 一整列的補齊：查資料 → 補商品圖 → 補款式圖。
 *
 * 回傳「要改什麼」而不是直接改，讓呼叫端決定要不要寫進去 ——
 * 二次補齊時才有辦法比對前後差異。
 */
export async function enrichRow(
  product: Record<string, unknown>,
  prizes: Record<string, unknown>[],
): Promise<{
  product: Record<string, unknown>
  prizes: Record<string, unknown>[]
  filled: { key: string; label: string; value: unknown; source: string }[]
}> {
  const filled: { key: string; label: string; value: unknown; source: string }[] = []
  const next = { ...product }
  let nextPrizes = prizes.map(p => ({ ...p }))

  const rawName = String(next.name ?? '').trim()
  const barcode = next.barcode ? String(next.barcode) : null
  const type = String(next.type ?? 'gacha')

  if (!rawName) return { product: next, prizes: nextPrizes, filled }

  // ── 查資料 ──
  const info = await enrichProduct(rawName, barcode, type)

  if (info) {
    if (info.name && info.name !== rawName) {
      filled.push({ key: 'name', label: '商品名稱', value: info.name, source: '商品頁 + 台灣譯名' })
      next.name = info.name
    }
    if (info.distributor && !next.distributor) {
      next.distributor = info.distributor
      filled.push({ key: 'distributor', label: '代理商', value: info.distributor, source: '商品頁' })
    }
    if (info.jpPriceYen && !next.jp_price_yen) {
      next.jp_price_yen = info.jpPriceYen
      filled.push({ key: 'jp_price_yen', label: '日幣定價', value: info.jpPriceYen, source: '商品頁' })
    }

    // 廠商沒給品項時才用查到的款式。廠商給了就以廠商的為準 ——
    // 那是他實際會出貨的內容，比網路上查到的可信
    if (!nextPrizes.length && info.variants.length) {
      nextPrizes = info.variants.map(v => ({
        level: v.level || '未分類',
        name: v.name,
        total: 1,
        remaining: 1,
        image_url: null,
        probability: 0,
        recycle_value: 0,
        sale_price: 0,
      }))
      filled.push({
        key: 'prizes', label: '款式',
        value: `${nextPrizes.length} 款`,
        source: `商品頁 + 台灣譯名（${info.confidence === 'high' ? '可信' : '僅供參考'}）`,
      })
    }
  }

  // ── 商品主圖 ──
  if (!next.image_url) {
    const img = await findImage({ key: 'p', query: String(next.name ?? rawName), barcode, reuse: true })
    if (img.url) {
      next.image_url = img.url
      filled.push({ key: 'image_url', label: '商品主圖', value: img.url, source: img.source === 'db' ? '站內既有商品' : '搜尋' })
    }
  }

  // ── 款式圖 ──
  // 款式名單獨搜會搜到別檔商品的圖，一定要連商品名一起
  const productName = String(next.name ?? rawName)
  let prizeImgCount = 0
  for (let i = 0; i < nextPrizes.length; i++) {
    if (nextPrizes[i].image_url) continue
    const pname = String(nextPrizes[i].name ?? '').trim()
    if (!pname) continue
    const img = await findImage({ key: `z${i}`, query: `${productName} ${pname}` })
    if (img.url) { nextPrizes[i].image_url = img.url; prizeImgCount++ }
  }
  if (prizeImgCount) {
    filled.push({ key: 'prize_images', label: '款式圖', value: `${prizeImgCount} 張`, source: '搜尋' })
  }

  return { product: next, prizes: nextPrizes, filled }
}
