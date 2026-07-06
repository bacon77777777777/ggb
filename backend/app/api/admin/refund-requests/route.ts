import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('refund_requests')
    .select(`
      *,
      user:users(id, name, email, tokens),
      recharge:recharge_records(id, order_number, amount, status)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// 管理員代建退款申請
export async function POST(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { userId, rechargeId, amountTwd, tokensToClaim, reason } = body
  if (!userId || !amountTwd || !reason) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('refund_requests').insert({
    user_id:          userId,
    recharge_id:      rechargeId ?? null,
    amount_twd:       amountTwd,
    tokens_to_deduct: tokensToClaim ?? 0,
    reason,
    status:           'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
