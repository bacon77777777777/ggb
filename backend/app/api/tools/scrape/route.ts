import { NextResponse } from 'next/server'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'

type Prize = {
  name: string
  level: string
  quantity: number
  image?: string | null
  imageFilename?: string | null
}

type ScrapeResult = {
  name: string
  imageUrl: string | null
  imageFilename: string | null
  price: number | null
  sourceHost: string | null
  typeGuess: 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom'
  prizes: Prize[]
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const parseRetryAfterMs = (res: Response) => {
  const raw = (res.headers.get('retry-after') || '').trim()
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000)
  const dateMs = Date.parse(raw)
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now()
    if (diff > 0) return Math.min(diff, 30_000)
  }
  return null
}

const fetchWithRetry = async (
  input: RequestInfo | URL,
  init: RequestInit,
  opts?: { retries?: number; baseDelayMs?: number; maxDelayMs?: number }
) => {
  const retries = opts?.retries ?? 3
  const baseDelayMs = opts?.baseDelayMs ?? 500
  const maxDelayMs = opts?.maxDelayMs ?? 8_000
  const retryable = new Set([429, 502, 503, 504])

  let lastRes: Response | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(input, init)
    lastRes = res
    if (res.ok) return res
    if (!retryable.has(res.status) || attempt === retries) return res

    const retryAfterMs = parseRetryAfterMs(res)
    const jitter = Math.floor(Math.random() * 250)
    const exp = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
    await sleep((retryAfterMs ?? exp) + jitter)
  }
  return lastRes as Response
}

const isPrivateIp = (host: string) => {
  const h = host.trim().toLowerCase()
  if (h === 'localhost' || h.endsWith('.local')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split('.').map(n => Number(n))
    if (parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true
    const [a, b] = parts
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }
  return false
}

const decodeHtmlEntities = (s: string) => {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

const stripHtmlToText = (html: string) => {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = withoutScripts.replace(/<[^>]+>/g, ' ')
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim()
}

const tryParseJson = (raw: string) => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const extractJsonLdBlocks = (html: string): any[] => {
  const blocks: any[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const parsed = tryParseJson(m[1].trim())
    if (parsed) blocks.push(parsed)
  }
  return blocks
}

const findProductInJsonLd = (jsonLd: any[]): { name?: string; image?: string | string[]; price?: any } | null => {
  const queue: any[] = [...jsonLd]
  while (queue.length > 0) {
    const cur = queue.shift()
    if (!cur) continue
    if (Array.isArray(cur)) {
      queue.push(...cur)
      continue
    }
    if (typeof cur !== 'object') continue
    const t = cur['@type']
    if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) {
      const offers = cur.offers
      const offer = Array.isArray(offers) ? offers[0] : offers
      return {
        name: cur.name,
        image: cur.image,
        price: offer?.price ?? offer?.lowPrice ?? offer?.highPrice,
      }
    }
    for (const v of Object.values(cur)) queue.push(v)
  }
  return null
}

const extractMeta = (html: string, attr: 'property' | 'name', key: string) => {
  const re = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i')
  const m = html.match(re)
  return m?.[1]?.trim() || null
}

const extractNextData = (html: string) => {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!m) return null
  return tryParseJson(m[1].trim())
}

const normalizeType = (raw: string) => {
  const s = raw.trim().toLowerCase()
  if (s.includes('一番賞') || s.includes('ichiban')) return 'ichiban'
  if (s.includes('盲盒') || s.includes('盒玩') || s.includes('blindbox')) return 'blindbox'
  if (s.includes('轉蛋') || s.includes('gacha')) return 'gacha'
  if (s.includes('抽卡') || s.includes('card')) return 'card'
  return 'custom'
}

const guessTypeFromNameOrUrl = (name: string, url: string) => {
  const combined = `${name} ${url}`
  return normalizeType(combined)
}

const toNumber = (v: any): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(String(v).replace(/[, ]/g, '').trim())
  return Number.isFinite(n) ? n : null
}

