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

  const [themeRes, prizesRes, machinesRes] = await Promise.all([
    supabase.from('slot_themes').select('*, suppliers(name)').eq('id', id).single(),
    supabase.from('slot_theme_prizes').select('*').eq('theme_id', id).order('sort_order'),
    supabase.from('slot_machines').select('*, slot_pool_items(id, coin_return, rush_only)')
      .eq('theme_id', id).order('machine_number'),
  ])

  if (themeRes.error) return NextResponse.json({ error: themeRes.error.message }, { status: 500 })
  return NextResponse.json({
    theme:    themeRes.data,
    prizes:   prizesRes.data ?? [],
    machines: machinesRes.data ?? [],
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const allowed = [
    'name', 'machine_count', 'event_slug', 'supplier_id', 'image_url',
    'bet_tiers', 'spin_returns', 'trigger_rate', 'continue_rate',
    'continue_rate_decay', 'min_rush_hits', 'floor_spin_count',
    'video_rush_entry', 'video_rush_anticipation', 'video_rush_win',
    'video_rush_win_strong', 'video_rush_win_god', 'video_rush_revival',
    'is_active', 'sort_order', 'machine_type',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Array.isArray(updates.bet_tiers) && (updates.bet_tiers as unknown[]).length > 5)
    return NextResponse.json({ error: '投注檔次最多 5 個' }, { status: 400 })

  updates.updated_at = new Date().toISOString()

  const supabase = getSupabaseAdmin()
  const { data: theme, error } = await supabase
    .from('slot_themes').update(updates).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 同步機率/投注/影片設定到旗下所有機器
  const machineSync: Record<string, unknown> = {}
  const syncFields = [
    'name', 'bet_tiers', 'trigger_rate', 'continue_rate',
    'continue_rate_decay', 'min_rush_hits', 'floor_spin_count',
    'supplier_id', 'event_slug', 'image_url', 'is_active',
  ]
  for (const f of syncFields) {
    if (f in updates) machineSync[f] = updates[f]
  }
  if (updates.bet_tiers) {
    const tiers = updates.bet_tiers as { coins: number }[]
    machineSync.price_per_spin = tiers[0]?.coins ?? 100
  }
  if (updates.spin_returns) {
    machineSync.spin_returns = updates.spin_returns
  }

  if (Object.keys(machineSync).length > 0) {
    await supabase.from('slot_machines')
      .update({ ...machineSync, updated_at: new Date().toISOString() })
      .eq('theme_id', id)
  }

  // 如果 spin_returns 有變動，重建旗下所有機器的 coin_return pool items
  if (updates.spin_returns) {
    const { data: machines } = await supabase
      .from('slot_machines').select('id').eq('theme_id', id)

    if (machines && machines.length > 0) {
      const machineIds = machines.map((m: { id: number }) => m.id)

      await supabase.from('slot_pool_items')
        .delete()
        .in('machine_id', machineIds)
        .eq('coin_return', true)

      const sr = updates.spin_returns as { name: string; multiplier: number; weight: number }[]
      const newItems = machineIds.flatMap(mid =>
        sr.map(r => ({
          machine_id: mid,
          display_name: r.name,
          coin_return: true,
          return_multiplier: r.multiplier,
          weight: r.weight,
          normal_only: true,
          rush_only: false,
          is_floor: false,
        }))
      )
      if (newItems.length > 0) {
        await supabase.from('slot_pool_items').insert(newItems)
      }
    }
  }

  return NextResponse.json({ theme })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  // 先取消所有機器的 theme_id（保留歷史 session）
  await supabase.from('slot_machines').update({ theme_id: null }).eq('theme_id', id)
  const { error } = await supabase.from('slot_themes').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
