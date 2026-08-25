import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { getSettlementDefaults, resolveRates } from '@/lib/settlementRates'

export async function GET(request: NextRequest) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'overview'
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  // 廠商帳號不管網址帶什麼 supplierId，一律看自己那家。
  // 只靠前端下拉限制是不夠的 —— 網址參數改一下就繞過去了
  const supplierId = scope?.supplierScope != null
    ? String(scope.supplierScope)
    : searchParams.get('supplierId')
  const productType = searchParams.get('type')

  /*
   * 廠商帳號只能看結算，其他分頁一律 403。
   *
   * middleware 為了結算頁把整個 /api/admin/reports 放行給廠商，但這支
   * route 底下還有 overview／behavior／products 等分頁，回的是**全平台**
   * 數字（總儲值、總消費、總會員、漏斗…）而且完全沒有依 supplier 限縮 ——
   * 廠商換個 tab 參數就全看到了，比從結算頁反推平台營收還直接。
   *
   * 白名單只能管到路徑，管不到 query，所以這一層要在 route 自己擋。
   */
  if (scope.isSupplier && tab !== 'settlement') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseAdmin()

  // 取得機器人 user_id，所有財務/行為數據查詢排除機器人
  const { data: botRows } = await supabase.from('users').select('id').eq('is_bot', true)
  const botIds = (botRows ?? []).map((r: any) => r.id as string)
  const excBot = (q: any) => botIds.length > 0 ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q

  // UI 傳來的日期字串是台灣日期（e.g. "2026-07-07"），
  // JS 會解析成 UTC 午夜，但台灣午夜 = UTC-8h。修正時區偏移。
  const TW_OFFSET_MS = 8 * 3600_000
  const startUtc = start
    ? new Date(new Date(start).getTime() - TW_OFFSET_MS).toISOString()
    : null
  const endExclusiveUtc = end
    ? new Date(new Date(end).getTime() + 86400_000 - TW_OFFSET_MS).toISOString()
    : null

  const applyDateFilter = <T extends ReturnType<typeof supabase.from>>(q: any, field = 'created_at') => {
    if (startUtc) q = q.gte(field, startUtc)
    if (endExclusiveUtc) q = q.lt(field, endExclusiveUtc)
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
        applyDateFilter(excBot(supabase.from('draw_records').select('id, user_id, prize_level, created_at, points_used, product:products(price)'))),
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
      // 使用 points_used（實際消費G），fallback 到 product.price 相容舊資料
      const totalTokenConsumed = draws.reduce((s, d: any) => s + (d.points_used || d.product?.price || 0), 0)
      const totalDraws = draws.length
      const uniquePayerSet = new Set(completed.map((r) => r.user_id))
      const uniquePayers = uniquePayerSet.size
      // 參與玩家 = 有抽獎紀錄的不重複真人玩家數（CLAUDE.md 定義）
      const uniqueDrawers = new Set(draws.map((d: any) => d.user_id)).size
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
          uniqueDrawers,
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
        .neq('type', 'slot')
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

      // 4. 老虎機（slot_spin_logs 流水彙總，消費金額 = 投注 + 直衝 − 退幣）
      if ((!productType || productType === 'slot') && start && end) {
        const [slotRes, machinesRes] = await Promise.all([
          supabase.rpc('get_slot_machine_report', { p_start: start, p_end: end }),
          supabase.from('slot_machines').select('id, supplier_id, supplier:suppliers(id, name)'),
        ])
        if (!slotRes.error) {
          const machineMap = new Map<number, any>(
            (machinesRes.data ?? []).map((m: any) => [m.id, m])
          )
          for (const r of slotRes.data ?? []) {
            const m = machineMap.get(r.machine_id)
            if (supplierId && String(m?.supplier_id ?? '') !== supplierId) continue
            const drawCount = (r.spins ?? 0) + (r.direct_count ?? 0)
            if (!r.is_active && drawCount === 0) continue
            ;(rows as any[]).push({
              id: `slot-${r.machine_id}`,
              name: `${r.theme_name || r.machine_name}${r.machine_number ? ` ${r.machine_number}號機` : ''}`,
              type: 'slot',
              category: null,
              supplierName: m?.supplier?.name ?? null,
              drawCount,
              revenue: (r.bet_total ?? 0) + (r.direct_total ?? 0) - (r.coin_return_total ?? 0),
              pointsUsed: 0,
              remaining: null,
              totalCount: null,
              completionRate: null,
            })
          }
        }
      }

      // 依消費金額降冪
      rows.sort((a: any, b: any) => b.revenue - a.revenue)

      // 篩選：只回傳有廠商篩選或全部
      return NextResponse.json({ data: rows })
    }

    // ── 廠商結算 ────────────────────────────────────────────────────────────
    if (tab === 'settlement') {
      if (!supplierId) return NextResponse.json({ error: 'supplierId required' }, { status: 400 })

      /*
       * 全部走 fetchAllRows —— PostgREST 預設只回 1000 列且靜默截斷，
       * 這些資料是拿來加總算廠商分潤的，過千就會少算。
       * 實測某廠商整年 totalG 應為 114,940，截斷後只剩 32,950（少 71%），
       * 等於分潤基底被砍掉七成。
       */
      const [supplierRes, drawRows, rechargeRows, recycleRows, orderRows] = await Promise.all([
        supabase.from('suppliers')
          .select('id, name, profit_share_percent, withholding_rate_percent, points_deduction_mode, recycle_settlement_mode, recycle_margin_supplier_share')
          .eq('id', supplierId).single(),
        fetchAllRows<any>(() => applyDateFilter(
          excBot(supabase.from('draw_records')
            .select('product_id, created_at, product:products(id, name, price, supplier_id, type)'))
        )),
        fetchAllRows<any>(() => applyDateFilter(
          excBot(supabase.from('recharge_records').select('amount, status, created_at, payment_fee'))
        )),
        fetchAllRows<any>(() => applyDateFilter(
          supabase.from('admin_recycle_pool')
            .select('recycle_value, unit_price, margin, trigger, product:products(supplier_id)')
        )),
        /*
         * orders 這支容錯：STG 與 PROD 的 orders schema 不一樣 ——
         * PROD 有 coupon_discount／total_amount／supplier_id，STG 沒有（只有 shipping_fee）。
         * 以前錯誤被靜默吞掉（原本只檢查 drawRes／rechargeRes 的 error），
         * 所以 STG 上折價券與運費一直是 0 卻沒人發現；
         * 改用會拋錯的 fetchAllRows 之後，這支就會把整個結算 API 打成 500。
         *
         * 這裡吞掉並記一筆 warn：schema 對不齊是另一件事，不該讓結算頁開不起來。
         * ⚠️ 兩環境的 orders 結構要不要對齊，待老闆決定。
         */
        fetchAllRows<any>(() => applyDateFilter(
          supabase.from('orders')
            .select('coupon_discount, total_amount')
            .eq('supplier_id', supplierId)
        )).catch((e: any) => {
          console.warn('[settlement] orders 查詢失敗，折價券／運費以 0 計：', e?.message)
          return [] as any[]
        }),
      ])

      /*
       * 費率一律由後端解析：廠商有客製就用廠商的，否則全站預設。
       * 改版前這幾個值是結算頁上的 useState（重整就跳回硬預設），
       * 月結 cron 又另外寫死一份 —— 兩張單子永遠對不起來。
       */
      const settlementDefaults = await getSettlementDefaults(supabase)
      const rates = resolveRates(settlementDefaults, supplierRes.data as any)

      // 消費明細：只算該廠商商品
      const draws: any[] = drawRows.filter((d: any) => d.product?.type !== 'slot')
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
      const recharges: any[] = rechargeRows
      const successRecharges = recharges.filter(r => r.status === 'success')
      const rechargeTotal = successRecharges.reduce((s, r) => s + (r.amount || 0), 0)
      const rechargeCount = successRecharges.length

      /*
       * 綠界手續費：算「這家廠商自己的消費 × 有效費率」，不再用平台總額分攤。
       *
       * 舊算法是 `平台實際總手續費 × 消費佔比`。數字沒錯，但那張對帳單要能被
       * 廠商驗算，就得同時把「平台總手續費」與「消費佔比」印上去 ——
       * 廠商拿自己的消費 G 除以佔比，就反推出全平台營收。
       *
       * 改成乘上一個「率」之後，攤在對帳單上的只剩費率本身（≈2.75%，
       * 綠界公開牌價，沒有敏感性），廠商用自己的數字就能算完整條，
       * 而平台的量體一個都不用露。
       *
       * 有效費率取自實際帳：平台實付手續費 ÷ 平台儲值總額，
       * 這樣仍然反映真實的混合費率（信用卡／ATM／超商比重不同會浮動），
       * 只是不再需要知道分子分母各是多少。撈不到實際資料時回 null，
       * 由前端用手動設定的估算費率。
       *
       * 差額（儲值與消費不同期造成的）由平台吸收 —— 手續費本來就是
       * 平台與綠界之間的事，廠商不該為別人的儲值時點負責。
       */
      const rechargesWithFee = successRecharges.filter(r => r.payment_fee != null)
      const platformTotalFee = rechargesWithFee.reduce((s, r) => s + (r.payment_fee || 0), 0)
      const feeBaseAmount = rechargesWithFee.reduce((s, r) => s + (r.amount || 0), 0)
      const hasActualFee = rechargesWithFee.length > 0 && feeBaseAmount > 0
      const effectiveFeeRate = hasActualFee ? platformTotalFee / feeBaseAmount : null
      // 1G = NT$1，所以廠商消費 G 直接當台幣基數
      const allocatedActualFee = effectiveFeeRate != null
        ? Math.round(totalG * effectiveFeeRate)
        : null

      /*
       * 回收怎麼結算（老闆 2026-08-25 定案）
       *
       *   charge ── 改版前的做法。抽獎照一般分潤率分給廠商，回收價再從廠商結算扣除。
       *   margin ── 差額分潤。被回收的那筆抽獎「不走一般分潤」，改成
       *             差額 =（單抽價 − 回收價），依 supplierShare 拆給廠商，其餘平台全拿；
       *             回收價由平台從那筆營收裡出，不另外跟廠商收。
       *
       * 兩者互斥 —— 同時套用會重複計算（廠商既被扣回收價、又只分到差額的一部分）。
       *
       * 單價與差額讀的是 admin_recycle_pool 記帳當下寫死的值，不是現在的費率。
       * 費率隨時可能被後台調動，事後回推歷史一定算錯。
       */
      const supplierRecycles = recycleRows.filter(
        (r: any) => String(r.product?.supplier_id) === supplierId,
      )
      const recycleRefundTotal = supplierRecycles.reduce(
        (s: number, r: any) => s + (r.recycle_value || 0), 0,
      )
      const recycledUnitPriceTotal = supplierRecycles.reduce(
        (s: number, r: any) => s + (r.unit_price || 0), 0,
      )
      const recycledMarginTotal = supplierRecycles.reduce(
        (s: number, r: any) => s + (r.margin || 0), 0,
      )

      const settlementMode = rates.recycleMode
      const marginSupplierShare = rates.recycleMarginShare

      // charge 模式才從結算扣回收價；margin 模式回收價由平台吸收
      const dismantleTotal = settlementMode === 'charge' ? recycleRefundTotal : 0
      // margin 模式要把被回收的抽獎整筆移出一般分潤基底，改走差額分潤
      const recycledRevenueExcluded = settlementMode === 'margin' ? recycledUnitPriceTotal : 0
      const marginToSupplier = settlementMode === 'margin'
        ? Math.round((recycledMarginTotal * marginSupplierShare) / 100)
        : 0

      // 折價券 & 運費（雙方各吸收一半）
      const supplierOrders: any[] = orderRows
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

      /*
       * 平台級數字一律不回給廠商帳號。
       *
       * 只在畫面上隱藏是不夠的 —— 這些值原本就躺在 API 回應裡，
       * 開 DevTools 看 response 就有。尤其 `totalPlatformG` 就是
       * 全平台同期抽獎營收本身，等於直接送出去。
       *
       * `effectiveFeeRate` 可以給：那是一個率、不含量體。
       */
      const body = {
        supplierName: (supplierRes.data as any)?.name ?? '',
        products,
        totalG,
        hasActualFee,
        effectiveFeeRate,
        allocatedActualFee,
        dismantleTotal,
        couponTotal,
        shippingTotal,
        pointsTotal,
        rates: {
          supplierShare: rates.supplierShare,
          withholdingRate: rates.withholdingRate,
          pointsMode: rates.pointsMode,
          ecpayRate: rates.ecpayRate,
          customized: rates.customized,
        },
        settlementMode,
        marginSupplierShare,
        recycleRefundTotal,
        recycledRevenueExcluded,
        recycledMarginTotal,
        marginToSupplier,
        recycleCount: supplierRecycles.length,
      }
      if (scope.isSupplier) return NextResponse.json(body)

      return NextResponse.json({
        ...body,
        totalPlatformG,
        consumptionShare,
        rechargeTotal,
        rechargeCount,
        platformTotalFee: hasActualFee ? platformTotalFee : null,
      })
    }

    // ── 用戶行為 ─────────────────────────────────────────────────────────────
    if (tab === 'behavior') {
      const applyBehaviorDate = (q: any) => {
        if (start) q = q.gte('created_at', start)
        if (endExclusiveUtc) q = q.lt('created_at', endExclusiveUtc)
        return q
      }

      /*
       * 這四批都走 fetchAllRows：user_events 是全站埋點，量體遠大於 1000，
       * PostgREST 預設只回 1000 列而且靜默截斷 —— 排行與轉換率會整片偏低。
       * （同樣的洞在分析頁、廠商結算、月結 cron 都修過。）
       */
      // 熱門搜尋字（search 事件的 meta.query）
      const searchEvents = await fetchAllRows<any>(() => applyBehaviorDate(
        supabase
          .from('user_events')
          .select('meta')
          .eq('event_type', 'search')
      ))
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
      const clickEvents = await fetchAllRows<any>(() => applyBehaviorDate(
        supabase
          .from('user_events')
          .select('series')
          .in('event_type', ['product_click', 'series_click'])
          .not('series', 'is', null)
      ))
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
      const clickUsers = await fetchAllRows<any>(() => applyBehaviorDate(
        supabase
          .from('user_events')
          .select('user_id, product_id')
          .eq('event_type', 'product_click')
          .not('user_id', 'is', null)
          .not('product_id', 'is', null)
      ))
      const drawUsers = await fetchAllRows<any>(() => applyBehaviorDate(
        supabase
          .from('user_events')
          .select('user_id, product_id')
          .eq('event_type', 'draw')
          .not('user_id', 'is', null)
          .not('product_id', 'is', null)
      ))
      const clickSet = new Set((clickUsers ?? []).map((e: any) => `${e.user_id}:${e.product_id}`))
      const drawSet = new Set((drawUsers ?? []).map((e: any) => `${e.user_id}:${e.product_id}`))
      const converted = [...drawSet].filter(k => clickSet.has(k)).length
      const clickTotal = clickSet.size
      const conversionRate = clickTotal > 0 ? Math.round((converted / clickTotal) * 1000) / 10 : 0

      // 試試看（draw_trial）：進商品頁按「試試看」試抽 —— 好奇/試運氣的指標。
      // 次數＝按了幾次、人數＝多少不同玩家按過。
      const trialEvents = await fetchAllRows<any>(() => applyBehaviorDate(
        supabase
          .from('user_events')
          .select('user_id')
          .eq('event_type', 'draw_trial')
      ))
      const trialTotal = (trialEvents ?? []).length
      const trialUsers = new Set((trialEvents ?? []).filter((e: any) => e.user_id).map((e: any) => e.user_id)).size

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

      return NextResponse.json({ topSearches, topSeries, conversionRate, clickTotal, converted, trialTotal, trialUsers, dailyActiveUsers })
    }

    // ── 回收明細 ────────────────────────────────────────────────────────────
    if (tab === 'dismantled') {
      let query = supabase
        .from('admin_recycle_pool')
        .select('id, recycle_value, created_at, prize_name, prize_level, user_id, product_id, product:products(id, name, supplier_id, supplier:suppliers(id, name)), user:users(id, name)')
        .order('created_at', { ascending: false })

      if (start) query = query.gte('created_at', start)
      if (endExclusiveUtc) query = query.lt('created_at', endExclusiveUtc)

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
      if (endExclusiveUtc) query = query.lt('last_updated', endExclusiveUtc)

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
      if (endExclusiveUtc) query = query.lt('created_at', endExclusiveUtc)

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