const roundToTens = (v: number) => {
  return Math.round(v / 10) * 10
}

const cloveJpyToTokenRate = () => {
  const raw = process.env.CLOVE_JPY_TO_TWD_RATE ?? process.env.CLOVE_JPY_TO_TOKEN_RATE ?? '0.22'
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0.22
}

const sanitizeFileStem = (s: string) => {
  return String(s ?? '')
    .trim()
    .replace(/\)+$/, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180)
}

const imageRefToWebpFilename = (raw: string | null | undefined) => {
  const val = String(raw ?? '').trim().replace(/\)+$/, '')
  if (!val) return null

  const isHttp = val.startsWith('http://') || val.startsWith('https://')
  const base = (() => {
    if (!isHttp) {
      const b = val.split('?')[0].split('#')[0]
      const parts = b.split('/')
      return parts[parts.length - 1] || ''
    }
    try {
      const u = new URL(val)
      const parts = u.pathname.split('/')
      return parts[parts.length - 1] || ''
    } catch {
      const b = val.split('?')[0].split('#')[0]
      const parts = b.split('/')
      return parts[parts.length - 1] || ''
    }
  })()

  const dot = base.lastIndexOf('.')
  const stem = sanitizeFileStem(dot > 0 ? base.slice(0, dot) : base)
  if (val.toLowerCase().endsWith('.webp') && !isHttp) return `${stem}.webp`

  if (!isHttp) return stem ? `${stem}.webp` : null

  const hash6 = crypto.createHash('sha1').update(val).digest('hex').slice(0, 6)
  const safeStem = stem || crypto.createHash('sha1').update(val).digest('hex').slice(0, 12)
  return `${safeStem}_${hash6}.webp`
}

const withImageFilenames = (prizes: Prize[]) => {
  return prizes.map(p => ({
    ...p,
    imageFilename: imageRefToWebpFilename(p.image),
  }))
}

const clovePrizeTypeToLevel = (raw: any) => {
  const s = String(raw ?? '').trim().toUpperCase()
  const order = [
    'FIRST',
    'SECOND',
    'THIRD',
    'FOURTH',
    'FIFTH',
    'SIXTH',
    'SEVENTH',
    'EIGHTH',
    'NINTH',
    'TENTH',
  ]
  const idx = order.indexOf(s)
  if (idx >= 0) return `${String.fromCharCode('A'.charCodeAt(0) + idx)}賞`
  if (s === 'LAST_ONE' || s === 'LASTONE' || s === 'LAST') return '最後賞'
  if (s === 'SP' || s === 'SPECIAL') return 'SP賞'
  if (s === 'HIDDEN') return '隱藏賞'
  return String(raw ?? '').trim()
}

const extractCloveDisplayedPrizes = (nextData: any): Prize[] => {
  const displayed = nextData?.props?.pageProps?.oripa?.displayedPrizes
  if (!Array.isArray(displayed)) return []
  const out: Prize[] = []
  for (const it of displayed) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue
    const qty = toNumber(it.quantity) ?? 0
    const name = String(it.mainDescriptionEn ?? it.mainDescription ?? it.main_description ?? it.name ?? '').trim()
    if (!name) continue
    const sub = String(it.subDescription ?? '').trim()
    const fullName = sub ? `${name} ${sub}` : name
    const level = clovePrizeTypeToLevel(it.prizeType)
    const image = String(it.imageUrl ?? it.image_url ?? it.image ?? '').trim() || null
    out.push({ name: fullName, level, quantity: qty, image })
  }
  const order = [
    'A賞',
    'B賞',
    'C賞',
    'D賞',
    'E賞',
    'F賞',
    'G賞',
    'H賞',
    'I賞',
    'J賞',
    '最後賞',
    'SP賞',
    '隱藏賞',
  ]
  const buckets = new Map<string, Prize[]>()
  for (const p of out) {
    const key = p.level || ''
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(p)
  }
  const keys = [...order, ...Array.from(buckets.keys()).filter(k => !order.includes(k))]
  const interleaved: Prize[] = []
  while (true) {
    let progressed = false
    for (const k of keys) {
      const list = buckets.get(k)
      if (!list || list.length === 0) continue
      interleaved.push(list.shift()!)
      progressed = true
    }
    if (!progressed) break
  }
  return interleaved
}

