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

  if (!['dismiss', 'force_fail'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const update: Record<string, any> = {
    needs_review: false,
    review_note:  note ?? null,
  }
  if (action === 'force_fail') update.status = 'failed'

  const { data, error } = await supabase
    .from('recharge_records')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId:    session.adminId,
    action:     action === 'dismiss' ? '忽略待複核儲值' : '強制標記儲值失敗',
    targetType: 'recharge',
    targetId:   id,
    detail:     { note },
    ip:         getClientIp(req),
  })

  return NextResponse.json(data)
}
