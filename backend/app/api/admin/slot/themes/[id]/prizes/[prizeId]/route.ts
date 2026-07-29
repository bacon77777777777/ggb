import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; prizeId: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prizeId } = await params
  const body = await request.json()
  const allowed = ['name', 'image_url', 'weight', 'video_type', 'per_machine_stock', 'sort_order', 'is_active']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('slot_theme_prizes')
    .update(updates)
    .eq('id', prizeId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prize: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; prizeId: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prizeId } = await params
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('slot_theme_prizes').delete().eq('id', prizeId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
