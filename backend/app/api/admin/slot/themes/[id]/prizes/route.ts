import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('slot_theme_prizes')
    .select('*')
    .eq('theme_id', id)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prizes: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { name, image_url, weight = 100, video_type = 'win', per_machine_stock, min_bet, sort_order = 0 } = body

  if (!name) return NextResponse.json({ error: '請填入獎品名稱' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('slot_theme_prizes')
    .insert({
      theme_id: parseInt(id),
      name, image_url: image_url ?? null,
      weight, video_type,
      per_machine_stock: per_machine_stock ?? null,
      min_bet: min_bet ?? null,
      sort_order,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({
    adminId: admin.adminId,
    action: '主題新增獎品',
    targetType: 'slot_theme',
    targetId: String(id),
    detail: { prize_id: data?.id ?? null, name: data?.name },
    ip: getClientIp(request),
  })

  return NextResponse.json({ prize: data })
}
