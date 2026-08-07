import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['pending', 'approved', 'published', 'archived']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { status } = body

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('content_drafts')
    .update({ status })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({
    adminId: session.adminId,
    action: '修改 AI 文案草稿',
    targetType: 'content_draft',
    targetId: String(id),
    detail: {},
    ip: getClientIp(req),
  })

  return NextResponse.json({ ok: true })
}