const normalizeClovePrizesForImport = (input: { prizes: Prize[]; nextData: any }) => {
  const total = toNumber(input?.nextData?.props?.pageProps?.oripa?.quantity)
  const base = dedupePrizes(input.prizes || [])
  const lastPrize = base.find(p => p.level === '最後賞') || null
  const withoutLast = lastPrize ? base.filter(p => p !== lastPrize) : base
  const mainBase = withoutLast.slice(0, lastPrize ? 18 : 19)
  const main = [...mainBase, ...(lastPrize ? [lastPrize] : [])].map(p => ({ ...p, quantity: 1 }))
  const used = main.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)
  const leftover = total === null ? 0 : Math.max(0, total - used)
  const randomPrize: Prize = {
    name: '隨機小物',
    level: '小賞',
    quantity: leftover,
    image: '01KK471XHY43DQBJ7MX0X3N5YP_fce470.webp',
  }
  return dedupePrizes([...main, randomPrize])
}

const deepCollectPrizeArrays = (root: any) => {
  const arrays: Array<{ path: string; items: any[]; score: number }> = []
  const visit = (node: any, path: string) => {
    if (!node) return
    if (Array.isArray(node)) {
      const score = scorePrizeArray(node, path)
      if (score > 0) arrays.push({ path, items: node, score })
      node.forEach((v, idx) => visit(v, `${path}[${idx}]`))
      return
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        visit(v, path ? `${path}.${k}` : k)
      }
    }
  }
  visit(root, '')
  return arrays.sort((a, b) => b.score - a.score)
}

const scorePrizeArray = (arr: any[], path: string) => {
  if (arr.length < 2) return 0
  const keyBoost = /prize|獎|award|kuji|lottery|item|reward|variant|spec|inventory/i.test(path) ? 8 : 0
  let objCount = 0
  let hasNameLike = 0
  let hasQtyLike = 0
  for (const it of arr.slice(0, 20)) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue
    objCount++
    const keys = Object.keys(it).join(' ')
    if (/name|title|label|item|prize|獎/i.test(keys)) hasNameLike++
    if (/qty|quantity|count|total|remaining|stock|num|amount|pieces|個|張/i.test(keys)) hasQtyLike++
  }
  if (objCount < 2) return 0
  return keyBoost + objCount + hasNameLike * 2 + hasQtyLike * 2
}

const extractPrizesFromCandidateArray = (arr: any[]) => {
  const prizes: Prize[] = []
  for (const it of arr) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue
    const name =
      String(
        it.name ??
          it.title ??
          it.label ??
          it.prize_name ??
          it.prizeName ??
          it.item_name ??
          it.itemName ??
          it.mainDescriptionEn ??
          it.mainDescription ??
          it.main_description ??
          it.description ??
          it.text ??
          ''
      ).trim()
    const levelRaw = String(it.level ?? it.rank ?? it.grade ?? it.prize_level ?? it.prizeLevel ?? it.tier ?? it.prizeType ?? it.prize_type ?? '').trim()
    const qty =
      toNumber(it.quantity ?? it.qty ?? it.count ?? it.total ?? it.stock ?? it.remaining ?? it.num ?? it.amount) ?? null
    const image = String(it.image ?? it.imageUrl ?? it.image_url ?? it.img ?? it.photo ?? '').trim()
    if (!name) continue
    if (qty === null) continue
    const level = clovePrizeTypeToLevel(levelRaw)
    prizes.push({
      name,
      level,
      quantity: qty,
      image: image || null,
    })
  }
  return prizes
}

