import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

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
  let lastErr: any = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init)
      lastRes = res
      if (res.ok) return res
      if (!retryable.has(res.status) || attempt === retries) return res

      const retryAfterMs = parseRetryAfterMs(res)
      const jitter = Math.floor(Math.random() * 250)
      const exp = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      await sleep((retryAfterMs ?? exp) + jitter)
    } catch (e: any) {
      lastErr = e
      if (attempt === retries) break
      const jitter = Math.floor(Math.random() * 250)
      const exp = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      await sleep(exp + jitter)
    }
  }
  if (lastRes) return lastRes
  throw lastErr ?? new Error('fetch failed')
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

const toNumber = (v: any): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(String(v).replace(/[, ]/g, '').trim())
  return Number.isFinite(n) ? n : null
}

const absolutize = (base: URL, pathOrUrl: string) => {
  const s = String(pathOrUrl ?? '').trim()
  if (!s) return null
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  if (s.startsWith('//')) return `${base.protocol}${s}`
  if (s.startsWith('/')) return `${base.origin}${s}`
  return `${base.origin}/${s}`
}

const NON_PRODUCT_PATH_SEGMENTS = new Set([
  'login', 'logout', 'register', 'signup', 'sign-up', 'account', 'profile',
  'cart', 'checkout', 'payment', 'order', 'orders', 'wishlist', 'favorites', 'favourite',
  'about', 'contact', 'faq', 'help', 'support', 'terms', 'privacy', 'policy', 'legal',
  'search', 'sitemap', 'feed', 'rss', 'robots',
  'cdn-cgi', 'assets', 'static', 'images', 'img', 'css', 'js', 'fonts', 'media',
  'api', 'auth', 'oauth', 'callback', 'webhook',
  'admin', 'dashboard', 'settings',
  'top', 'home', 'index',
])

const extractGenericProductLinks = (html: string, base: URL, limit: number) => {
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi
  const sameOriginLinks: string[] = []
  let m: RegExpExecArray | null

  while ((m = hrefRe.exec(html))) {
    const href = m[1].trim()
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue

    const abs = absolutize(base, href)
    if (!abs) continue

    let u: URL
    try {
      u = new URL(abs)
    } catch {
      continue
    }

    if (u.origin !== base.origin) continue

    const path = u.pathname
    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|ico|woff|ttf)(\?|$)/i.test(path)) continue

    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) continue

    const first = segments[0].toLowerCase()
    if (NON_PRODUCT_PATH_SEGMENTS.has(first) && segments.length <= 2) continue

    sameOriginLinks.push(u.origin + u.pathname)
  }

  if (sameOriginLinks.length === 0) return []

  // Group links by their first path segment (e.g., /products/, /items/)
  const patternLinks = new Map<string, Set<string>>()
  for (const link of sameOriginLinks) {
    try {
      const segs = new URL(link).pathname.split('/').filter(Boolean)
      if (segs.length < 2) continue
      const pattern = `/${segs[0]}/`
      if (!patternLinks.has(pattern)) patternLinks.set(pattern, new Set())
      patternLinks.get(pattern)!.add(link)
    } catch {
      continue
    }
  }

  // Find patterns with enough distinct product-looking links
  const ranked = [...patternLinks.entries()]
    .filter(([, links]) => links.size >= 3)
    .sort((a, b) => b[1].size - a[1].size)

  if (ranked.length === 0) {
    // No dominant pattern, return all unique links up to limit
    return [...new Set(sameOriginLinks)].slice(0, limit)
  }

  // Collect from top patterns
  const results: string[] = []
  for (const [, links] of ranked.slice(0, 3)) {
    for (const link of links) {
      if (!results.includes(link)) results.push(link)
      if (results.length >= limit) return results
    }
  }
  return results
}

const extractCloveUrlsFromHtml = (html: string, base: URL) => {
  const out = new Set<string>()
  const ids = new Set<string>()

  // Match both /zh-TW/oripa/All/[id] and /oripa/All/[id] (no lang prefix)
  const pathRe = /\/(?:zh-TW\/)?oripa\/All\/([a-z0-9]+)/gi
  let m: RegExpExecArray | null
  while ((m = pathRe.exec(html))) {
    const abs = absolutize(base, `/zh-TW/oripa/All/${m[1]}`)
    if (abs) out.add(abs)
  }

  // cmm-prefixed product IDs
  const idRe = /\b(cmm[a-z0-9]+)/gi
  while ((m = idRe.exec(html))) {
    ids.add(m[1])
  }

  for (const id of Array.from(ids)) {
    const abs = absolutize(base, `/zh-TW/oripa/All/${id}`)
    if (abs) out.add(abs)
  }
  return Array.from(out)
}

