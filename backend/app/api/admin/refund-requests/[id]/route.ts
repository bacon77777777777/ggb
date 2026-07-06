import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action, adminNote } = body   // action: 'approve' | 'reject' | 'process'

  const supabase = getSupabaseAdmin()
  const { id } = await params

  if (action === 'approve') {
    const { data, error } = await supabase.from('refund_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), admin_note: adminNote ?? null })
      .eq('id', id).eq('status', 'pending')
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'reject') {
    const { data, error } = await supabase.from('refund_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), admin_note: adminNote ?? null })
      .eq('id', id).eq('status', 'pending')
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'process') {
    // 執行退款 RPC（扣代幣 + 更新狀態）
    const { error } = await supabase.rpc('process_refund', {
      p_refund_id:  Number(id),
      p_admin_note: adminNote ?? null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // TODO: 正式環境呼叫 ECPay 退款 API
    // await callEcpayRefund(tradeNo, amountTwd)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'invalid action' }, { status: 400 })
}
