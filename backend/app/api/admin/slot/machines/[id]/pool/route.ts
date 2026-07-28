import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

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
    .select('*, product_prizes(id, name, level, image_url, product_id, products(name))')
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
  const { product_prize_id, weight, min_bet, is_floor, rush_only, normal_only, remaining } = body

  if (!product_prize_id) {
    return NextResponse.json({ error: '請選擇獎品' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Validate prize exists
  const { data: prize } = await supabase
    .from('product_prizes')
    .select('id')
    .eq('id', product_prize_id)
    .single()
  if (!prize) return NextResponse.json({ error: '獎品不存在' }, { status: 400 })

  const { data, error } = await supabase
    .from('slot_pool_items')
    .insert({
      machine_id: parseInt(id),
      product_prize_id: parseInt(product_prize_id),
      weight: parseInt(weight ?? '100'),
      min_bet: min_bet === null || min_bet === undefined || min_bet === '' ? null : parseInt(min_bet),
      is_floor: is_floor ?? false,
      rush_only: rush_only ?? false,
      normal_only: normal_only ?? false,
      remaining: remaining === null || remaining === '' ? null : parseInt(remaining),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE: remove pool item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get('item_id')
  if (!itemId) return NextResponse.json({ error: '缺少 item_id' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('slot_pool_items').delete().eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
