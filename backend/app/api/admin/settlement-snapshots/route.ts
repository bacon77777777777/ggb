import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const month  = searchParams.get('month')   // YYYY-MM
  const status = searchParams.get('status')

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('settlement_snapshots')
    .select('id, supplier_id, supplier_name, period_start, period_end, settlement_date, total_g, dismantle_total, ecpay_fee, supplier_net, status, confirmed_at, paid_at, note, created_at')
    .order('period_start', { ascending: false })
    .order('supplier_name', { ascending: true })

  if (month) query = query.eq('period_start', `${month}-01`)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