const extractPrizesFromText = (text: string) => {
  const prizes: Prize[] = []
  const re = /(?:^|[\s、,，])((?:[A-J]|SP)\s*賞|最後賞|Last One|隱藏賞)[\s:：-]*([^\d]{1,60}?)[\sx×]*?(\d+(?:\.\d+)?)(?=\s|$|[、,，])/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const level = m[1].replace(/\s+/g, ' ').trim()
    const name = m[2].replace(/\s+/g, ' ').trim()
    const qty = toNumber(m[3]) ?? 0
    if (!name || qty <= 0) continue
    prizes.push({ name, level, quantity: qty })
    if (prizes.length >= 20) break
  }
  return prizes
}

const dedupePrizes = (prizes: Prize[]) => {
  const seen = new Set<string>()
  const out: Prize[] = []
  for (const p of prizes) {
    const key = `${p.level}::${p.name}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= 20) break
  }
  return out
}

const readTextWithLimit = async (res: Response, maxBytes: number) => {
  if (!res.body) return await res.text()
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let bytes = 0
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    bytes += value.byteLength
    if (bytes > maxBytes) throw new Error('Response too large')
    result += decoder.decode(value, { stream: true })
  }
  result += decoder.decode()
  return result
}

let slimeToyTokenCache: { token: string; fetchedAt: number } | null = null
let slimeToyTokenPromise: Promise<string> | null = null

const getSlimeToyMasterToken = async () => {
  if (slimeToyTokenCache && Date.now() - slimeToyTokenCache.fetchedAt < 60 * 60 * 1000) {
    return slimeToyTokenCache.token
  }
  if (slimeToyTokenPromise) return await slimeToyTokenPromise

  slimeToyTokenPromise = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const homeRes = await fetchWithRetry('https://slimetoy.com.tw/', {
        method: 'GET',
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: controller.signal,
      })
      if (!homeRes.ok) throw new Error(`Fetch failed: ${homeRes.status}`)
      const homeHtml = await readTextWithLimit(homeRes, 600_000)
      const jsUrl =
        homeHtml.match(/https:\/\/slimetoy\.com\.tw\/build\/js\/app-[A-Za-z0-9_-]+\.js/i)?.[0] || null
      if (!jsUrl) throw new Error('找不到 SlimeToy app.js')

      const jsRes = await fetchWithRetry(jsUrl, {
        method: 'GET',
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          accept: '*/*',
        },
        redirect: 'follow',
        signal: controller.signal,
      })
      if (!jsRes.ok) throw new Error(`Fetch failed: ${jsRes.status}`)
      const jsText = await readTextWithLimit(jsRes, 2_000_000)
      const token = jsText.match(/Authorization:"Bearer ([0-9a-f]{64})"/i)?.[1] || null
      if (!token) throw new Error('找不到 SlimeToy Token')

      slimeToyTokenCache = { token, fetchedAt: Date.now() }
      return token
    } finally {
      clearTimeout(timer)
      slimeToyTokenPromise = null
    }
  })()

  return await slimeToyTokenPromise
}

const fetchJsonWithLimit = async (res: Response, maxBytes: number) => {
  const text = await readTextWithLimit(res, maxBytes)
  const parsed = tryParseJson(text)
  if (!parsed) throw new Error('無法解析 JSON')
  return parsed
}

const slimeToyImageUrl = (raw: string | null | undefined) => {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  const path = s.replace(/^\/+/, '')
  return `https://img.slimetoy.com.tw/${path}`
}

const fetchSlimeToyJson = async (url: string, opts?: { timeoutMs?: number; maxBytes?: number }) => {
  const token = await getSlimeToyMasterToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 12_000)
  try {
    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!res.ok) {
      if (res.status === 429) throw new Error('對方網站限制請求頻率（429），請稍後重試')
      throw new Error(`Fetch failed: ${res.status}`)
    }
    return await fetchJsonWithLimit(res, opts?.maxBytes ?? 1_500_000)
  } finally {
    clearTimeout(timer)
  }
}

