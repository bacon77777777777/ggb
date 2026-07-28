import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const [{ data: botRows }, { data: suppliersData }] = await Promise.all([
    supabase.from('users').select('id').eq('is_bot', true),
    supabase.from('suppliers').select('id, name').order('name'),
  ])
  const botIds = (botRows ?? []).map((r: any) => r.id)

  let query = supabase
    .from('draw_records')
    .select(`
      id,
      created_at,
      prize_name,
      prize_level,
      product_prizes ( name, level ),
      products ( id, name, type, supplier_id, suppliers ( id, name ) ),
      users ( id, name, email ),
      admin_recycle_pool ( recycle_value )
    `)
    .eq('status', 'dismantled')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (botIds.length > 0) {
    query = query.not('user_id', 'in', `(${botIds.join(',')})`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data ?? []).map((item: any) => {
    const recyclePool = Array.isArray(item.admin_recycle_pool)
      ? item.admin_recycle_pool[0]
      : item.admin_recycle_pool
    return {
      id: String(item.id),
      created_at: item.created_at,
      product_name: item.products?.name ?? '未知系列',
      product_type: item.products?.type ?? '',
      prize_name: item.product_prizes?.name ?? item.prize_name ?? '未知獎品',
      prize_level: item.product_prizes?.level ?? item.prize_level ?? '?',
      recycle_value: recyclePool?.recycle_value ?? 0,
      supplier_id: item.products?.suppliers?.id ?? null,
      supplier_name: item.products?.suppliers?.name ?? '—',
      user_name: item.users?.name ?? item.users?.email ?? '未知用戶',
      user_id: item.users?.id ?? '',
    }
  })

  return NextResponse.json({ items, suppliers: suppliersData ?? [] })
}
