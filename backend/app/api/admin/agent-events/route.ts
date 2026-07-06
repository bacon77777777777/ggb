import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const status = req.nextUrl.searchParams.get('status') ?? 'pending'
  const limit  = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 100)

  const [{ data: events, error }, { count: pendingCount }] = await Promise.all([
    supabase
      .from('agent_events')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('agent_events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ events: events ?? [], pendingCount: pendingCount ?? 0 })
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: { ids: string[]; status: 'processed' | 'dismissed' } = await req.json().catch(() => ({}))
  if (!body.ids?.length || !['processed', 'dismissed'].includes(body.status)) {
    return NextResponse.json({ error: '無效參數' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('agent_events')
    .update({
      status:       body.status,
      processed_at: new Date().toISOString(),
      processed_by: `admin#${session.adminId}`,
    })
    .in('id', body.ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
