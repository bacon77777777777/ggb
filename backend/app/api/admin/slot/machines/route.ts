import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function GET() {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('slot_machines')
    .select('*, suppliers(name)')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ machines: data ?? [] })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, description, image_url, price_per_spin, trigger_rate, continue_rate, min_rush_hits, floor_spin_count, supplier_id, guaranteed_prize } = body

  if (!name || !price_per_spin) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('slot_machines')
    .insert({
      name,
      description: description ?? null,
      image_url: image_url ?? null,
      price_per_spin: parseInt(price_per_spin),
      trigger_rate: parseFloat(trigger_rate ?? '0.15'),
      continue_rate: parseFloat(continue_rate ?? '0.60'),
      min_rush_hits: parseInt(min_rush_hits ?? '3'),
      floor_spin_count: parseInt(floor_spin_count ?? '30'),
      supplier_id: supplier_id ?? null,
      guaranteed_prize: guaranteed_prize ?? true,
      is_active: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({
    adminId: admin.adminId,
    action: '新增機台',
    targetType: 'slot_machine',
    targetId: String(data?.id ?? ''),
    detail: { name },
    ip: getClientIp(request),
  })

  return NextResponse.json({ machine: data })
}
