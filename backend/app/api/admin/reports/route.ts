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
      const [rechargeRes, drawRes, newUserRes, totalUserRes, couponRes, historicalPayersRes] = await Promise.all([
        applyDateFilter(supabase.from('recharge_records').select('amount, user_id, status, created_at')),
        applyDateFilter(supabase.from('draw_records').select('id, user_id, prize_level, created_at, product:products(price)')),
        applyDateFilter(supabase.from('users').select('id, created_at')),
        supabase.from('users').select('id', { count: 'exact', head: true }),
        applyDateFilter(
          supabase.from('user_coupons').select('used_at, coupon:coupons(discount_type, discount_value)').eq('status', 'used'),
          'used_at'
        ),
        // 期間前曾付費的 user_id（用於判斷首次付費 vs 回購）
        start
          ? supabase.from('recharge_records').select('user_id').eq('status', 'success').lt('created_at', start)
          : Promise.resolve({ data: [] as { user_id: string }[], error: null }),
      ])

      if (rechargeRes.error) throw rechargeRes.error
      if (drawRes.error) throw drawRes.error
      if (newUserRes.error) throw newUserRes.error

      const recharges: any[] = rechargeRes.data ?? []
      const draws: any[] = drawRes.data ?? []
      const newUsers: any[] = newUserRes.data ?? []
      const totalMembers = totalUserRes.count ?? 0

      const completed = recharges.filter((r) => r.status === 'success')
      const totalRecharge = completed.reduce((s, r) => s + (r.amount || 0), 0)
      const totalRechargeCount = completed.length
      const totalTokenConsumed = draws.reduce((s, d: any) => s + (d.product?.price || 0), 0)
      const totalDraws = draws.length
      const uniquePayerSet = new Set(completed.map((r) => r.user_id))
      const uniquePayers = uniquePayerSet.size
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

      // ── 轉換漏斗 & 回購分析 ────────────────────────────────────────────
      // 期間前的歷史付費用戶
      const historicalPayerIds = new Set((historicalPayersRes.data ?? []).map((r: any) => r.user_id))

      // 首次付費用戶（生命週期第一次，不限當期新舊會員）
      const firstTimePayers = [...uniquePayerSet].filter(id => !historicalPayerIds.has(id)).length
      // 回購用戶（本期內付費 2 次以上）
      const payCountByUser: Record<string, number> = {}
      completed.forEach(r => { payCountByUser[r.user_id] = (payCountByUser[r.user_id] || 0) + 1 })
      const repeatPayersInPeriod = Object.values(payCountByUser).filter(c => c > 1).length
      const repurchaseRateInPeriod = uniquePayers > 0 ? Math.round(repeatPayersInPeriod / uniquePayers * 100) : 0
      const avgRechargesPerPayer = uniquePayers > 0
        ? Math.round(completed.length / uniquePayers * 10) / 10
        : 0

      // 新用戶首購時間分佈（新用戶在期間內的首次儲值距離註冊天數）
      const newUserMap: Record<string, string> = {}
      newUsers.forEach((u: any) => { newUserMap[u.id] = u.created_at })

      const firstRechargeByNewUser: Record<string, string> = {}
      completed.forEach(r => {
        if (newUserMap[r.user_id]) {
          if (!firstRechargeByNewUser[r.user_id] || r.created_at < firstRechargeByNewUser[r.user_id]) {
            firstRechargeByNewUser[r.user_id] = r.created_at
          }
        }
      })

      const daysToFirstPurchase = Object.entries(firstRechargeByNewUser).map(([uid, rechargeAt]) => {
        const diff = new Date(rechargeAt).getTime() - new Date(newUserMap[uid]).getTime()
        return diff / (1000 * 60 * 60 * 24)
      })

      const newUserConversionRate = newUsers.length > 0
        ? Math.round(daysToFirstPurchase.length / newUsers.length * 100)
        : 0
      const avgDaysToFirstPurchase = daysToFirstPurchase.length > 0
        ? Math.round(daysToFirstPurchase.reduce((s, d) => s + d, 0) / daysToFirstPurchase.length * 10) / 10
        : null
      const purchaseTimingDist = {
        sameDay:     daysToFirstPurchase.filter(d => d < 1).length,
        within3Days: daysToFirstPurchase.filter(d => d >= 1 && d < 3).length,
        within7Days: daysToFirstPurchase.filter(d => d >= 3 && d < 7).length,
        within30Days:daysToFirstPurchase.filter(d => d >= 7 && d < 30).length,
        over30Days:  daysToFirstPurchase.filter(d => d >= 30).length,
        neverConverted: newUsers.length - daysToFirstPurchase.length,
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
        funnel: {
          newUsers: newUsers.length,
          newUserConversionRate,       // 新用戶中有付費的 %
          newUserFirstPurchase: daysToFirstPurchase.length,
          avgDaysToFirstPurchase,      // null 表示沒有轉換
          purchaseTimingDist,
          uniquePayers,
          firstTimePayers,             // 生命週期首次付費
          repeatPayersInPeriod,        // 本期內付費 2+ 次
          repurchaseRateInPeriod,      // 本期回購率 %
          avgRechargesPerPayer,        // 本期平均儲值次數 / 付費用戶
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

    // ── 廠商結算 ────────────────────────────────────────────────────────────
    if (tab === 'settlement') {
      if (!supplierId) return NextResponse.json({ error: 'supplierId required' }, { status: 400 })

      const [supplierRes, drawRes, rechargeRes] = await Promise.all([
        supabase.from('suppliers').select('id, name').eq('id', supplierId).single(),
        applyDateFilter(
          supabase.from('draw_records')
            .select('product_id, created_at, product:products(id, name, price, supplier_id)')
        ),
        applyDateFilter(
          supabase.from('recharge_records').select('amount, status, created_at, payment_fee')
        ),
      ])
      if (drawRes.error) throw drawRes.error
      if (rechargeRes.error) throw rechargeRes.error

      // 消費明細：只算該廠商商品
      const draws: any[] = drawRes.data ?? []
      const supplierDraws = draws.filter(d => String(d.product?.supplier_id) === supplierId)

      const byProduct: Record<number, { name: string; price: number; drawCount: number; totalG: number }> = {}
      for (const d of supplierDraws) {
        const p = d.product
        if (!p) continue
        if (!byProduct[p.id]) byProduct[p.id] = { name: p.name, price: p.price || 0, drawCount: 0, totalG: 0 }
        byProduct[p.id].drawCount += 1
        byProduct[p.id].totalG += p.price || 0
      }

      const products = Object.entries(byProduct)
        .map(([id, v]) => ({ id: Number(id), ...v }))
        .sort((a, b) => b.totalG - a.totalG)

      const totalG = products.reduce((s, p) => s + p.totalG, 0)

      // 全平台消費 G（用於計算廠商消費佔比）
      const totalPlatformG = draws.reduce((s, d: any) => s + ((d.product?.price) || 0), 0)
      const consumptionShare = totalPlatformG > 0 ? totalG / totalPlatformG : 1

      // 儲值資料（僅作參考，不作結算基底）
      const recharges: any[] = rechargeRes.data ?? []
      const successRecharges = recharges.filter(r => r.status === 'success')
      const rechargeTotal = successRecharges.reduce((s, r) => s + (r.amount || 0), 0)
      const rechargeCount = successRecharges.length

      // 實際藍新手續費 → 按消費佔比分攤給廠商
      const rechargesWithFee = successRecharges.filter(r => r.payment_fee != null)
      const platformTotalFee = rechargesWithFee.reduce((s, r) => s + (r.payment_fee || 0), 0)
      const hasActualFee = rechargesWithFee.length > 0
      const allocatedActualFee = hasActualFee
        ? Math.round(platformTotalFee * consumptionShare)
        : null

      return NextResponse.json({
        supplierName: (supplierRes.data as any)?.name ?? '',
        products,
        totalG,
        totalPlatformG,
        consumptionShare,
        rechargeTotal,
        rechargeCount,
        hasActualFee,
        allocatedActualFee,
        platformTotalFee: hasActualFee ? platformTotalFee : null,
      })
    }

    // ── 用戶行為 ─────────────────────────────────────────────────────────────
    if (tab === 'behavior') {
      const applyBehaviorDate = (q: any) => {
        if (start) q = q.gte('created_at', start)
        if (endExclusive) q = q.lt('created_at', endExclusive)
        return q
      }

      // 熱門搜尋字（search 事件的 meta.query）
      const { data: searchEvents } = await applyBehaviorDate(
        supabase
          .from('user_events')
          .select('meta')
          .eq('event_type', 'search')
      )
      const queryCount = new Map<string, number>()
      for (const e of searchEvents ?? []) {
        const q = (e.meta as any)?.query
        if (q && typeof q === 'string' && q.trim()) {
          const k = q.trim().toLowerCase()
          queryCount.set(k, (queryCount.get(k) || 0) + 1)
        }
      }
      const topSearches = Array.from(queryCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([query, count]) => ({ query, count }))

      // 最多點擊系列
      const { data: clickEvents } = await applyBehaviorDate(
        supabase
          .from('user_events')
          .select('series')
          .in('event_type', ['product_click', 'series_click'])
          .not('series', 'is', null)
      )
      const seriesCount = new Map<string, number>()
      for (const e of clickEvents ?? []) {
        const s = e.series
        if (s) seriesCount.set(s, (seriesCount.get(s) || 0) + 1)
      }
      const topSeries = Array.from(seriesCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([series, count]) => ({ series, count }))

      // 點擊→抽轉化（同 product_id 先有 click 再有 draw 的 user 數）
      const { data: clickUsers } = await applyBehaviorDate(
        supabase
          .from('user_events')
          .select('user_id, product_id')
          .eq('event_type', 'product_click')
          .not('user_id', 'is', null)
          .not('product_id', 'is', null)
      )
      const { data: drawUsers } = await applyBehaviorDate(
        supabase
          .from('user_events')
          .select('user_id, product_id')
          .eq('event_type', 'draw')
          .not('user_id', 'is', null)
          .not('product_id', 'is', null)
      )
      const clickSet = new Set((clickUsers ?? []).map((e: any) => `${e.user_id}:${e.product_id}`))
      const drawSet = new Set((drawUsers ?? []).map((e: any) => `${e.user_id}:${e.product_id}`))
      const converted = [...drawSet].filter(k => clickSet.has(k)).length
      const clickTotal = clickSet.size
      const conversionRate = clickTotal > 0 ? Math.round((converted / clickTotal) * 1000) / 10 : 0

      // 每日活躍用戶數（DAU）
      const { data: dauEvents } = await applyBehaviorDate(
        supabase
          .from('user_events')
          .select('user_id, created_at')
          .not('user_id', 'is', null)
      )
      const dauMap = new Map<string, Set<string>>()
      for (const e of dauEvents ?? []) {
        const day = (e.created_at as string).slice(0, 10)
        if (!dauMap.has(day)) dauMap.set(day, new Set())
        dauMap.get(day)!.add(e.user_id)
      }
      const dailyActiveUsers = Array.from(dauMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, users]) => ({ date, count: users.size }))

      return NextResponse.json({ topSearches, topSeries, conversionRate, clickTotal, converted, dailyActiveUsers })
    }

    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
  } catch (error: any) {
    console.error('Reports API error:', error)
    return NextResponse.json({ error: error.message || '載入失敗' }, { status: 500 })
  }
}
