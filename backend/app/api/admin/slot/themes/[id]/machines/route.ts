import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

// 增加一台機器到主題
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  // 取主題設定
  const { data: theme, error: tErr } = await supabase
    .from('slot_themes').select('*').eq('id', id).single()
  if (tErr || !theme) return NextResponse.json({ error: '主題不存在' }, { status: 404 })

  // 取現有機器最大編號
  const { data: existing } = await supabase
    .from('slot_machines').select('machine_number').eq('theme_id', id)
    .order('machine_number', { ascending: false }).limit(1)
  const nextNumber = ((existing?.[0]?.machine_number ?? 0) as number) + 1

  // 建立機器
  const { data: machine, error: mErr } = await supabase
    .from('slot_machines')
    .insert({
      name: theme.name,
      theme_id: parseInt(id),
      machine_number: nextNumber,
      bet_tiers: theme.bet_tiers,
      price_per_spin: (theme.bet_tiers as { coins: number }[])[0]?.coins ?? 100,
      trigger_rate: theme.trigger_rate,
      continue_rate: theme.continue_rate,
      min_rush_hits: theme.min_rush_hits,
      floor_spin_count: theme.floor_spin_count,
      spin_returns: theme.spin_returns,
      supplier_id: theme.supplier_id,
      is_active: false,
      sort_order: nextNumber - 1,
      guaranteed_prize: false,
    })
    .select().single()

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  // 建立 coin_return 普通旋轉品項
  const sr = theme.spin_returns as { name: string; multiplier: number; weight: number }[]
  if (sr?.length > 0) {
    await supabase.from('slot_pool_items').insert(
      sr.map(r => ({
        machine_id: machine.id,
        display_name: r.name,
        coin_return: true,
        return_multiplier: r.multiplier,
        weight: r.weight,
        normal_only: true,
        rush_only: false,
        is_floor: false,
      }))
    )
  }

  // 從 slot_theme_prizes 複製 RUSH 獎池
  const { data: themePrizes } = await supabase
    .from('slot_theme_prizes').select('*').eq('theme_id', id).eq('is_active', true)

  if (themePrizes && themePrizes.length > 0) {
    for (const tp of themePrizes) {
      const { data: sp } = await supabase
        .from('slot_prizes')
        .insert({
          name: tp.name,
          image_url: tp.image_url,
          remaining: tp.per_machine_stock ?? null,
          is_active: true,
          supplier_id: theme.supplier_id,
        })
        .select().single()

      if (sp) {
        await supabase.from('slot_pool_items').insert({
          machine_id: machine.id,
          slot_prize_id: sp.id,
          weight: tp.weight,
          rush_only: true,
          normal_only: false,
          is_floor: false,
          remaining: tp.per_machine_stock ?? null,
        })
      }
    }
  }

  // 更新主題 machine_count
  await supabase.from('slot_themes')
    .update({ machine_count: nextNumber, updated_at: new Date().toISOString() })
    .eq('id', id)

  await logAdminAction({
    adminId: admin.adminId,
    action: '主題新增機台',
    targetType: 'slot_theme',
    targetId: String(id),
    detail: { machine_id: machine?.id ?? null, name: machine?.name },
    ip: getClientIp(request),
  })

  return NextResponse.json({ machine })
}

// 從主題移除一台機器（保留歷史記錄）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const machineId = searchParams.get('machine_id')
  if (!machineId) return NextResponse.json({ error: '缺少 machine_id' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // 只下架並取消 theme_id（不刪除，保留 session 歷史）
  await supabase.from('slot_machines')
    .update({ is_active: false, theme_id: null })
    .eq('id', machineId)
    .eq('theme_id', id)

  // 重算主題 machine_count
  const { count } = await supabase
    .from('slot_machines').select('*', { count: 'exact', head: true }).eq('theme_id', id)

  await supabase.from('slot_themes')
    .update({ machine_count: count ?? 0, updated_at: new Date().toISOString() })
    .eq('id', id)

  await logAdminAction({
    adminId: admin.adminId,
    action: '主題移除機台',
    targetType: 'slot_theme',
    targetId: String(id),
    detail: {},
    ip: getClientIp(request),
  })

  return NextResponse.json({ success: true })
}
