import { NextResponse } from 'next/server'

type SetRow = { id: string; name: string }

let cached: { ts: number; sets: SetRow[] } | null = null

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limitRaw = searchParams.get('limit')
  const limit = limitRaw ? Math.max(1, Math.min(50, Number(limitRaw) || 20)) : 20

  const now = Date.now()
  if (cached && now - cached.ts < 10 * 60 * 1000) {
    return NextResponse.json({ sets: cached.sets.slice(0, limit) }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }

  const res = await fetch('https://limitlesstcg.com/cards/jp', {
    cache: 'no-store',
    headers: { 'User-Agent': 'gachago-dev' },
  })
  if (!res.ok) {
    return NextResponse.json({ sets: [] }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }

  const html = await res.text()
  const re =
    /<a href="\/cards\/jp\/([A-Za-z0-9]+)"><img[^>]*>\s*([^<]+?)\s*<span class="code annotation">\1<\/span><\/a>/g
  const out: SetRow[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const id = String(m[1] || '').trim()
    const name = String(m[2] || '').trim().replace(/\s+/g, ' ')
    if (!id || !name) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, name })
    if (out.length >= 80) break
  }

  cached = { ts: now, sets: out }

  return NextResponse.json({ sets: out.slice(0, limit) }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}

