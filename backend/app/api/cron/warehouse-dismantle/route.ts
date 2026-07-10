import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { createLinePusher } from '@/lib/linePush'

const pushLine = createLinePusher('line_push_warehouse_dismantle')
const CRON_SECRET = process.env.CRON_SECRET ?? ''

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('auto_dismantle_expired_warehouse_items')
  if (error) {
    console.error('[warehouse-dismantle] RPC error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const row = Array.isArray(data) ? data[0] : data
  const dismantledCount = Number(row?.dismantled_count ?? 0)
  const totalTokens = Number(row?.total_tokens_refunded ?? 0)

  if (dismantledCount > 0) {
    await pushLine(
      `🗑️ 倉庫自動分解完成\n` +
      `共分解 ${dismantledCount} 件逾期品項\n` +
      `退還代幣：${totalTokens} G`
    ).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    dismantled: dismantledCount,
    tokensRefunded: totalTokens,
  })
}
