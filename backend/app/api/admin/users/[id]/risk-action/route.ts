import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

export const runtime = 'nodejs'

type RiskAction = 'freeze' | 'unfreeze' | 'flag' | 'unflag'

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

  if (!['freeze', 'unfreeze', 'flag', 'unflag'].includes(action)) {
    return NextResponse.json({ error: '無效的操作' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: user, error: findErr } = await supabase
    .from('users')
    .select('id, name, email, status, is_suspicious')
    .eq('id', id)
    .single()

  if (findErr || !user) return NextResponse.json({ error: '找不到用戶' }, { status: 404 })

  let update: Record<string, any> = {}
  let label = ''

  switch (action) {
    case 'freeze':
      update = {
        status:        'frozen',
        frozen_at:     new Date().toISOString(),
        frozen_by:     `admin#${session.adminId}`,
        frozen_reason: reason ?? '後台操作',
      }
      label = '凍結帳號'
      break
    case 'unfreeze':
      update = {
        status:        'active',
        frozen_at:     null,
        frozen_by:     null,
        frozen_reason: null,
      }
      label = '解除凍結'
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
    event_type: action,
    detail:     { action, reason, by: String(session.adminId) },
  })

  const emoji = action === 'freeze' ? '🔒' : action === 'unfreeze' ? '🔓' : action === 'flag' ? '🚩' : '✅'
  const notifyText = `${emoji} 風控操作：${label}\n用戶：${user.name ?? user.email ?? id}${reason ? `\n原因：${reason}` : ''}\n操作者：admin#${session.adminId}`
  await pushLine(notifyText)

  return NextResponse.json({ ok: true, action, userId: id })
}
