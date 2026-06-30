import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET(request: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'overview'
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const supplierId = searchParams.get('supplierId')
  const category = searchParams.get('category')

  const supabase = getSupabaseAdmin()

  // end date is inclusive — add 1 day for lt comparison
  const endExclusive = end
    ? new Date(new Date(end).getTime() + 86400000).toISOString().split('T')[0]
    : null

  const applyDateFilter = <T extends ReturnType<typeof supabase.from>>(q: any, field = 'created_at') => {
    if (start) q = q.gte(field, start)
    if (endExclusive) q = q.lt(field, endExclusive)
    return q
  }

  try {
    // ── 儲值明細 ────────────────────────────────────────────────────────────
    if (tab === 'recharge') {
      const { data, error } = await applyDateFilter(
        supabase.from('recharge_records').select('*, user:users(id, name, email)').order('created_at', { ascending: false })
      )
      if (error) throw error
      return NextResponse.json({ data: data ?? [] })
    }

    // ── 消費明細 ────────────────────────────────────────────────────────────
    if (tab === 'consumption') {
      const { data, error } = await applyDateFilter(
        supabase.from('draw_records').select('*, user:users(id, name, email), product:products(id, name, price)').order('created_at', { ascending: false })
      )
      if (error) throw error
      return NextResponse.json({ data: data ?? [] })
    }

    // ── 營運總覽 ────────────────────────────────────────────────────────────
    if (tab === 'overview' || tab === 'summary') {
      const [rechargeRes, drawRes, newUserRes, totalUserRes, couponRes] = await Promise.all([
        applyDateFilter(supabase.from('recharge_records').select('amount, user_id, status, created_at')),
        applyDateFilter(supabase.from('draw_records').select('id, user_id, prize_level, created_at, product:products(price)')),
        applyDateFilter(supabase.from('users').select('id, created_at')),
        supabase.from('users').select('id', { count: 'exact', head: true }),
        applyDateFilter(
          supabase.from('user_coupons').select('used_at, coupon:coupons(discount_type, discount_value)').eq('status', 'used'),
          'used_at'
        ),
      ])

      if (rechargeRes.error) throw rechargeRes.error
      if (drawRes.error) throw drawRes.error
      if (newUserRes.error) throw newUserRes.error

      const recharges: any[] = rechargeRes.data ?? []
      const draws: any[] = drawRes.data ?? []
      const newUsers: any[] = newUserRes.data ?? []
      const totalMembers = totalUserRes.count ?? 0

      const completed = recharges.filter((r) => r.status === 'completed')
      const totalRecharge = completed.reduce((s, r) => s + (r.amount || 0), 0)
      const totalRechargeCount = completed.length
      const totalTokenConsumed = draws.reduce((s, d: any) => s + (d.product?.price || 0), 0)
      const totalDraws = draws.length
      const uniquePayers = new Set(completed.map((r) => r.user_id)).size
      const avgPerPayer = uniquePayers > 0 ? Math.round(totalRecharge / uniquePayers) : 0
      const avgTokenPerDraw = totalDraws > 0 ? Math.round(totalTokenConsumed / totalDraws) : 0

      // 折價券折損（僅 fixed 類型可直接加總）
      let couponDiscountFixed = 0
      let couponDiscountPercentageCount = 0
      if (!couponRes.error) {
        for (const uc of couponRes.data ?? []) {
          const c = (uc as any).coupon
          if (!c) continue
          if (c.discount_type === 'fixed') couponDiscountFixed += Number(c.discount_value) || 0
          else couponDiscountPercentageCount += 1
        }
      }

      // 每日明細
      const byDay: Record<string, { recharge: number; draws: number; newUsers: number }> = {}
      const ensureDay = (iso: string) => {
        const d = iso.split('T')[0]
        if (!byDay[d]) byDay[d] = { recharge: 0, draws: 0, newUsers: 0 }
        return d
      }
      completed.forEach((r) => { byDay[ensureDay(r.created_at)].recharge += r.amount || 0 })
      draws.forEach((d) => { byDay[ensureDay(d.created_at)].draws += 1 })
      newUsers.forEach((u) => { byDay[ensureDay(u.created_at)].newUsers += 1 })

      const dailyBreakdown = Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }))

      return NextResponse.json({
        overview: {
          totalRecharge,
          totalRechargeCount,
          avgPerPayer,
          totalTokenConsumed,
          totalDraws,
          avgTokenPerDraw,
          newUserCount: newUsers.length,
          totalMembers,
          uniquePayers,
          couponDiscountFixed,
          couponDiscountPercentageCount,
        },
        dailyBreakdown,
      })
    }

    // ── 商品表現 ────────────────────────────────────────────────────────────
    if (tab === 'products') {
      // 1. 期間內抽獎紀錄（含商品價格）
      const { data: draws, error: drawErr } = await applyDateFilter(
        supabase.from('draw_records').select('product_id, created_at, product:products(id, name, price, type, category, total_count, remaining, supplier_id)')
      )
      if (drawErr) throw drawErr

      // 2. 所有商品（含廠商）— 用於顯示零抽獎商品與廠商名稱
      let productQuery = supabase
        .from('products')
        .select('id, name, type, category, total_count, remaining, supplier_id, supplier:suppliers(id, name)')
        .eq('is_active', true)
      if (supplierId) productQuery = productQuery.eq('supplier_id', supplierId)
      if (category) productQuery = productQuery.eq('category', category)
      const { data: products, error: prodErr } = await productQuery
      if (prodErr) throw prodErr

      // 3. 在 JS 端彙整
      const statsMap: Record<number, { drawCount: number; revenue: number }> = {}
      for (const d of draws ?? []) {
        const pid = (d as any).product_id
        if (!pid) continue
        if (!statsMap[pid]) statsMap[pid] = { drawCount: 0, revenue: 0 }
        statsMap[pid].drawCount += 1
        statsMap[pid].revenue += (d as any).product?.price || 0
      }

      const rows = (products ?? []).map((p: any) => {
        const stats = statsMap[p.id] ?? { drawCount: 0, revenue: 0 }
        const drawn = (p.total_count || 0) - (p.remaining || 0)
        const completionRate = p.total_count > 0 ? Math.round((drawn / p.total_count) * 100) : 0
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          category: p.category,
          supplierName: p.supplier?.name ?? null,
          drawCount: stats.drawCount,
          revenue: stats.revenue,
          remaining: p.remaining ?? 0,
          totalCount: p.total_count ?? 0,
          completionRate,
        }
      })

      // 依消費金額降冪
      rows.sort((a: any, b: any) => b.revenue - a.revenue)

      // 篩選：只回傳有廠商篩選或全部
      return NextResponse.json({ data: rows })
    }

    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
  } catch (error: any) {
    console.error('Reports API error:', error)
    return NextResponse.json({ error: error.message || '載入失敗' }, { status: 500 })
  }
}