const rarityToLevel = (rarity: any, isLimited?: any) => {
  if (isLimited === true) return '限定'
  const r = String(rarity ?? '').trim().toLowerCase()
  const map: Record<string, string> = {
    common: '普通',
    rare: '稀有',
    uncommon: '稀有',
    ultra_rare: '超稀有',
    ultrarare: '超稀有',
    legendary: '傳說',
    secret: '隱藏',
  }
  return map[r] || (r ? r : '')
}

const scrapeSlimeToyByProductId = async (productId: string, kind?: string): Promise<ScrapeResult> => {
  const normalizedKind = String(kind ?? '').toLowerCase()

  if (normalizedKind.startsWith('gacha/')) {
    const payload = await fetchSlimeToyJson(`https://slimetoy.com.tw/api/gacha/product/${encodeURIComponent(productId)}`)
    const product = payload?.product ?? {}
    const items = Array.isArray(payload?.items) ? payload.items : []
    const name = String(product?.name ?? '').trim() || `slimetoy:${productId}`
    const price = toNumber(product?.discount_price ?? product?.price ?? product?.point_price)
    const imageUrl = slimeToyImageUrl(product?.image_url)
    const prizes: Prize[] = items
      .map((it: any) => {
        const itemName = String(it?.name ?? '').trim()
        if (!itemName) return null
        const qty = toNumber(it?.total_quantity ?? it?.quantity ?? it?.remaining_quantity) ?? 0
        if (qty <= 0) return null
        return {
          name: itemName,
          level: rarityToLevel(it?.rarity, it?.is_limited),
          quantity: qty,
          image: slimeToyImageUrl(it?.image_url),
        } satisfies Prize
      })
      .filter(Boolean)

    return {
      name,
      imageUrl,
      imageFilename: imageRefToWebpFilename(imageUrl),
      price,
      sourceHost: 'slimetoy.com.tw',
      typeGuess: 'gacha',
      prizes: withImageFilenames(dedupePrizes(prizes)),
    }
  }

  if (normalizedKind.startsWith('blindbox/')) {
    const payload = await fetchSlimeToyJson(
      `https://slimetoy.com.tw/api/blindbox/product/${encodeURIComponent(productId)}/packages?_t=${Date.now()}`
    )
    if (payload?.success === false) {
      throw new Error(String(payload?.message || '無法獲取商品資料'))
    }
    const data = payload?.data ?? {}
    const product = data?.product ?? {}
    const packages = Array.isArray(data?.packages) ? data.packages : []
    const firstPackage = packages[0] ?? null

    const name = String(product?.name ?? '').trim() || `slimetoy:${productId}`
    const price = toNumber(firstPackage?.single_draw_price ?? firstPackage?.package_price ?? product?.price)
    const imageUrl = slimeToyImageUrl(product?.inner_page_image_url ?? product?.image_url)

    let prizes: Prize[] = []
    if (firstPackage?.id) {
      const itemsPayload = await fetchSlimeToyJson(
        `https://slimetoy.com.tw/api/blindbox/package/${encodeURIComponent(String(firstPackage.id))}/items`,
        { maxBytes: 2_000_000 }
      )
      if (itemsPayload?.success === false) {
        throw new Error(String(itemsPayload?.message || '無法獲取獎項清單'))
      }
      const items = Array.isArray(itemsPayload?.data) ? itemsPayload.data : []
      prizes = items
        .map((it: any) => {
          const itemName = String(it?.name ?? '').trim()
          if (!itemName) return null
          const qty = toNumber(it?.quantity ?? it?.total_quantity ?? it?.remaining_quantity) ?? 0
          if (qty <= 0) return null
          return {
            name: itemName,
            level: it?.is_secret === true ? '隱藏' : rarityToLevel(it?.rarity),
            quantity: qty,
            image: slimeToyImageUrl(it?.image_url),
          } satisfies Prize
        })
        .filter(Boolean)
    }

    return {
      name,
      imageUrl,
      imageFilename: imageRefToWebpFilename(imageUrl),
      price,
      sourceHost: 'slimetoy.com.tw',
      typeGuess: 'blindbox',
      prizes: withImageFilenames(dedupePrizes(prizes)),
    }
  }

  const token = await getSlimeToyMasterToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetchWithRetry(`https://slimetoy.com.tw/api/products/${encodeURIComponent(productId)}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error('對方網站限制請求頻率（429），請稍後重試')
      }
      throw new Error(`Fetch failed: ${res.status}`)
    }

    const product = await fetchJsonWithLimit(res, 1_500_000)
    const name = String(product?.name ?? '').trim()
    const price = toNumber(product?.discount_price ?? product?.price)
    const imagePath = String(product?.image_url ?? '').replace(/^\/+/, '')
    const imageUrl = imagePath ? `https://img.slimetoy.com.tw/${imagePath}` : null
    const typeVal = Number(product?.type)
    const typeGuess: ScrapeResult['typeGuess'] =
      typeVal === 0 ? 'ichiban' : typeVal === 1 ? 'blindbox' : typeVal === 2 ? 'gacha' : 'custom'

    const prizes: Prize[] = Array.isArray(product?.prizes)
      ? product.prizes
          .map((p: any) => {
            const tierRaw = String(p?.tier ?? '').trim()
            const level = tierRaw
              ? /last/i.test(tierRaw) ? '最後賞' : /^[A-J]$/i.test(tierRaw) ? `${tierRaw.toUpperCase()}賞` : tierRaw
              : ''
            const prizeImagePath = String(p?.image_url ?? '').replace(/^\/+/, '')
            const prizeImage = prizeImagePath ? `https://img.slimetoy.com.tw/${prizeImagePath}` : null
            const qty = toNumber(p?.quantity) ?? 0
            const prizeName = String(p?.name ?? '').trim()
            if (!prizeName) return null
            if (!qty || qty <= 0) return null
            return {
              name: prizeName,
              level,
              quantity: qty,
              image: prizeImage,
            } satisfies Prize
          })
          .filter(Boolean)
      : []

    return {
      name: name || `slimetoy:${productId}`,
      imageUrl,
      imageFilename: imageRefToWebpFilename(imageUrl),
      price,
      sourceHost: 'slimetoy.com.tw',
      typeGuess,
      prizes: withImageFilenames(dedupePrizes(prizes)),
    }
  } finally {
    clearTimeout(timer)
  }
}

