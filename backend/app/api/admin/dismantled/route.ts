import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'
import { fetchAllRows } from '@/lib/fetchAllRows'

/** 回收池處置狀態。pending 待處理／reused 已再利用／scrapped 已報廢（migration 617） */
const VALID_STATUS = ['pending', 'reused', 'scrapped'] as const
type RecycleStatus = (typeof VALID_STATUS)[number]

export async function GET(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const url = new URL(request.url)

  /*
   * 品項庫存：回答「這件商品的這個賞，平台手上還有幾件」——
   * 廠商要把回收品包成自製賞時，唯一需要的那個數字。
   *
   * ⚠️ 預設排除轉蛋／盒玩。那兩類回收後 dismantle_prizes 會 remaining +1
   * 把庫存還回去，廠商實體根本沒動、之後還會再被抽走；但它們同樣會寫進
   * admin_recycle_pool，所以池子裡有一半以上是幽靈。直接拿池子的數字
   * 給廠商看會錯一半，聚合邏輯在 recycle_inventory_summary()（migration 618）。
   */
  if (url.searchParams.get('view') === 'inventory') {
    const includeRestocked = url.searchParams.get('include_restocked') === '1'
    const [{ data: rows, error }, { data: suppliersData }] = await Promise.all([
      supabase.rpc('recycle_inventory_summary', {
        p_include_restocked: includeRestocked,
        p_supplier_id: null,
      }),
      supabase.from('suppliers').select('id, name').order('name'),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: rows ?? [], suppliers: suppliersData ?? [] })
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
      users ( id, name, email ),
      admin_recycle_pool ( id, recycle_value, status, handled_at, handled_by, handled_note )
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
      // 標記狀態要打的是回收池那筆，不是 draw_record
      pool_id: recyclePool?.id ?? null,
      created_at: item.created_at,
      product_name: item.products?.name ?? '未知系列',
      product_type: item.products?.type ?? '',
      prize_name: item.product_prizes?.name ?? item.prize_name ?? '未知獎品',
      prize_level: item.product_prizes?.level ?? item.prize_level ?? '?',
      recycle_value: recyclePool?.recycle_value ?? 0,
      status: (recyclePool?.status ?? 'pending') as RecycleStatus,
      handled_at: recyclePool?.handled_at ?? null,
      handled_by: recyclePool?.handled_by ?? null,
      handled_note: recyclePool?.handled_note ?? null,
      supplier_id: item.products?.suppliers?.id ?? null,
      supplier_name: item.products?.suppliers?.name ?? '—',
      user_name: item.users?.name ?? item.users?.email ?? '未知用戶',
      user_id: item.users?.id ?? '',
    }
  })

  return NextResponse.json({ items, suppliers: suppliersData ?? [] })
}

/**
 * 批次標記回收品的去向。
 *
 * 這是「這批實體後來怎麼了」的唯一紀錄來源 —— 一番賞／自製賞的一般賞回收後
 * 平台白拿一件實體，退幣該給多少完全取決於這些貨有沒有真的變成收入。
 * 沒有這支 API，回收比例永遠只能用猜的。
 */
export async function PATCH(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const poolIds: number[] = Array.isArray(body?.pool_ids)
    ? body.pool_ids.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v))
    : []
  const status: string = String(body?.status ?? '')
  const note: string | null = body?.note ? String(body.note).slice(0, 500) : null

  if (poolIds.length === 0) {
    return NextResponse.json({ error: '沒有選取任何回收品' }, { status: 400 })
  }
  if (!VALID_STATUS.includes(status as RecycleStatus)) {
    return NextResponse.json({ error: '狀態值不正確' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const isPending = status === 'pending'

  // session 裡沒有 username（只有 adminId），經手人要去 admins 表拿
  const { data: adminRow } = await supabase
    .from('admins')
    .select('username')
    .eq('id', Number(admin.adminId))
    .single()
  const handledBy = adminRow?.username ?? String(admin.adminId)

  const { data, error } = await supabase
    .from('admin_recycle_pool')
    .update({
      status,
      // 退回待處理＝把處置紀錄一併清掉，不留下對不上的經手人
      handled_at: isPending ? null : new Date().toISOString(),
      handled_by: isPending ? null : handledBy,
      handled_note: isPending ? null : note,
    })
    .in('id', poolIds)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: admin.adminId,
    action: 'recycle_pool_status_update',
    targetType: 'admin_recycle_pool',
    targetId: poolIds.join(','),
    detail: { status, count: data?.length ?? 0, note },
    ip: getClientIp(request),
  })

  return NextResponse.json({ ok: true, updated: data?.length ?? 0 })
}
