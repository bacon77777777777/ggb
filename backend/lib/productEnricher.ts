import { createClaude } from '@/lib/aiUsage'
import { findImage, resolveVendorImage } from '@/lib/imageFinder'
import { lookupGashaponByJan } from '@/lib/sources/gashapon'

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

/**
 * 從整頁文字裡挑出「跟商品有關」的那一段。
 *
 * 原本是 slice(0, 2500) 從頭切 —— 但購物網站的開頭全是導覽列
 *（「全商品 映像ソフト 音楽ソフト おもちゃ・ホビー…」），真正的商品資訊
 * 在後面。實測駿河屋抓到 3400 字，前 2500 字全是選單，等於送給 Claude 的
 * 是一份目錄，難怪讀不出東西。
 *
 * 改成先找錨點：條碼、定価、発売日、メーカー 這些字出現的位置才是商品區塊，
 * 從那裡往前退一點開始取。找不到錨點才退回從頭切。
 */
function relevantSlice(text: string, barcode: string | null, limit = 2500): string {
  if (text.length <= limit) return text

  const anchors: number[] = []
  if (barcode) {
    // 第一次出現通常在 <title>，第二次以後才是商品區塊
    let i = text.indexOf(barcode)
    if (i >= 0) { const j = text.indexOf(barcode, i + barcode.length); anchors.push(j >= 0 ? j : i) }
  }
  for (const kw of ['定価', '希望小売価格', '発売日', 'メーカー', 'ブランド', '全 ', '全4種', '全5種', 'ラインナップ']) {
    const i = text.indexOf(kw)
    if (i >= 0) anchors.push(i)
  }
  if (!anchors.length) return text.slice(0, limit)

  const start = Math.max(0, Math.min(...anchors) - 300)
  return text.slice(start, start + limit)
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
  const htmls: (string | null)[] = []

  if (barcode) {
    // 駿河屋的搜尋頁只有摘要，商品頁才有完整的品名、廠商、定價與發售日。
    // 搜尋頁找得到商品連結就再進去一層 —— 多一次往返換到的資訊差很多
    const searchHtml = await fetchText(`https://www.suruga-ya.jp/search?search_word=${barcode}`)
    if (searchHtml) {
      htmls.push(searchHtml)
      const detail = searchHtml.match(/\/product\/detail\/(\d+)/)?.[0]
      if (detail) htmls.push(await fetchText(`https://www.suruga-ya.jp${detail}`))
    }
  }

  // DDG 會限流，回空是常態而不是例外 —— 所以它是加分項不是主線。
  // 條碼查不到就改用商品名再試一次
  let links = await ddgLinks(barcode || name)
  if (barcode && !links.length) links = await ddgLinks(name)
  for (const u of links) htmls.push(await fetchText(u))

  return htmls
    .filter((h): h is string => Boolean(h))
    .map(h => relevantSlice(stripHtml(h), barcode))
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
  /** 從商品頁判斷出的類型。廠商的清單常常沒有類型欄，這是唯一問得到的地方 */
  productType: 'ichiban' | 'gacha' | 'blindbox' | 'card' | null
  confidence: 'high' | 'low'
}