const extractPrizesWithAI = async (pageText: string, hint: { name?: string; url: string }): Promise<Prize[]> => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []

  const client = new Anthropic({ apiKey })
  const truncated = pageText.slice(0, 8000)

  const prompt = `你是商品資料擷取工具。從以下網頁文字中提取一番賞/轉蛋/盲盒商品的獎項清單。
商品網址: ${hint.url}
${hint.name ? `商品名稱: ${hint.name}` : ''}

網頁文字:
${truncated}

請以 JSON 格式回覆，僅包含以下結構，不要其他說明文字：
{
  "prizes": [
    { "name": "獎項名稱", "level": "賞等(如A賞/B賞)", "quantity": 數量 }
  ]
}
如果找不到獎項清單，prizes 為空陣列。等級格式範例：A賞、B賞、C賞、最後賞、SP賞、隱藏賞。`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content.find(b => b.type === 'text')?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []
    const parsed = tryParseJson(jsonMatch[0])
    if (!parsed?.prizes || !Array.isArray(parsed.prizes)) return []
    const prizes: Prize[] = parsed.prizes
      .map((p: any) => ({
        name: String(p.name ?? '').trim(),
        level: String(p.level ?? '').trim(),
        quantity: toNumber(p.quantity) ?? 1,
      }))
      .filter((p: Prize) => p.name && p.quantity > 0)
    return prizes.slice(0, 20)
  } catch {
    return []
  }
}

