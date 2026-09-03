import { NextRequest, NextResponse } from 'next/server'

/**
 * 探針（2026-09-03）：Vercel **邊緣**函式能不能抓遊々亭？
 * serverless 跑在美國機房被擋（403）、Hobby 不吃 preferredRegion；邊緣函式的出口在離請求者最近的
 * 節點（台灣打過來是東京 hnd1）。成的話抓價 route 改成 edge runtime，後台上架就能自動抓。
 */
export const runtime = 'edge'
const CRON_SECRET = process.env.CRON_SECRET ?? ''

export async function GET(req: NextRequest) {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const set = req.nextUrl.searchParams.get('set') || 'sv10'
  const res = await fetch(`https://yuyu-tei.jp/sell/poc/s/${set}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'ja' },
  })
  const text = await res.text()
  return NextResponse.json({ status: res.status, region: process.env.VERCEL_REGION ?? null, cards: (text.match(/card\.yuyu-tei\.jp\/poc\/100_140\//g) || []).length })
}