const SYSTEM = `你是台灣潮玩電商的商品建檔助理。使用者會給你一個日本商品的「廠商進貨單名稱」與幾段從商品頁抓下來的文字，你要整理出可以直接上架的資料。

規則：
1. 全部輸出繁體中文，用**台灣**的譯名與用語。這點最重要，而且是硬性規定：
   **輸出的任何欄位都不可以殘留日文假名（ひらがな／カタカナ）或日文漢字寫法。**
   作品名、角色名、系列名一律換成台灣官方譯名。實測漏掉的幾個：
   - 姫ちゃんのリボン → 我是小甜甜
   - 赤ずきんチャチャ → 小紅帽恰恰
   - 神風怪盗ジャンヌ → 神風怪盜貞德
   - 隣の怪物くん → 我的野蠻室友
   查不到官方譯名時用意譯，也不要留日文原文。
   - ワンピース → 航海王（不是「海賊王」）
   - 鬼滅の刃 → 鬼滅之刃
   - ポケモン → 寶可夢（不是「神奇寶貝」）
   - 星のカービィ → 星之卡比
   - ちいかわ → 吉伊卡哇
   - ホッキョクグマ → 北極熊
   - 角色名一律用台灣官方譯名（炭治郎、魯夫、皮卡丘…）
   - 款式名如果是「作品名 + 角色名」的組合，兩段都要翻
2. 商品名要像台灣電商的商品名，不要保留日文、不要保留廠商的貨號與裝箱資訊
   （例如「@30x5」「040」這種）。
3. 款式（variants）就是這個扭蛋／盒玩／一番賞裡玩家會抽到的東西。
   一番賞用「A賞」「B賞」「最後賞」當 level；扭蛋與盒玩沒有賞等，
   level 一律填空字串。
4. 只寫頁面文字裡真的有的資訊。**不要編造款式名稱**。
   讀不出款式就回空陣列，但如果頁面有寫「全4種」之類的字樣，
   variant_count 要填 4。variants 的數量若少於 variant_count，
   代表頁面只列出了一部分，這是可以的 —— 不要為了湊數自己編。
5. product_type 依頁面內容判斷是哪一種：
   ichiban（一番賞／一番くじ）、gacha（扭蛋／ガシャポン／ガチャ／カプセルトイ）、
   blindbox（盒玩／食玩／ブラインドボックス）、card（卡牌／トレカ）。
   判斷不出來就填 null。
6. 只回 JSON，不要任何說明文字。`

const SCHEMA = `{
  "name": "商品名稱（台灣譯名）或 null",
  "distributor": "代理商／製造商，例如 BANDAI、TAKARA TOMY A.R.T.S，或 null",
  "jp_price_yen": 日幣定價數字或 null,
  "product_type": "ichiban / gacha / blindbox / card 其中之一，或 null",
  "variant_count": 款式總數數字或 null,
  "variants": [{ "name": "款式名稱（台灣譯名）", "level": "賞等或空字串" }],
  "confidence": "high 或 low"
}`

const TRANSLATE_SYSTEM = `你是台灣潮玩電商的商品建檔助理。使用者會給你一個日本轉蛋商品的**官方**日文品名與官方款式名，你只做一件事：翻成台灣賣場會用的繁體中文。

規則：
1. 這是翻譯，不是創作。**款式不可以增加、刪除、合併或重新排序** ——
   給你幾款就回幾款，第 N 款對第 N 款。這點違反的話整筆資料就廢了。
2. 作品名與角色名一律用台灣官方譯名，例如：
   - クレヨンしんちゃん → 蠟筆小新（しんちゃん→小新、シロ→小白、
     ひまわり→小葵、ぶりぶりざえもん→不理不理左衛門、ワニ山さん→鱷魚山先生）
   - ちいかわ → 吉伊卡哇（ハチワレ→小八、うさぎ→兔兔、ちいかわ→吉伊）
   - ワンピース → 航海王（不是「海賊王」）｜ポケモン → 寶可夢（不是「神奇寶貝」）
   - 鬼滅の刃 → 鬼滅之刃｜星のカービィ → 星之卡比
3. **輸出的任何欄位都不可以殘留日文假名。** 查不到官方譯名就意譯。
4. 款式名尾巴的 A／B／C 是同一個角色的不同版本，要保留（しんちゃんA → 小新A）。
5. 商品名不要保留廠商貨號與裝箱資訊（「@30x5」「040」這種）。
6. 只回 JSON，不要任何說明文字。`

const TRANSLATE_SCHEMA = `{ "name": "商品名稱（台灣用語）", "variants": ["款式1", "款式2", ...] }`

