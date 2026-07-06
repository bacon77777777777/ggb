import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { action, note } = body

  if (!['dismiss', 'force_fail', 'force_success'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Fetch the record first to get amount, bonus, user_id, and current status
  const { data: record, error: fetchErr } = await supabase
    .from('recharge_records')
    .select('id, user_id, amount, bonus, status')
    .eq('id', id)
    .single()

  if (fetchErr || !record) return NextResponse.json({ error: 'record not found' }, { status: 404 })

  if (action === 'force_success' && record.status === 'success') {
    return NextResponse.json({ error: '此筆儲值已是 success 狀態，避免重複發放代幣' }, { status: 409 })
  }

  const update: Record<string, any> = {
    needs_review: false,
    review_note:  note ?? null,
  }
  if (action === 'force_fail')    update.status = 'failed'
  if (action === 'force_success') update.status = 'success'

  const { data, error } = await supabase
    .from('recharge_records')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Grant tokens when forcing success
  if (action === 'force_success') {
    const tokensToAdd = Number(record.amount) + Number(record.bonus ?? 0)
    const { error: tokenErr } = await supabase.rpc('increment_user_tokens', {
      p_user_id: record.user_id,
      p_amount:  tokensToAdd,
    })
    if (tokenErr) {
      // Roll back status change if token grant fails
      await supabase.from('recharge_records').update({ status: record.status, needs_review: true }).eq('id', id)
      return NextResponse.json({ error: `代幣發放失敗：${tokenErr.message}` }, { status: 500 })
    }
  }

  const actionLabel =
    action === 'dismiss'       ? '忽略待複核儲值' :
    action === 'force_fail'    ? '強制標記儲值失敗' :
                                 '強制補發代幣（手動成功）'

  await logAdminAction({
    adminId:    session.adminId,
    action:     actionLabel,
    targetType: 'recharge',
    targetId:   id,
    detail:     { note, amount: record.amount, bonus: record.bonus },
    ip:         getClientIp(req),
  })

  return NextResponse.json(data)
}
