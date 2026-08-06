import { NextResponse } from 'next/server'
import { runEnrichBatch } from '@/lib/importEnrichRunner'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 背景補齊
 *
 * pg_cron 每分鐘打一次。沒有待處理的列時會立刻回 processed:0，
 * 所以空跑的成本可以忽略。
 *
 * 這只是後備 —— 開著補齊結果那一頁時，前端會自己推進（見 [id]/run）。
 * 只靠 cron 的話本機與 STG 永遠不會動，那兩個環境沒有 pg_cron。
 */
const CRON_SECRET = process.env.CRON_SECRET ?? ''

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const r = await runEnrichBatch()
    return NextResponse.json({ ok: true, ...r })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '失敗' }, { status: 500 })
  }
}