/**
 * 把官方日文名稱翻成台灣用語。
 *
 * 跟 enrichProduct 的差別是「有沒有原始資料」：這條路的品名與款式都已經
 * 從官方站拿到手，AI 只負責換句話說，不必從網頁文字裡挖東西 ——
 * 幻覺的空間小得多。實測補錯的那幾筆（款式漏一半、圖片全是外盒照）
 * 都是因為走了另一條「讀網頁猜資料」的路。
 */
async function translateToTW(
  name: string,
  variantNames: string[],
): Promise<{ name: string | null; variants: string[] } | null> {
  const client = createClaude('product-translate')
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: TRANSLATE_SYSTEM,
      messages: [{
        role: 'user',
        content:
          `官方商品名：${name}\n` +
          (variantNames.length
            ? `官方款式（共 ${variantNames.length} 款，要原數原序回來）：\n` +
              variantNames.map((v, i) => `${i + 1}. ${v}`).join('\n')
            : '（這個商品沒有款式清單）') +
          `\n\n請依這個格式回覆：\n${TRANSLATE_SCHEMA}`,
      }],
    })
    const text = res.content.map(c => (c.type === 'text' ? c.text : '')).join('')
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const variants = Array.isArray(json.variants) ? json.variants.map((v: unknown) => String(v ?? '').trim()) : []
    // 數量對不上代表 AI 自己加減了款式，整份翻譯就不能用 —— 寧可留日文原名，
    // 也不能讓第 3 款配到第 5 款的照片
    if (variants.length !== variantNames.length) return { name: json.name ?? null, variants: [] }
    return { name: typeof json.name === 'string' ? json.name.trim() : null, variants }
  } catch {
    return null
  }
}

/**
 * 廠商填的名稱要不要換掉。
 *
 * 預設**不換**。廠商的進貨單多半已經是台灣賣場在用的名字，
 * 讓 AI 再翻一次只會越翻越糟 —— 實測「蠟筆小新貼臉公仔交易圖鑑」
 * 被翻成「歡樂卡通貼臉公仔」，IP 名整個不見；
 * 「CAPSURIUM 吉伊卡哇場景扭蛋」被音譯成「膠囊利姆」。
 *
 * 只有兩種情況該換：名稱裡還有日文假名，或根本不是名字（貨號、純英數）。
 */
