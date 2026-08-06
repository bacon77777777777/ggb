import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

// GET: list pool items for a machine
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('slot_pool_items')
    .select('*, product_prizes(id, name, level, image_url, product_id, products(name)), slot_prizes(id, name, level, image_url, remaining)')
    .eq('machine_id', id)
    .order('weight', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pool: data ?? [] })
}

// POST: add item to pool
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { slot_prize_id, product_prize_id, weight, min_bet, is_floor, rush_only, normal_only, remaining } = body

  if (!slot_prize_id && !product_prize_id) {
    return NextResponse.json({ error: '請選擇獎品' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const insertRow: Record<string, unknown> = {
    machine_id: parseInt(id),
    weight: parseInt(weight ?? '100'),
    min_bet: min_bet === null || min_bet === undefined || min_bet === '' ? null : parseInt(min_bet),
    is_floor: is_floor ?? false,
    rush_only: rush_only ?? false,
    normal_only: normal_only ?? false,
    remaining: remaining === null || remaining === '' ? null : parseInt(remaining),
  }

  if (slot_prize_id) {
    insertRow.slot_prize_id = parseInt(slot_prize_id)
  } else {
    insertRow.product_prize_id = parseInt(product_prize_id)
  }

  const { data, error } = await supabase
    .from('slot_pool_items')
    .insert(insertRow)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({
    adminId: admin.adminId,
    action: '機台獎池加入品項',
    targetType: 'slot_machine',
    targetId: String(id),
    detail: { prize_id: data?.prize_id ?? null },
    ip: getClientIp(request),
  })

  return NextResponse.json({ item: data })
}

// DELETE: remove pool item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get('item_id')
  if (!itemId) return NextResponse.json({ error: '缺少 item_id' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('slot_pool_items').delete().eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({
    adminId: admin.adminId,
    action: '機台獎池移除品項',
    targetType: 'slot_machine',
    targetId: String(id),
    detail: { item_id: itemId },
    ip: getClientIp(request),
  })

  return NextResponse.json({ success: true })
}
