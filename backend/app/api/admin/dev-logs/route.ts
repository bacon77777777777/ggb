import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('dev_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { version, title, description, type, status, priority } = body

  if (!title || !type) {
    return NextResponse.json({ error: '標題與類型為必填' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('dev_logs')
    .insert({ version: version || null, title, description: description || null, type, status: status || 'open', priority: priority || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({ adminId: session.adminId, action: '新增開發日誌', targetType: 'dev_logs', targetId: String(data.id), detail: { title, type }, ip: getClientIp(req) })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('dev_logs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({ adminId: session.adminId, action: '更新開發日誌', targetType: 'dev_logs', targetId: String(id), ip: getClientIp(req) })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('dev_logs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({ adminId: session.adminId, action: '刪除開發日誌', targetType: 'dev_logs', targetId: id, ip: getClientIp(req) })
  return NextResponse.json({ ok: true })
}
