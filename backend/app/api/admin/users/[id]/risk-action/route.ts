import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

export const runtime = 'nodejs'

/*
 * 凍結已於 2026-08-31 併進停用（migration 660）。
 *
 * 兩者對玩家完全一樣（`AuthContext` 只看 `status !== 'active'`），差別只在凍結
 * 多了原因／推播／待處理儲值提醒 —— 那三樣搬進 disable 之後，凍結就沒有存在意義。
 * `freeze`／`unfreeze` 仍然收，當成 disable／enable 的別名：GB哥 的工具與
 * 舊的整合可能還在送舊名字，直接拒收會讓那些呼叫靜默失敗。
 */
type RiskAction = 'disable' | 'enable' | 'flag' | 'unflag' | 'freeze' | 'unfreeze'

async function pushLine(text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const id    = process.env.NOTIFY_TARGET_ID
  if (!token || !id) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ to: id, messages: [{ type: 'text', text }] }),
  }).catch(() => {})
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body: { action: RiskAction; reason?: string } = await request.json().catch(() => ({}))
  const { action, reason } = body

  if (!['disable', 'enable', 'flag', 'unflag', 'freeze', 'unfreeze'].includes(action)) {
    return NextResponse.json({ error: '無效的操作' }, { status: 400 })
  }
  // 舊名字正規化，底下只處理兩種
  const act = action === 'freeze' ? 'disable' : action === 'unfreeze' ? 'enable' : action

  const supabase = getSupabaseAdmin()

  const { data: user, error: findErr } = await supabase
    .from('users')
    .select('id, name, email, status, is_suspicious')
    .eq('id', id)
    .single()

  if (findErr || !user) return NextResponse.json({ error: '找不到用戶' }, { status: 404 })

  let update: Record<string, any> = {}
  let label = ''

  switch (act) {
    case 'disable':
      update = {
        status:          'inactive',
        disabled_at:     new Date().toISOString(),
        disabled_by:     `admin#${session.adminId}`,
        disabled_reason: reason ?? '後台操作',
      }
      label = '停用會員'
      break
    case 'enable':
      update = {
        status:          'active',
        disabled_at:     null,
        disabled_by:     null,
        disabled_reason: null,
      }
      label = '啟用會員'
      break
    case 'flag':
      update = {
        is_suspicious:    true,
        suspicious_reason: reason ?? '後台標記',
      }
      label = '標記可疑'
      break
    case 'unflag':
      update = {
        is_suspicious:    false,
        suspicious_reason: null,
      }
      label = '解除可疑標記'
      break
  }

  const { error: updateErr } = await supabase.from('users').update(update).eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const ip = getClientIp(request)
  await logAdminAction({
    adminId:    session.adminId,
    action:     label,
    targetType: 'user',
    targetId:   id,
    detail:     { reason, action },
    ip,
  })

  await supabase.from('user_event_logs').insert({
    user_id:    id,
    event_type: act,
    detail:     { action, reason, by: String(session.adminId) },
  })

  // 凍結帳號時，查有無 pending 儲值 → 通知財務長
  let pendingNote = ''
  if (action === 'freeze') {
    const { data: pendingRR } = await supabase
      .from('recharge_records')
      .select('id, amount')
      .eq('user_id', id)
      .eq('status', 'pending')
    if (pendingRR && pendingRR.length > 0) {
      const totalAmt = pendingRR.reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0)
      pendingNote = `\n⚠️ 財務注意：此帳號有 ${pendingRR.length} 筆 pending 儲值（NT$ ${totalAmt.toLocaleString()}），請至後台確認是否退款或保留。`

      // 寫入 agent_events 供財務長跟進
      await supabase.from('agent_events').insert({
        event_type:   'freeze_pending_payment',
        source_agent: 'risk',
        payload: {
          user_id:       id,
          user_name:     user.name ?? user.email ?? id,
          pending_count: pendingRR.length,
          total_amount:  totalAmt,
          disabled_reason: reason ?? '後台操作',
          disabled_by:     `admin#${session.adminId}`,
          // 舊事件用的是 frozen_reason，後台面板兩個 key 都認（見 agent-events/Panel）
          frozen_reason:   reason ?? '後台操作',
        },
      })
    }
  }

  const emoji = act === 'disable' ? '🔒' : act === 'enable' ? '🔓' : act === 'flag' ? '🚩' : '✅'
  const notifyText = `${emoji} 風控操作：${label}\n用戶：${user.name ?? user.email ?? id}${reason ? `\n原因：${reason}` : ''}\n操作者：admin#${session.adminId}${pendingNote}`
  await pushLine(notifyText)

  return NextResponse.json({ ok: true, action: act, userId: id })
}
