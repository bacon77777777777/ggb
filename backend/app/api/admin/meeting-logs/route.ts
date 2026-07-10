import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('meeting_logs')
    .select('*')
    .order('meeting_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, meeting_at, participants, content } = await req.json()
  if (!title || !meeting_at) return NextResponse.json({ error: '標題與時間為必填' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('meeting_logs')
    .insert({ title, meeting_at, participants: participants || '', content: content || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({ adminId: session.adminId, action: '新增會議記錄', targetType: 'meeting_logs', targetId: String(data.id), detail: { title, meeting_at }, ip: getClientIp(req) })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('meeting_logs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({ adminId: session.adminId, action: '更新會議記錄', targetType: 'meeting_logs', targetId: String(id), ip: getClientIp(req) })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('meeting_logs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({ adminId: session.adminId, action: '刪除會議記錄', targetType: 'meeting_logs', targetId: id, ip: getClientIp(req) })
  return NextResponse.json({ ok: true })
}
