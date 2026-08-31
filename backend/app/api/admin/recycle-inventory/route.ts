import { NextResponse } from 'next/server'
import { requireAdminScope, ScopeError } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 回收品項管理（實體盤點）
 *
 * ## 為什麼是獨立一支 route，不是掛在 /api/admin/dismantled 底下
 *
 * 廠商帳號要看自己的回收品（老闆 2026-08-31），而 middleware 對廠商是**白名單**：
 * 放行的是「前綴」。`/api/admin/dismantled` 底下同時有「回收紀錄」的 GET，
 * 那支回的是逐筆紀錄，帶玩家暱稱、會員編號與 UUID —— 放行前綴等於連玩家名單
 * 一起給出去。拆成兩支，白名單只放這一支。
 *
 * ## 處置是「負責方制」（migration 663）
 *
 * 誰的貨誰處理：吉吉比的貨平台處理，第三方廠商的貨廠商自己處理。
 * 所以廠商標得動自己的，但只有自己的 —— 寫入前一定要驗貨主。
 */

/** 處置只有兩種（migration 662）。reused／scrapped 是舊值，DB 還收得下但不再寫入 */
const VALID_STATUS = ['pending', 'handled'] as const
type RecycleStatus = (typeof VALID_STATUS)[number]

export async function GET() {
  let scope
  try {
    scope = await requireAdminScope()
  } catch (err) {
    if (err instanceof ScopeError) return NextResponse.json({ error: err.message }, { status: 403 })
    throw err
  }
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  /*
   * 收斂在**伺服器端**做，不是把全部撈回來讓前端篩 ——
   * 前端篩掉的資料還是進過瀏覽器，打開 devtools 就看得到別家的庫存。
   * RPC 本來就吃 p_supplier_id（migration 618）。
   */
  const [{ data: rows, error }, { data: suppliersData }] = await Promise.all([
    supabase.rpc('recycle_inventory_summary', {
      p_include_restocked: false,   // 轉蛋／盒玩回收後已還回原商品，這頁永遠不列
      p_supplier_id: scope.supplierScope ?? null,
    }),
    // is_platform 要回給前端 —— 廠商下拉預設選吉吉比，靠這個旗標認，不是寫死 id
    scope.supplierScope === undefined
      ? supabase.from('suppliers').select('id, name, is_platform').order('name')
      : supabase.from('suppliers').select('id, name, is_platform').eq('id', scope.supplierScope),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    rows: rows ?? [],
    suppliers: suppliersData ?? [],
    isSupplier: scope.isSupplier,
  })
}

/**
 * 標記處置狀態。以**品項**為單位整批標 —— 這頁一列代表「這個賞回收回來的所有件數」，
 * 一件一件標沒有意義。
 *
 * 兩種指定方式：
 *   { product_prize_id, status }
 *   { product_id, prize_level, prize_name, status }   早期資料沒有 product_prize_id
 */
export async function PATCH(request: Request) {
  let scope
  try {
    scope = await requireAdminScope()
  } catch (err) {
    if (err instanceof ScopeError) return NextResponse.json({ error: err.message }, { status: 403 })
    throw err
  }
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const productPrizeId = Number.isFinite(Number(body?.product_prize_id)) ? Number(body.product_prize_id) : null
  const productId      = Number.isFinite(Number(body?.product_id))       ? Number(body.product_id)       : null
  const prizeLevel     = body?.prize_level != null ? String(body.prize_level) : null
  const prizeName      = body?.prize_name  != null ? String(body.prize_name)  : null
  const status: string = String(body?.status ?? '')
  const note: string | null = body?.note ? String(body.note).slice(0, 500) : null

  const byPrize  = productPrizeId !== null
  const byLegacy = !byPrize && productId !== null && prizeLevel !== null && prizeName !== null

  if (!byPrize && !byLegacy) {
    return NextResponse.json({ error: '沒有指定要標記的品項' }, { status: 400 })
  }
  if (!VALID_STATUS.includes(status as RecycleStatus)) {
    return NextResponse.json({ error: '狀態值不正確' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  /*
   * 貨主驗證。讀取靠 RPC 收斂就夠（看不到就是看不到），但寫入不一樣 ——
   * 廠商可以直接送一個別家的 product_prize_id 進來。
   */
  let targetProductId = productId
  if (byPrize) {
    const { data: prizeRow } = await supabase
      .from('product_prizes')
      .select('product_id')
      .eq('id', productPrizeId)
      .single()
    if (!prizeRow) return NextResponse.json({ error: '找不到該品項' }, { status: 404 })
    targetProductId = prizeRow.product_id
  }

  const { data: productRow } = await supabase
    .from('products')
    .select('supplier_id')
    .eq('id', targetProductId)
    .single()
  if (!productRow) return NextResponse.json({ error: '找不到該商品' }, { status: 404 })

  if (scope.supplierScope !== undefined && productRow.supplier_id !== scope.supplierScope) {
    return NextResponse.json({ error: '這不是貴公司的商品' }, { status: 403 })
  }

  // session 裡沒有 username（只有 adminId），經手人要去 admins 表拿
  const { data: adminRow } = await supabase
    .from('admins')
    .select('username')
    .eq('id', Number(scope.adminId))
    .single()
  const handledBy = adminRow?.username ?? String(scope.adminId)
  const isPending = status === 'pending'

  let query = supabase
    .from('admin_recycle_pool')
    .update({
      status,
      // 退回待處理＝把處置紀錄一併清掉，不留下對不上的經手人
      handled_at: isPending ? null : new Date().toISOString(),
      handled_by: isPending ? null : handledBy,
      handled_note: isPending ? null : note,
    })

  if (byPrize) {
    query = query.eq('product_prize_id', productPrizeId)
  } else {
    // 早期資料沒有 product_prize_id，只能靠「商品＋賞等＋品項名」認回同一批
    query = query
      .eq('product_id', productId)
      .eq('prize_level', prizeLevel)
      .eq('prize_name', prizeName)
      .is('product_prize_id', null)
  }

  const { data, error } = await query.select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: scope.adminId,
    action: 'recycle_disposition_update',
    targetType: 'admin_recycle_pool',
    targetId: byPrize ? `prize:${productPrizeId}` : `product:${productId}`,
    detail: { status, count: data?.length ?? 0, note, product_prize_id: productPrizeId, product_id: productId },
    ip: getClientIp(request),
  })

  return NextResponse.json({ ok: true, updated: data?.length ?? 0 })
}
