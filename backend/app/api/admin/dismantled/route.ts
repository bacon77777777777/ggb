import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'

export async function GET(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const url = new URL(request.url)

  /*
   * 只要一個數字（商品管理的「回收數」小卡）。
   * 那張卡原本是前端用瀏覽器的 supabase client 直接 count draw_records ——
   * 但那張表的 RLS policy 是 `auth.uid() = user_id`，而後台不走 Supabase Auth，
   * anon 的 auth.uid() 是 NULL，所以永遠回 0（不報錯）。實測確認過。
   */
  if (url.searchParams.get('view') === 'count') {
    const { count } = await supabase
      .from('draw_records')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'dismantled')
    return NextResponse.json({ count: count ?? 0 })
  }


  const [{ data: botRows }, { data: suppliersData }] = await Promise.all([
    supabase.from('users').select('id').eq('is_bot', true),
    supabase.from('suppliers').select('id, name').order('name'),
  ])
  const botIds = (botRows ?? []).map((r: any) => r.id)

  /*
   * 一律撈完，不要留 limit —— PostgREST 預設就在 1,000 筆截斷。
   * PROD 已經有 1,562 筆回收，畫面上的統計卡是拿撈回來的資料算的，
   * 截斷等於「總退還代幣」直接少報 5,620 G，跟廠商結算對不起來。
   */
  const buildQuery = () => {
    let query = supabase
    .from('draw_records')
    .select(`
      id,
      created_at,
      prize_name,
      prize_level,
      product_prizes ( name, level ),
      products ( id, name, type, supplier_id, suppliers ( id, name ) ),
      users ( id, name, email, member_no ),
      admin_recycle_pool ( recycle_value )
    `)
    .eq('status', 'dismantled')
    .order('created_at', { ascending: false })

    if (botIds.length > 0) {
      query = query.not('user_id', 'in', `(${botIds.join(',')})`)
    }
    return query
  }

  let data: any[]
  try {
    data = await fetchAllRows<any>(() => buildQuery())
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? '讀取失敗' }, { status: 500 })
  }

  const items = data.map((item: any) => {
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
      member_no: item.users?.member_no ?? null,
    }
  })

  return NextResponse.json({ items, suppliers: suppliersData ?? [] })
}
