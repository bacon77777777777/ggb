import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString()
  const now = new Date().toISOString()

  // Flag unreviewed pending records older than 30 min
  const { data: toFlag, error: fetchErr } = await supabase
    .from('recharge_records')
    .select('id')
    .eq('status', 'pending')
    .eq('needs_review', false)
    .like('order_number', 'TP%')
    .lt('created_at', thirtyMinAgo)
    .limit(100)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const ids = (toFlag ?? []).map(r => r.id)
  let newlyFlagged = 0

  if (ids.length > 0) {
    const { error: updateErr } = await supabase
      .from('recharge_records')
      .update({ needs_review: true, needs_review_at: now })
      .in('id', ids)
    if (!updateErr) newlyFlagged = ids.length
  }

  // Count total currently pending+needs_review
  const { count: totalPending } = await supabase
    .from('recharge_records')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('needs_review', true)

  if (newlyFlagged > 0) {
    await pushLine(
      `⚠️ 待複核儲值提醒\n\n新增 ${newlyFlagged} 筆 pending > 30 分鐘\n目前共 ${totalPending ?? 0} 筆待複核\n\n請至後台「待複核儲值」確認`
    )
  }

  return NextResponse.json({ newlyFlagged, totalPending: totalPending ?? 0 })
}
