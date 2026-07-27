import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data, error } = await getSupabaseAdmin()
    .from('event_sections').select('*').eq('event_id', id).order('sort_order', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  // Get current max sort_order
  const { data: existing } = await getSupabaseAdmin()
    .from('event_sections').select('sort_order').eq('event_id', id).order('sort_order', { ascending: false }).limit(1)
  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0
  const { data, error } = await getSupabaseAdmin()
    .from('event_sections').insert({
      event_id: id,
      sort_order: nextOrder,
      type: body.type,
      content: body.content || {},
    }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
