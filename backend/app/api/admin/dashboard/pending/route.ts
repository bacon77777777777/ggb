import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getSupabaseAdmin()

    const [
      { count: pendingShipments },
      { count: lowInventory },
      { count: pendingRefunds },
      { count: pendingSettlements },
      { count: totalMembers },
      { count: pendingRechargeReview },
      { count: onlineCount },
    ] = await Promise.all([
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted'),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .gt('total_count', 0)
        .lte('remaining', 3)
        .neq('status', 'archived'),
      supabase
        .from('refund_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('settlement_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft'),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .or('is_bot.is.null,is_bot.eq.false'),
      supabase
        .from('recharge_records')
        .select('id', { count: 'exact', head: true })
        .eq('needs_review', true)
        .eq('status', 'pending'),
      supabase
        .from('visit_logs')
        .select('id, users!inner(is_bot)', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
        .or('is_bot.is.null,is_bot.eq.false', { referencedTable: 'users' }),
    ])

    return NextResponse.json({
      pendingShipments:     pendingShipments     ?? 0,
      lowInventory:         lowInventory         ?? 0,
      pendingRefunds:       pendingRefunds        ?? 0,
      pendingSettlements:   pendingSettlements    ?? 0,
      totalMembers:          totalMembers          ?? 0,
      onlineCount:           onlineCount           ?? 0,
      pendingRechargeReview: pendingRechargeReview ?? 0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
