import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const allowed = ['name', 'level', 'image_url', 'remaining', 'is_active', 'supplier_id']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  updates.updated_at = new Date().toISOString()

  const supabase = getSupabaseAdmin()

  // Find the canonical name for this prize so we can sync all duplicate copies
  const { data: target } = await supabase.from('slot_prizes').select('name').eq('id', id).single()

  let data, error
  if (target?.name) {
    // Update all copies with same name (historical duplicates from seeding)
    const result = await supabase
      .from('slot_prizes')
      .update(updates)
      .eq('name', target.name)
      .select()
    data = result.data?.[0] ?? null
    error = result.error
  } else {
    const result = await supabase.from('slot_prizes').update(updates).eq('id', id).select().single()
    data = result.data
    error = result.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prize: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  // Find all copies with the same name (historical duplicates from seeding)
  const { data: target } = await supabase.from('slot_prizes').select('name').eq('id', id).single()
  let allIds = [parseInt(id)]
  if (target?.name) {
    const { data: copies } = await supabase.from('slot_prizes').select('id').eq('name', target.name)
    if (copies && copies.length > 0) allIds = copies.map(c => c.id)
  }

  // Block deletion if any copy is still in a pool
  const { count } = await supabase
    .from('slot_pool_items')
    .select('id', { count: 'exact', head: true })
    .in('slot_prize_id', allIds)

  if (count && count > 0) {
    return NextResponse.json({ error: '此品項已加入獎池，無法刪除' }, { status: 409 })
  }

  const { error } = await supabase.from('slot_prizes').delete().in('id', allIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