const scrapeUrl = async (url: string): Promise<ScrapeResult> => {
  let parsedUrl: URL | null = null
  try {
    parsedUrl = new URL(url)
  } catch {
    parsedUrl = null
  }

  if (parsedUrl) {
    const host = parsedUrl.hostname.toLowerCase()
    if (host === 'slimetoy.com.tw') {
      const m = parsedUrl.pathname.match(/^\/(ichiban\/(?:detail|tubes)|gacha\/detail|blindbox\/detail|blindbox\/item)\/(\d+)(?:\/|$)/i)
      if (m?.[2]) {
        return await scrapeSlimeToyByProductId(m[2], m[1])
      }
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status}`)
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (contentType.startsWith('image/')) {
      throw new Error('此網址看起來是圖片連結，請貼商品頁網址')
    }
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('此網址不是 HTML 網頁，請貼商品頁網址')
    }
    const html = await readTextWithLimit(res, 2_000_000)
    const jsonLd = extractJsonLdBlocks(html)
    const productLd = findProductInJsonLd(jsonLd)
    const ogTitle = extractMeta(html, 'property', 'og:title') || extractMeta(html, 'name', 'twitter:title')
    const ogImage = extractMeta(html, 'property', 'og:image')
    const ogPrice =
      extractMeta(html, 'property', 'product:price:amount') ||
      extractMeta(html, 'name', 'product:price:amount') ||
      extractMeta(html, 'name', 'price')

    const name = String(productLd?.name ?? ogTitle ?? '').trim()
    const imageRaw = productLd?.image
    const imageUrl = String(
      (Array.isArray(imageRaw) ? imageRaw[0] : imageRaw) ?? ogImage ?? ''
    ).trim() || null
    const price = toNumber(productLd?.price ?? ogPrice)

    const nextData = extractNextData(html)
    let prizes: Prize[] = nextData ? extractCloveDisplayedPrizes(nextData) : []

    if (prizes.length === 0) {
      const candidateArrays = nextData ? deepCollectPrizeArrays(nextData) : []
      for (const candidate of candidateArrays.slice(0, 8)) {
        const extracted = extractPrizesFromCandidateArray(candidate.items)
        if (extracted.length >= 2) {
          prizes = extracted
          break
        }
      }
    }

    const pageText = stripHtmlToText(html)

    if (prizes.length === 0) {
      prizes = extractPrizesFromText(pageText)
    }

    if (prizes.length === 0) {
      prizes = await extractPrizesWithAI(pageText, { name, url })
    }

    const sourceHost = parsedUrl?.hostname?.toLowerCase() || null

    if (sourceHost === 'oripa.clove.jp' && nextData) {
      prizes = normalizeClovePrizesForImport({ prizes, nextData })
    } else {
      prizes = dedupePrizes(prizes)
    }
    prizes = withImageFilenames(prizes)
    const typeGuess = sourceHost === 'oripa.clove.jp' ? 'card' : guessTypeFromNameOrUrl(name, url)
    const finalPrice = (() => {
      if (sourceHost !== 'oripa.clove.jp') return price
      const clovePrice = price ?? toNumber(nextData?.props?.pageProps?.oripa?.price)
      if (clovePrice === null) return null
      return roundToTens(clovePrice * cloveJpyToTokenRate())
    })()

    return {
      name: name || url,
      imageUrl,
      imageFilename: imageRefToWebpFilename(imageUrl),
      price: finalPrice,
      sourceHost,
      typeGuess,
      prizes,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const url = String(body?.url ?? '').trim()
    if (!url) return NextResponse.json({ error: '缺少 URL' }, { status: 400 })

    let u: URL
    try {
      u = new URL(url)
    } catch {
      return NextResponse.json({ error: 'URL 格式不正確' }, { status: 400 })
    }

    if (!['http:', 'https:'].includes(u.protocol)) {
      return NextResponse.json({ error: '僅支援 http/https URL' }, { status: 400 })
    }
    if (isPrivateIp(u.hostname)) {
      return NextResponse.json({ error: '不允許存取此網址' }, { status: 400 })
    }

    const result = await scrapeUrl(u.toString())
    return NextResponse.json({ data: result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '抓取失敗' }, { status: 500 })
  }
}
