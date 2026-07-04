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
  const productType = searchParams.get('type')

  const supabase = getSupabaseAdmin()

  // 取得機器人 user_id，所有財務/行為數據查詢排除機器人
  const { data: botRows } = await supabase.from('users').select('id').eq('is_bot', true)
  const botIds = (botRows ?? []).map((r: any) => r.id as string)
  const excBot = (q: any) => botIds.length > 0 ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q

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
        excBot(supabase.from('recharge_records').select('*, user:users(id, name, email)').order('created_at', { ascending: false }))
      )
      if (error) throw error
      return NextResponse.json({ data: data ?? [] })
    }

    // ── 消費明細 ────────────────────────────────────────────────────────────
    if (tab === 'consumption') {
      const { data, error } = await applyDateFilter(
        excBot(supabase.from('draw_records').select('*, user:users(id, name, email), product:products(id, name, price)').order('created_at', { ascending: false }))
      )
      if (error) throw error
      return NextResponse.json({ data: data ?? [] })
    }

    // ── 營運總覽 ────────────────────────────────────────────────────────────
    if (tab === 'overview' || tab === 'summary') {
      const [rechargeRes, drawRes, newUserRes, totalUserRes, couponRes, historicalPayersRes] = await Promise.all([
        applyDateFilter(excBot(supabase.from('recharge_records').select('amount, user_id, status, created_at'))),
        applyDateFilter(excBot(supabase.from('draw_records').select('id, user_id, prize_level, created_at, product:products(price)'))),
        applyDateFilter(supabase.from('users').select('id, created_at').or('is_bot.eq.false,is_bot.is.null')),
        supabase.from('users').select('id', { count: 'exact', head: true }).or('is_bot.eq.false,is_bot.is.null'),
        applyDateFilter(
          supabase.from('user_coupons').select('used_at, coupon:coupons(discount_type, discount_value)').eq('status', 'used'),
          'used_at'
        ),
        // 期間前曾付費的 user_id（用於判斷首次付費 vs 回購）
        start
          ? excBot(supabase.from('recharge_records').select('user_id').eq('status', 'success').lt('created_at', start))
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
      // 1. 期間內抽獎紀錄（含商品價格），排除機器人；嘗試含 points_used
      let draws: any[] = []
      let hasPointsData = false
      try {
        const { data, error } = await applyDateFilter(
          excBot(supabase.from('draw_records').select('product_id, points_used, product:products(id, name, price, type, category, total_count, remaining, supplier_id)'))
        )
        if (error) throw error
        draws = data ?? []
        hasPointsData = true
      } catch {
        const { data, error } = await applyDateFilter(
          excBot(supabase.from('draw_records').select('product_id, product:products(id, name, price, type, category, total_count, remaining, supplier_id)'))
        )
        if (error) throw error
        draws = data ?? []
      }

      // 2. 所有商品（含廠商）— 用於顯示零抽獎商品與廠商名稱
      let productQuery = supabase
        .from('products')
        .select('id, name, type, category, total_count, remaining, supplier_id, supplier:suppliers(id, name)')
        .eq('is_active', true)
      if (supplierId) productQuery = productQuery.eq('supplier_id', supplierId)
      if (productType) productQuery = productQuery.eq('type', productType)
      const { data: products, error: prodErr } = await productQuery
      if (prodErr) throw prodErr

      // 3. 在 JS 端彙整
      const statsMap: Record<number, { drawCount: number; revenue: number; pointsUsed: number }> = {}
      for (const d of draws) {
        const pid = (d as any).product_id
        if (!pid) continue
        if (!statsMap[pid]) statsMap[pid] = { drawCount: 0, revenue: 0, pointsUsed: 0 }
        statsMap[pid].drawCount += 1
        statsMap[pid].revenue += (d as any).product?.price || 0
        if (hasPointsData) statsMap[pid].pointsUsed += (d as any).points_used || 0
      }

      const rows = (products ?? []).map((p: any) => {
        const stats = statsMap[p.id] ?? { drawCount: 0, revenue: 0, pointsUsed: 0 }
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
          pointsUsed: stats.pointsUsed,
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

      const [supplierRes, drawRes, rechargeRes, recycleRes, ordersRes] = await Promise.all([
        supabase.from('suppliers').select('id, name').eq('id', supplierId).single(),
        applyDateFilter(
          excBot(supabase.from('draw_records')
            .select('product_id, created_at, product:products(id, name, price, supplier_id)'))
        ),
        applyDateFilter(
          excBot(supabase.from('recharge_records').select('amount, status, created_at, payment_fee'))
        ),
        applyDateFilter(
          supabase.from('admin_recycle_pool')
            .select('recycle_value, product:products(supplier_id)')
        ),
        applyDateFilter(
          supabase.from('orders')
            .select('coupon_discount, total_amount')
            .eq('supplier_id', supplierId)
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

      // 分解退代幣（廠商須吸收，從結算中扣除）
      const dismantleTotal = (recycleRes.data ?? [])
        .filter((r: any) => String(r.product?.supplier_id) === supplierId)
        .reduce((s: number, r: any) => s + (r.recycle_value || 0), 0)

      // 折價券 & 運費（雙方各吸收一半）
      const supplierOrders: any[] = ordersRes.data ?? []
      const couponTotal = supplierOrders.reduce((s, r) => s + (r.coupon_discount || 0), 0)
      const shippingTotal = supplierOrders.reduce((s, r) => s + (r.total_amount || 0), 0)

      // 積分支付（需 migration 238：draw_records.points_used 欄位）
      let pointsTotal = 0
      try {
        const pointsQ = applyDateFilter(
          excBot(supabase.from('draw_records').select('points_used, product:products(supplier_id)'))
        )
        const { data: pointsRows } = await pointsQ
        pointsTotal = (pointsRows ?? [])
          .filter((d: any) => String(d.product?.supplier_id) === supplierId)
          .reduce((s: number, d: any) => s + (d.points_used || 0), 0)
      } catch (_) {
        // column not yet added; return 0
      }

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
        dismantleTotal,
        couponTotal,
        shippingTotal,
        pointsTotal,
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

    // ── 分解明細 ────────────────────────────────────────────────────────────
    if (tab === 'dismantled') {
      let query = supabase
        .from('admin_recycle_pool')
        .select('id, recycle_value, created_at, prize_name, prize_level, user_id, product_id, product:products(id, name, supplier_id, supplier:suppliers(id, name)), user:users(id, name)')
        .order('created_at', { ascending: false })

      if (start) query = query.gte('created_at', start)
      if (endExclusive) query = query.lt('created_at', endExclusive)

      const { data, error } = await query
      if (error) throw error

      const rows = (data ?? []).map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        prize_name: r.prize_name,
        prize_level: r.prize_level,
        recycle_value: r.recycle_value,
        user_id: r.user_id,
        userName: r.user?.name || '—',
        product_id: r.product_id,
        productName: r.product?.name || '—',
        supplierId: r.product?.supplier_id ?? null,
        supplierName: r.product?.supplier?.name ?? '—',
      }))

      // 可依廠商篩選
      const filtered = supplierId ? rows.filter((r: any) => String(r.supplierId) === supplierId) : rows
      const totalTokens = filtered.reduce((s: number, r: any) => s + (r.recycle_value || 0), 0)

      return NextResponse.json({ data: filtered, totalTokens })
    }

    if (tab === 'points') {
      let query = supabase
        .from('user_task_progress')
        .select('id, last_updated, reward_coins:task_id(reward_coins, title, type), user:user_id(name)')
        .eq('is_claimed', true)
        .order('last_updated', { ascending: false })

      if (start) query = query.gte('last_updated', start)
      if (endExclusive) query = query.lt('last_updated', endExclusive)

      const { data, error } = await query
      if (error) throw error

      const rows = (data ?? []).map((r: any) => ({
        id: r.id,
        claimed_at: r.last_updated,
        user_name: r.user?.name || '—',
        task_title: r.reward_coins?.title || '—',
        task_type: r.reward_coins?.type || '—',
        reward_coins: r.reward_coins?.reward_coins ?? 0,
      }))

      return NextResponse.json({ data: rows, totalPoints: rows.reduce((s: number, r: any) => s + r.reward_coins, 0) })
    }

    if (tab === 'coupons_report') {
      let query = supabase
        .from('user_coupons')
        .select('id, created_at, used_at, expiry_date, status, coupon:coupon_id(code, title, discount_type, discount_value), user:user_id(name)')
        .order('created_at', { ascending: false })

      if (start) query = query.gte('created_at', start)
      if (endExclusive) query = query.lt('created_at', endExclusive)

      const { data, error } = await query
      if (error) throw error

      const rows = (data ?? []).map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        used_at: r.used_at,
        expiry_date: r.expiry_date,
        status: r.status,
        user_name: r.user?.name || '—',
        coupon_code: r.coupon?.code || '—',
        coupon_title: r.coupon?.title || '—',
        discount_type: r.coupon?.discount_type || '—',
        discount_value: r.coupon?.discount_value ?? 0,
      }))

      return NextResponse.json({ data: rows })
    }

    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
  } catch (error: any) {
    console.error('Reports API error:', error)
    return NextResponse.json({ error: error.message || '載入失敗' }, { status: 500 })
  }
}
