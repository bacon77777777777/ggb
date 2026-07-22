import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')

  const supabase = getSupabaseAdmin()

  // refund_requests.user_id → auth.users（跨 schema），PostgREST 無法自動 join
  // 改成兩段查詢：先取退款申請 + recharge，再 JOIN public.users
  let query = supabase
    .from('refund_requests')
    .select('*, recharge:recharge_records(id, order_number, amount, status)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)

  const { data: requests, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((requests ?? []).map((r: any) => r.user_id).filter(Boolean))]
  let userMap: Record<string, any> = {}
  if (userIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, tokens')
      .in('id', userIds)
    userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]))
  }

  const result = (requests ?? []).map((r: any) => ({ ...r, user: userMap[r.user_id] ?? null }))
  return NextResponse.json(result)
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
