import { NextRequest, NextResponse } from 'next/server'
import { runCardPriceUpdate } from '@/lib/cardPrices'

/**
 * 抽卡市價每日更新（老闆 2026-09-03）。pg_cron 每天台灣時間 04:00 打一次（UTC 20:00）。
 * 做什麼、怎麼算見 lib/cardPrices.ts。手動：npx tsx scripts/card_prices_run.ts
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120
/*
 * 跑在東京機房（老闆 2026-09-03 推正當天）：遊々亭擋美國機房的 IP —— Vercel 預設的
 * 華盛頓機房打過去一律 403，從台灣、日本的 IP 都是 200。同一站對 robots 沒有限制。
 */
export const preferredRegion = 'hnd1'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

async function handle(req: NextRequest) {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const summary = await runCardPriceUpdate()
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
export const POST = handle
export const GET = handle
