import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope, ScopeError } from '@/lib/requireAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const scope = await requireAdminScope()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getSupabaseAdmin()

    /*
     * 商品與訂單依廠商範圍限縮。
     *
     * 這支原本只驗 session 不看角色，回的是全站數字 —— 之前只有 count 還好，
     * 現在要多回「系統警示」與「待配送」兩份**清單**（帶商品名與收件人），
     * 不限縮的話廠商帳號從 header 就看得到別家的商品名與訂單。
     */
    const scoped = (q: any) => scope.supplierScope != null ? q.eq('supplier_id', scope.supplierScope) : q

    const [
      { count: pendingShipments },
      { count: lowInventory },
      { count: pendingRefunds },
      { count: pendingSettlements },
      { count: totalMembers },
      { count: pendingRechargeReview },
      { count: onlineCount },
      { data: settlementItems },
      { data: refundItems },
      { data: rechargeItems },
    ] = await Promise.all([
      scoped(supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted')),
      scoped(supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .gt('total_count', 0)
        .lte('remaining', 3)
        .neq('status', 'archived')),
      supabase
        .from('refund_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('settlement_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft'),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .or('is_bot.is.null,is_bot.eq.false'),
      supabase
        .from('recharge_records')
        .select('id', { count: 'exact', head: true })
        .eq('needs_review', true)
        .eq('status', 'pending'),
      supabase
        .from('visit_logs')
        .select('id, users!inner(is_bot)', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
        .or('is_bot.is.null,is_bot.eq.false', { referencedTable: 'users' }),
      // 下列三份清單原本由前端 anon client 讀取，三個表都是 RLS 開啟且無 anon policy，
      // 會靜默回空陣列。且其中兩支還選了不存在的欄位（見下方各自註解），
      // 兩個原因都會造成「badge 有數字、展開沒資料」。改由此處 service role 供應。
      supabase
        // 無 period_month / total_revenue 欄位；期間是 period_start~period_end，
        // 金額用 total_g（廠商營收 G），supplier_name 已反正規化，不需 embed
        .from('settlement_snapshots')
        .select('id, period_start, period_end, total_g, supplier_name')
        .eq('status', 'draft')
        .order('period_end', { ascending: false })
        .limit(10),
      supabase
        // 金額欄位是 amount_twd 不是 amount；user_id 的 FK 指向 auth.users，
        // 無法 embed public.users，暱稱另外查（見下方 refundUserNames）
        .from('refund_requests')
        .select('id, user_id, amount_twd, reason, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('recharge_records')
        .select('id, amount, payment_method, created_at, user:users(name)')
        .eq('needs_review', true)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    /*
     * ── 系統警示與待配送：原本在瀏覽器用 anon key 直接查，兩支都是壞的 ──
     *
     *   products ── RLS 擋掉，回 401（migration 471 之後 `select('*')` 會展開到
     *               anon 沒有授權的 seed / cost / profit_rate 三欄），header 的
     *               低庫存與高配率警示鈴鐺**永遠是空的**
     *   orders   ── RLS 只讓玩家看自己的訂單，回 `[]` 而且不報錯，
     *               所以「配送待辦」永遠是 0（實測 STG 有 3 筆 submitted）
     *
     * 順帶一提舊查詢寫的是 `items:order_items(*)`，而 `order_items` 是空表 ——
     * 訂單品項實際掛在 `draw_records.order_id`，所以就算 RLS 放行，
     * 展開後每一筆的數量也都會是 0。三個毛病一起修，改由這裡 service role 供應。
     *
     * 只挑需要的欄位，不用 `*`：header 每頁都會打這支。
     */
    const [productRows, shipmentRows] = await Promise.all([
      fetchAllRows<any>(() => scoped(supabase
        .from('products')
        .select('id, name, status, type, remaining, sales, prizes:product_prizes(level, total, remaining, probability)'))),
      fetchAllRows<any>(() => scoped(supabase
        .from('orders')
        .select('id, order_number, user_id, recipient_name, recipient_phone, address, submitted_at, created_at, user:users(name, email), items:draw_records(id, prize_name, product:products(name))')
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true }))),
    ])

    type Alert = {
      type: 'high-rate' | 'low-stock'
      product: string; productId: number
      level?: string; rate?: number; threshold?: number; remaining?: number
      severity: 'high' | 'medium'
    }
    const alertItems: Alert[] = []
    for (const p of productRows) {
      // 低庫存（剩不到 5 份）
      if (p.status === 'active' && p.remaining > 0 && p.remaining < 5) {
        alertItems.push({
          type: 'low-stock', product: p.name, productId: p.id,
          remaining: p.remaining, threshold: 5,
          severity: p.remaining < 3 ? 'high' : 'medium',
        })
      }
      // 轉蛋沒有賞等的概念，只看庫存
      if (p.type === 'gacha' || !p.sales) continue
      for (const pz of (p.prizes ?? [])) {
        const sold = (pz.total ?? 0) - (pz.remaining ?? 0)
        if (sold <= 0 || !(pz.probability > 0)) continue
        const actual = sold / p.sales * 100
        const threshold = pz.probability * 1.3
        if (actual > threshold) {
          alertItems.push({
            type: 'high-rate', product: p.name, productId: p.id, level: pz.level,
            rate: Number(actual.toFixed(2)), threshold: Number(threshold.toFixed(2)),
            severity: actual > pz.probability * 1.8 ? 'high' : 'medium',
          })
        }
      }
    }
    alertItems.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1))

    /*
     * 品項壓成 { product, prize } —— header 的下拉就是照這兩個欄位印的。
     * 舊查詢展開的是空表 `order_items`，所以那兩行永遠印成「• - 」，
     * 清單根本沒出現過也就沒人發現。
     */
    const shipmentItems = shipmentRows.map((o: any) => ({
      ...o,
      // 缺的欄位留 null，讓畫面自己決定怎麼併，不要在這裡塞破折號
      // （商品被刪掉的舊抽獎紀錄會沒有商品名，硬塞會印出「— - —」）
      items: (o.items ?? []).map((it: any) => ({
        product: it.product?.name ?? null,
        prize: it.prize_name ?? null,
      })),
    }))

    // 退款的使用者暱稱：FK 指向 auth.users 故無法 embed，改以 user_id 反查 public.users
    const refundUserIds = [...new Set((refundItems ?? []).map((r: any) => r.user_id).filter(Boolean))]
    let refundNameMap: Record<string, string> = {}
    if (refundUserIds.length > 0) {
      const { data: us } = await supabase.from('users').select('id, name').in('id', refundUserIds)
      refundNameMap = Object.fromEntries((us ?? []).map((u: any) => [u.id, u.name]))
    }
    const refundItemsWithUser = (refundItems ?? []).map((r: any) => ({
      ...r,
      user: { name: refundNameMap[r.user_id] ?? '—' },
    }))

    return NextResponse.json({
      pendingShipments:     pendingShipments     ?? 0,
      lowInventory:         lowInventory         ?? 0,
      pendingRefunds:       pendingRefunds        ?? 0,
      pendingSettlements:   pendingSettlements    ?? 0,
      totalMembers:          totalMembers          ?? 0,
      onlineCount:           onlineCount           ?? 0,
      pendingRechargeReview: pendingRechargeReview ?? 0,
      settlementItems:       settlementItems       ?? [],
      refundItems:           refundItemsWithUser,
      rechargeItems:         rechargeItems         ?? [],
      alertItems,
      shipmentItems,
    })
  } catch (e: any) {
    if (e instanceof ScopeError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