function shouldReplaceName(vendorName: string): boolean {
  if (!vendorName) return true
  if (/[\u3040-\u30ff]/.test(vendorName)) return true
  return (vendorName.match(/[\u4e00-\u9fff]/g) ?? []).length < 2
}

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
      productType: ['ichiban', 'gacha', 'blindbox', 'card'].includes(d.product_type) ? d.product_type : null,
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

  /*
   * ── 先問官方站 ──
   *
   * BANDAI 轉蛋可以用條碼直接查到官方商品頁，那裡的品名、定價、款式名
   * 與「每一款的原廠照片」都是現成的結構化資料，不必讓 AI 去讀網頁猜。
   * 查得到就走這條，AI 只負責翻譯；查不到（盒玩、一番賞、別家廠牌）
   * 才退回下面那條搜尋 + 抽取的路。
   */
  const official = barcode ? await lookupGashaponByJan(barcode) : null

  if (official) {
    const tw = await translateToTW(official.name, official.variants.map(v => v.name))

    if (shouldReplaceName(rawName) && tw?.name) {
      filled.push({ key: 'name', label: '商品名稱', value: tw.name, source: '官方站 + 台灣譯名' })
      next.name = tw.name
    }

    // 出現在轉蛋官方站上就是轉蛋。廠商的清單常常沒有類型欄，這是問得到的最硬的證據
    if (next.type !== 'gacha') {
      filled.push({ key: 'type', label: '商品類別', value: '轉蛋', source: '官方站' })
      next.type = 'gacha'
    }
    if (official.priceYen && !next.jp_price_yen) {
      next.jp_price_yen = official.priceYen
      filled.push({ key: 'jp_price_yen', label: '日幣定價', value: official.priceYen, source: '官方站' })
    }
    // 只先記下網址，下面的圖片段落會把它抓進自己的圖庫，也由那裡記帳
    if (official.mainImage && !next.image_url) next.image_url = official.mainImage

    // 廠商給了品項就以廠商的為準，那是他實際會出貨的內容
    if (!nextPrizes.length && official.variants.length) {
      const names = tw?.variants.length === official.variants.length ? tw.variants : null
      const n = official.variants.length
      const total = Number(next.total_count) || 0
      const base = total > 0 ? Math.floor(total / n) : 1
      const remainder = total > 0 ? total % n : 0

      nextPrizes = official.variants.map((v, i) => {
        const qty = Math.max(1, base + (i < remainder ? 1 : 0))
        return {
          level: '',
          // 翻譯的款數對不上就留官方原名 —— 名字是日文總比配錯款好
          name: names ? names[i] : v.name,
          total: qty,
          remaining: qty,
          // 官方站每一款都附了自己的照片，一對一，不用去搜圖
          image_url: v.image,
          probability: 0,
          recycle_value: 0,
          sale_price: 0,
        }
      })

      const sum = nextPrizes.reduce((a, z) => a + Number(z.total), 0)
      if (sum !== Number(next.total_count)) {
        next.total_count = sum
        next.remaining = sum
      }
      for (const z of nextPrizes) z.probability = Number((Number(z.total) / sum).toFixed(6))

      // 官方寫「全6種」但輪播只放了 4 張時要講出來，不然看起來像補齊完成
      const short = official.variantCount && official.variantCount > n
        ? `，官方寫全 ${official.variantCount} 種，這頁只列出 ${n} 款`
        : ''
      filled.push({
        key: 'prizes', label: '款式',
        value: `${n} 款${total > 0 ? `，每款約 ${base} 個` : ''}${short}`,
        source: names ? '官方站 + 台灣譯名' : '官方站（原文）',
      })
    }
  }

  // ── 查資料（官方站查無時的後路）──
  const info = official ? null : await enrichProduct(rawName, barcode, type)

  if (info) {
    if (info.name && info.name !== rawName && shouldReplaceName(rawName)) {
      filled.push({ key: 'name', label: '商品名稱', value: info.name, source: '商品頁 + 台灣譯名' })
      next.name = info.name
    }
    if (info.distributor && !next.distributor) {
      next.distributor = info.distributor
      filled.push({ key: 'distributor', label: '代理商', value: info.distributor, source: '商品頁' })
    }
    // 廠商的清單常常沒有類型欄，解析時只能先預設成一番賞。
    // 商品頁看得出是扭蛋還是一番賞，這裡順手修正 —— 類型錯了賞等與籤號都會錯
    if (info.productType && info.productType !== next.type) {
      const label = { ichiban: '一番賞', gacha: '轉蛋', blindbox: '盒玩', card: '抽卡' }[info.productType]
      filled.push({ key: 'type', label: '商品類別', value: label, source: '商品頁判斷' })
      next.type = info.productType
    }
    if (info.jpPriceYen && !next.jp_price_yen) {
      next.jp_price_yen = info.jpPriceYen
      filled.push({ key: 'jp_price_yen', label: '日幣定價', value: info.jpPriceYen, source: '商品頁' })
    }

    // 廠商沒給品項時才用查到的款式。廠商給了就以廠商的為準 ——
    // 那是他實際會出貨的內容，比網路上查到的可信
    if (!nextPrizes.length && info.variants.length) {
      /*
       * 數量怎麼分。
       *
       * 廠商的進貨單只給一個總數（例如「備貨數量 300」），不會逐款列數量。
       * 查回來的款式各給 1 的話，總籤數會變成 3，跟實際進的 300 個對不起來 ——
       * 前台會顯示「剩 3 個」然後三抽就完抽。
       *
       * 所以有總數就平分，除不盡的餘數往前面幾款加一（300÷3=100、
       * 301÷3=101/100/100），總和必定等於總數。沒給總數才退回一款一個。
       */
      const n = info.variants.length
      const total = Number(next.total_count) || 0
      const base = total > 0 ? Math.floor(total / n) : 1
      const remainder = total > 0 ? total % n : 0

      nextPrizes = info.variants.map((v, i) => {
        const qty = Math.max(1, base + (i < remainder ? 1 : 0))
        return {
          level: v.level || '未分類',
          name: v.name,
          total: qty,
          remaining: qty,
          image_url: null,
          probability: 0,
          recycle_value: 0,
          sale_price: 0,
        }
      })

      // 總籤數以實際分配的總和為準。沒給總數時它就是款式數
      const sum = nextPrizes.reduce((a, p) => a + Number(p.total), 0)
      if (sum !== Number(next.total_count)) {
        next.total_count = sum
        next.remaining = sum
      }

      // 機率制（轉蛋／盒玩）沒有籤號，機率要照數量比例重算
      if (['gacha', 'blindbox'].includes(String(next.type)) && sum > 0) {
        for (const p of nextPrizes) {
          p.probability = Number((Number(p.total) / sum).toFixed(6))
        }
      }

      filled.push({
        key: 'prizes', label: '款式',
        value: total > 0 ? `${n} 款，每款約 ${base} 個` : `${n} 款`,
        source: `商品頁 + 台灣譯名（${info.confidence === 'high' ? '可信' : '僅供參考'}）`,
      })
    }
  }

  // ── 商品主圖 ──
  // 廠商填的可能是檔名（對回圖庫）或網址（抓下來存進圖庫）。
  // 兩種都先試，對不上才去搜圖 —— 廠商給的圖一定比搜到的準
  // 廠商原本填了什麼。上面官方站那段可能已經把 image_url 塞成官方圖，
  // 所以要在這裡分清楚最後那張到底是誰給的，記錄才不會騙人
  const vendorGaveImage = Boolean(product.image_url)
  if (next.image_url) {
    const resolved = await resolveVendorImage(String(next.image_url))
    if (resolved) {
      if (resolved !== next.image_url) {
        filled.push({
          key: 'image_url', label: '商品主圖', value: resolved,
          source: vendorGaveImage ? '廠商提供' : '官方站',
        })
        next.image_url = resolved
      }
    } else {
      // 檔名在圖庫裡找不到、或網址抓不下來。留著會變成前台破圖，先清掉改去搜
      next.image_url = null
    }
  }
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
  const officialPrizeImages = Boolean(official?.variants.length) && !prizes.length
  let prizeImgCount = 0
  let searchedImgCount = 0
  for (let i = 0; i < nextPrizes.length; i++) {
    if (nextPrizes[i].image_url) {
      const resolved = await resolveVendorImage(String(nextPrizes[i].image_url))
      nextPrizes[i].image_url = resolved
      if (resolved) { prizeImgCount++; continue }
    }
    const pname = String(nextPrizes[i].name ?? '').trim()
    if (!pname) continue
    /*
     * 拿款式名去圖片搜尋，實測整排配到的都是同一張外盒照 ——
     * 「果凍」「採集」這種字單獨搜根本搜不到那顆公仔。
     * 所以只有官方站查無、又真的沒圖時才走這條，而且它本來就不準。
     */
    const img = await findImage({ key: `z${i}`, query: `${productName} ${pname}` })
    if (img.url) { nextPrizes[i].image_url = img.url; prizeImgCount++; searchedImgCount++ }
  }
  if (prizeImgCount) {
    filled.push({
      key: 'prize_images', label: '款式圖', value: `${prizeImgCount} 張`,
      source: officialPrizeImages && !searchedImgCount ? '官方站'
        : searchedImgCount === prizeImgCount ? '搜尋'
        : `官方站 ${prizeImgCount - searchedImgCount} 張、搜尋 ${searchedImgCount} 張`,
    })
  }

  return { product: next, prizes: nextPrizes, filled }
}
