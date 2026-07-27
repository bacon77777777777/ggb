import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { sectionId } = await params
  const body = await req.json()
  const { data, error } = await getSupabaseAdmin()
    .from('event_sections').update({ content: body.content }).eq('id', sectionId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { sectionId } = await params
  const { error } = await getSupabaseAdmin().from('event_sections').delete().eq('id', sectionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