const fetchCloveListingHtml = async (inputUrl: URL) => {
  // If user entered the bare homepage or /oripa/All (no lang prefix), fetch the zh-TW listing page directly
  const isRootOrShort = inputUrl.pathname === '/' || !inputUrl.pathname.includes('/oripa/All/')
  const fetchUrl = isRootOrShort
    ? `https://oripa.clove.jp/zh-TW/oripa/All`
    : inputUrl.toString()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetchWithRetry(fetchUrl, {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    return await readTextWithLimit(res, 2_000_000)
  } finally {
    clearTimeout(timer)
  }
}

const fetchSlimeToyToken = async () => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
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
    const jsUrl = homeHtml.match(/https:\/\/slimetoy\.com\.tw\/build\/(?:js|assets)\/app-[A-Za-z0-9_-]+\.js/i)?.[0] || null
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
    return token
  } finally {
    clearTimeout(timer)
  }
}

const tryExtractList = (payload: any): any[] => {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.data)) return payload.data
  if (payload.data && Array.isArray(payload.data.data)) return payload.data.data
  if (payload.data && Array.isArray(payload.data.products)) return payload.data.products
  if (Array.isArray(payload.products)) return payload.products
  if (payload.data && Array.isArray(payload.data.items)) return payload.data.items
  return []
}

const fetchJsonWithLimit = async (url: string, headers: Record<string, string>, timeoutMs: number) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchWithRetry(url, { method: 'GET', headers, redirect: 'follow', signal: controller.signal }, { retries: 2 })
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    const text = await readTextWithLimit(res, 2_000_000)
    const parsed = JSON.parse(text)
    return parsed
  } finally {
    clearTimeout(timer)
  }
}

const expandSlimeToyHome = async (limit: number) => {
  const token = await fetchSlimeToyToken()
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }

  const per = Math.max(20, Math.min(200, limit))
  const urls: string[] = []
  const seen = new Set<number>()

  const endpoints = [
    (page: number) => `https://slimetoy.com.tw/api/products?page=${page}&per_page=${per}`,
    (page: number) => `https://slimetoy.com.tw/api/products?page=${page}&limit=${per}`,
    (page: number) => `https://slimetoy.com.tw/api/products?page=${page}`,
  ]

  for (const makeUrl of endpoints) {
    urls.length = 0
    seen.clear()
    try {
      for (let page = 1; page <= 50; page++) {
        const payload = await fetchJsonWithLimit(makeUrl(page), headers, 12_000)
        const list = tryExtractList(payload)
        if (list.length === 0) break

        for (const it of list) {
          const id = toNumber(it?.id)
          if (id === null) continue
          if (seen.has(id)) continue
          seen.add(id)
          const t = toNumber(it?.type ?? it?.type_id ?? it?.product_type) ?? 0
          const path = t === 0 ? `ichiban/detail/${id}` : t === 1 ? `blindbox/detail/${id}` : t === 2 ? `gacha/detail/${id}` : `ichiban/detail/${id}`
          urls.push(`https://slimetoy.com.tw/${path}`)
          if (urls.length >= limit) return urls
        }
      }
      if (urls.length > 0) return urls
    } catch {
      continue
    }
  }

  urls.length = 0
  seen.clear()
  try {
    const step = Math.max(20, Math.min(200, limit))
    for (let offset = 0; offset <= 20000; offset += step) {
      const payload = await fetchJsonWithLimit(`https://slimetoy.com.tw/api/products?offset=${offset}&limit=${step}`, headers, 12_000)
      const list = tryExtractList(payload)
      if (list.length === 0) break
      for (const it of list) {
        const id = toNumber(it?.id)
        if (id === null) continue
        if (seen.has(id)) continue
        seen.add(id)
        const t = toNumber(it?.type ?? it?.type_id ?? it?.product_type) ?? 0
        const path = t === 0 ? `ichiban/detail/${id}` : t === 1 ? `blindbox/detail/${id}` : t === 2 ? `gacha/detail/${id}` : `ichiban/detail/${id}`
        urls.push(`https://slimetoy.com.tw/${path}`)
        if (urls.length >= limit) return urls
      }
    }
    if (urls.length > 0) return urls
  } catch {
    return []
  }

  return []
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const url = String(body?.url ?? '').trim()
    const limit = Number(body?.limit ?? 300)
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

    const host = u.hostname.toLowerCase()
    const effectiveLimit = Number.isFinite(limit) ? Math.max(1, Math.min(5000, limit)) : 300
    let all: string[] = []
    if (host === 'slimetoy.com.tw') {
      all = await expandSlimeToyHome(effectiveLimit)
    } else if (host === 'oripa.clove.jp') {
      const html = await fetchCloveListingHtml(u)
      all = extractCloveUrlsFromHtml(html, u)
    } else {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15_000)
      let html = ''
      try {
        const res = await fetchWithRetry(u.toString(), {
          method: 'GET',
          headers: {
            'user-agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          redirect: 'follow',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
        html = await readTextWithLimit(res, 2_000_000)
      } finally {
        clearTimeout(timer)
      }
      all = extractGenericProductLinks(html, u, effectiveLimit)
    }
    const urls = all.slice(0, effectiveLimit)

    if (urls.length === 0) {
      return NextResponse.json({ error: '找不到可用的商品連結（可能是頁面需要載入更多或結構已更新）' }, { status: 400 })
    }

    return NextResponse.json({ data: { urls, totalFound: all.length, host } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '解析失敗' }, { status: 500 })
  }
}
