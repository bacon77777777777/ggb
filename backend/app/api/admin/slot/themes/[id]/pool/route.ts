import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

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
    .select('id, min_bet, remaining, display_name, slot_prizes:product_prizes(id, name, image_url, level, recycle_value)')
    .eq('machine_id', firstId)
    .eq('rush_only', true)
    .order('min_bet', { ascending: true, nullsFirst: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

// PATCH: 更新獎品回收幣值（同步到此主題所有機台的同名 slot_prizes）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { prize_name, recycle_value, level } = body
  if (!prize_name || (recycle_value == null && level == null))
    return NextResponse.json({ error: '缺少 prize_name 及更新欄位' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // 找出此主題所有機台的 rush pool items 中符合該名稱的 slot_prize_id
  const { data: machines } = await supabase
    .from('slot_machines').select('id').eq('theme_id', id)

  if (!machines || machines.length === 0)
    return NextResponse.json({ success: true })

  const machineIds = machines.map((m: { id: number }) => m.id)

  const { data: items } = await supabase
    .from('slot_pool_items')
    .select('product_prize_id')
    .in('machine_id', machineIds)
    .eq('rush_only', true)
    .not('product_prize_id', 'is', null)

  const prizeIds = (items ?? []).map((i: { product_prize_id: number }) => i.product_prize_id).filter(Boolean)
  if (prizeIds.length === 0) return NextResponse.json({ success: true })

  const updates: Record<string, unknown> = {}
  if (recycle_value != null) updates.recycle_value = parseInt(String(recycle_value))
  if (level != null) updates.level = String(level)

  const { error } = await supabase
    .from('product_prizes')
    .update(updates)
    .in('id', prizeIds)
    .eq('name', prize_name)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: admin.adminId,
    action: '修改主題獎池品項',
    targetType: 'slot_theme',
    targetId: String(id),
    detail: { prize_name, updates },
    ip: getClientIp(request),
  })

  return NextResponse.json({ success: true })
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
  const { product_prize_id, display_name, image_url, min_bet, remaining } = body

  if (!product_prize_id && !display_name)
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
    ...(product_prize_id
      ? { product_prize_id: parseInt(String(product_prize_id)) }
      : { display_name, product_prize_id: null }),
  }))

  const { data, error } = await supabase
    .from('slot_pool_items')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: admin.adminId,
    action: '主題獎池新增品項',
    targetType: 'slot_theme',
    targetId: String(id),
    detail: { inserted: data?.length ?? 0 },
    ip: getClientIp(request),
  })

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
      .from('slot_pool_items').select('product_prize_id, display_name').eq('id', prizePoolId).single()

    if (item) {
      let q = supabase.from('slot_pool_items').delete().in('machine_id', machineIds).eq('rush_only', true)
      if (item.product_prize_id) {
        q = q.eq('product_prize_id', item.product_prize_id)
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

  await logAdminAction({
    adminId: admin.adminId,
    action: '主題獎池移除品項',
    targetType: 'slot_theme',
    targetId: String(id),
    detail: { prizeName },
    ip: getClientIp(request),
  })

  return NextResponse.json({ success: true })
}
