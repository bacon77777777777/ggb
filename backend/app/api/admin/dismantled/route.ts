import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  // Exclude bots
  const { data: botRows } = await supabase.from('users').select('id').eq('is_bot', true)
  const botIds = (botRows ?? []).map((r: any) => r.id)

  let query = supabase
    .from('draw_records')
    .select(`
      id,
      created_at,
      product_prize_id,
      product_prizes ( name, level, recycle_value ),
      products ( name ),
      users ( id, name, email )
    `)
    .eq('status', 'dismantled')
    .order('created_at', { ascending: false })
    .limit(500)

  if (botIds.length > 0) {
    query = query.not('user_id', 'in', `(${botIds.join(',')})`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data ?? []).map((item: any) => ({
    id: String(item.id),
    created_at: item.created_at,
    product_name: item.products?.name ?? '未知系列',
    prize_name: item.product_prizes?.name ?? item.prize_name ?? '未知獎品',
    prize_level: item.product_prizes?.level ?? '?',
    recycle_value: item.product_prizes?.recycle_value ?? 0,
    user_name: item.users?.name ?? item.users?.email ?? '未知用戶',
    user_id: item.users?.id ?? '',
  }))

  return NextResponse.json({ items })
}
