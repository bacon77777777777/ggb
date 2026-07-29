import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// GET: 取得第一台機台的 rush_only pool items（代表所有機台）
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const { data: machines } = await supabase
    .from('slot_machines')
    .select('id')
    .eq('theme_id', id)
    .order('machine_number')
    .limit(1)

  if (!machines || machines.length === 0)
    return NextResponse.json({ items: [] })

  const firstId = machines[0].id

  const { data, error } = await supabase
    .from('slot_pool_items')
    .select('id, min_bet, remaining, display_name, slot_prizes(id, name, image_url, level)')
    .eq('machine_id', firstId)
    .eq('rush_only', true)
    .order('min_bet', { ascending: true, nullsFirst: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

// POST: 新增 rush 獎品到此主題的所有機台
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { slot_prize_id, display_name, image_url, min_bet, remaining } = body

  if (!slot_prize_id && !display_name)
    return NextResponse.json({ error: '請選擇品項或輸入名稱' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  const { data: machines, error: mErr } = await supabase
    .from('slot_machines')
    .select('id')
    .eq('theme_id', id)

  if (mErr || !machines || machines.length === 0)
    return NextResponse.json({ error: '找不到機台' }, { status: 404 })

  const rows = machines.map(m => ({
    machine_id:   m.id,
    rush_only:    true,
    normal_only:  false,
    is_floor:     false,
    coin_return:  false,
    weight:       100,
    min_bet:      min_bet != null ? parseInt(String(min_bet)) : null,
    remaining:    remaining != null && remaining !== '' ? parseInt(String(remaining)) : null,
    ...(slot_prize_id
      ? { slot_prize_id: parseInt(String(slot_prize_id)) }
      : { display_name, slot_prize_id: null }),
  }))

  const { data, error } = await supabase
    .from('slot_pool_items')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inserted: data?.length ?? 0 })
}

// DELETE: 從所有機台移除指定品項（by display_name 或 slot_prize_id）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const prizeName   = searchParams.get('name')
  const prizePoolId = searchParams.get('pool_item_id')

  const supabase = getSupabaseAdmin()

  const { data: machines } = await supabase
    .from('slot_machines').select('id').eq('theme_id', id)

  if (!machines || machines.length === 0)
    return NextResponse.json({ success: true })

  const machineIds = machines.map(m => m.id)

  if (prizePoolId) {
    // 找到 pool item 對應的 slot_prize_id 或 display_name，再對所有機台刪除
    const { data: item } = await supabase
      .from('slot_pool_items').select('slot_prize_id, display_name').eq('id', prizePoolId).single()

    if (item) {
      let q = supabase.from('slot_pool_items').delete().in('machine_id', machineIds).eq('rush_only', true)
      if (item.slot_prize_id) {
        q = q.eq('slot_prize_id', item.slot_prize_id)
      } else if (item.display_name) {
        q = q.eq('display_name', item.display_name)
      }
      const { error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else if (prizeName) {
    const { error } = await supabase
      .from('slot_pool_items')
      .delete()
      .in('machine_id', machineIds)
      .eq('rush_only', true)
      .eq('display_name', prizeName)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
