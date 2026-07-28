import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const [machineRes, poolRes] = await Promise.all([
    supabase.from('slot_machines').select('*, suppliers(name)').eq('id', id).single(),
    supabase
      .from('slot_pool_items')
      .select('*, product_prizes(id, name, level, image_url, product_id, remaining, products(name, type)), slot_prizes(id, name, level, image_url, remaining)')
      .eq('machine_id', id)
      .order('weight', { ascending: false }),
  ])

  if (machineRes.error) return NextResponse.json({ error: machineRes.error.message }, { status: 500 })
  return NextResponse.json({ machine: machineRes.data, pool: poolRes.data ?? [] })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const allowed = ['name', 'description', 'image_url', 'price_per_spin', 'trigger_rate',
    'continue_rate', 'min_rush_hits', 'floor_spin_count', 'is_active', 'sort_order', 'supplier_id',
    'guaranteed_prize']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  updates.updated_at = new Date().toISOString()

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('slot_machines')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ machine: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('slot_machines').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
