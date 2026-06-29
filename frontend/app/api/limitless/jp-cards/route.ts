import { NextResponse } from 'next/server'

type CardRow = {
  id: string
  name: string
  image: string
  series: string
}

const titleCache = new Map<string, { ts: number; name: string }>()
const listCache = new Map<string, { ts: number; rows: Array<{ setId: string; number: string; image: string }> }>()

const extractTitleName = (html: string) => {
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || ''
  const cleaned = title.replace(/\s+–\s+Limitless\s*$/g, '').trim()
  const head = cleaned.split(' - ')[0]?.trim() || ''
  return head
}

const fetchCardName = async (setId: string, number: string) => {
  const key = `${setId}/${number}`
  const now = Date.now()
  const cached = titleCache.get(key)
  if (cached && now - cached.ts < 60 * 60 * 1000) return cached.name

  const fallback = `${setId} #${number}`
  try {
    const res = await fetch(`https://limitlesstcg.com/cards/jp/${setId}/${number}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1200),
      headers: { 'User-Agent': 'gachago-dev', Referer: `https://limitlesstcg.com/cards/jp/${setId}` },
    })
    if (!res.ok) {
      titleCache.set(key, { ts: now, name: fallback })
      return fallback
    }
    const html = await res.text()
    const name = extractTitleName(html) || fallback
    titleCache.set(key, { ts: now, name })
    return name
  } catch {
    titleCache.set(key, { ts: now, name: fallback })
    return fallback
  }
}

const fetchList = async (key: string, url: string, re: RegExp) => {
  const now = Date.now()
  const cached = listCache.get(key)
  if (cached && now - cached.ts < 10 * 60 * 1000) return cached.rows

  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'gachago-dev' },
  })
  if (!res.ok) return []
  const html = await res.text()
  const rows: Array<{ setId: string; number: string; image: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const setId = String(m[1] || '').trim()
    const number = String(m[2] || '').trim()
    const image = String(m[3] || '').trim()
    if (!setId || !number || !image) continue
    rows.push({ setId, number, image })
    if (rows.length >= 5000) break
  }
  listCache.set(key, { ts: now, rows })
  return rows
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const setParam = (searchParams.get('set') || '').trim()
  const qParam = (searchParams.get('q') || '').trim()
  const offset = Math.max(0, Number(searchParams.get('offset') || 0) || 0)
  const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || 20) || 20))

  const setFilter = setParam && setParam !== 'all' ? setParam : ''

  let list: Array<{ setId: string; number: string; image: string }> = []

  if (qParam) {
    const q = encodeURIComponent(qParam)
    const url = `https://limitlesstcg.com/cards/jp?q=${q}`
    const key = `q:${qParam}`
    const re = /<a href="\/cards\/jp\/([^\/]+)\/([^"]+)"><img[^>]*src="([^"]+)"/g
    list = await fetchList(key, url, re)
    if (setFilter) list = list.filter((x) => x.setId === setFilter)
  } else if (setFilter) {
    const url = `https://limitlesstcg.com/cards/jp/${encodeURIComponent(setFilter)}`
    const key = `set:${setFilter}`
    const re = new RegExp(`<a href="\\/cards\\/jp\\/(${setFilter})\\/([^"]+)"><img[^>]*src="([^"]+)"`, 'g')
    list = await fetchList(key, url, re)
  } else {
    return NextResponse.json(
      { total: 0, cards: [] as CardRow[] },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const total = list.length
  const slice = list.slice(offset, offset + limit)

  const cards: CardRow[] = await (async () => {
    const limitConcurrency = 8
    const tasks = slice.map((row) => async () => {
      const name = await fetchCardName(row.setId, row.number)
      return {
        id: `jp:${row.setId}:${row.number}`,
        name,
        image: row.image,
        series: row.setId,
      } satisfies CardRow
    })
    const results: CardRow[] = []
    let cursor = 0
    const workers = Array.from({ length: Math.min(limitConcurrency, tasks.length) }).map(async () => {
      while (cursor < tasks.length) {
        const i = cursor
        cursor += 1
        const res = await tasks[i]!()
        results[i] = res
      }
    })
    await Promise.all(workers)
    return results.filter(Boolean)
  })()

  return NextResponse.json({ total, cards }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
