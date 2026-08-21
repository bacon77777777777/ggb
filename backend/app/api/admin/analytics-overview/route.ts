import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'

const TW = 8 * 3600_000

function twDate(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d) - TW)
}

function pct(cur: number, prev: number) {
  if (!prev) return cur > 0 ? 100 : 0
  return Math.round((cur - prev) / prev * 1000) / 10
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const startParam = sp.get('start')
  const endParam = sp.get('end')

  const now = new Date(Date.now() + TW)
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), d = now.getUTCDate()

  // Default: current month 1st → today
  const startStr = startParam || `${y}-${String(mo + 1).padStart(2, '0')}-01`
  const endStr = endParam || `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const [sy, sm, sd] = startStr.split('-').map(Number)
  const [ey, em, ed] = endStr.split('-').map(Number)

  const curStart = twDate(sy, sm - 1, sd)
  const curEnd = twDate(ey, em - 1, ed + 1) // inclusive → exclusive

  const dur = curEnd.getTime() - curStart.getTime()
  const prevStart = new Date(curStart.getTime() - dur)
  const prevEnd = curStart

  // today / yesterday for 日同比
  const ts = twDate(y, mo, d)
  const te = twDate(y, mo, d + 1)
  const ys = twDate(y, mo, d - 1)
  const ye = ts

  const days = dur / 86400000
  const isHourly = days <= 1           // 今日: hourly labels 0-23
  const isShortRange = !isHourly && days <= 7   // 本週: daily MM-DD
  const isMonthly = days > 90          // 本年: monthly labels
  const isWeekly = !isHourly && !isShortRange && !isMonthly  // 8-90天: 週為區間

  const db = getSupabaseAdmin()
  const { data: bots } = await db.from('users').select('id').eq('is_bot', true)
  const botIds = (bots ?? []).map((r: any) => r.id as string)
  const noBot = (q: any) => botIds.length ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q
  const inR = (q: any, a: Date, b: Date, f = 'created_at') =>
    q.gte(f, a.toISOString()).lt(f, b.toISOString())

  try {
    /*
     * 凡是「撈回來自己 reduce 加總」的都要走 fetchAllRows。
     * PostgREST 預設只回 1000 列且靜默截斷 —— 實測全站整年消費筆數 2,896
     * 被截成 1,000、銷售額 114,940 變成 32,950，圖表與 KPI 全數偏低。
     * visit_logs 用的是 head+count，資料庫端算好只回數字，不受此限。
     */
    const [draws, prevDraws, rcCurRows, rcPrevRows, todayDraws, yesterdayDraws, visCur, visPrev, visToday, visYest, kwCurRows, kwPrevRows, rcTodayRows, rcYestRows] =
      await Promise.all([
        fetchAllRows<any>(() => inR(noBot(db.from('draw_records').select('id, created_at, product:products(id, name, price, type, supplier:suppliers(id, name))')), curStart, curEnd)),
        fetchAllRows<any>(() => inR(noBot(db.from('draw_records').select('id, product:products(price)')), prevStart, prevEnd)),
        fetchAllRows<any>(() => inR(noBot(db.from('recharge_records').select('amount, created_at').eq('status', 'success')), curStart, curEnd)),
        fetchAllRows<any>(() => inR(noBot(db.from('recharge_records').select('amount').eq('status', 'success')), prevStart, prevEnd)),
        fetchAllRows<any>(() => inR(noBot(db.from('draw_records').select('id, product:products(price)')), ts, te)),
        fetchAllRows<any>(() => inR(noBot(db.from('draw_records').select('id, product:products(price)')), ys, ye)),
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), curStart, curEnd),
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), prevStart, prevEnd),
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), ts, te),
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), ys, ye),
        fetchAllRows<any>(() => inR(db.from('search_logs').select('keyword'), curStart, curEnd)),
        fetchAllRows<any>(() => inR(db.from('search_logs').select('keyword'), prevStart, prevEnd)),
        fetchAllRows<any>(() => inR(noBot(db.from('recharge_records').select('amount').eq('status', 'success')), ts, te)),
        fetchAllRows<any>(() => inR(noBot(db.from('recharge_records').select('amount').eq('status', 'success')), ys, ye)),
      ])

    const price = (d: any) => d.product?.price ?? 0
    const totalSales = draws.reduce((acc: number, d: any) => acc + price(d), 0)
    const prevSales = prevDraws.reduce((acc: number, d: any) => acc + price(d), 0)
    const totalDrawCount = draws.length
    const prevDrawCount = prevDraws.length
    const totalRecharges = rcCurRows.reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
    const prevRecharges = rcPrevRows.reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
    const todayRecharges = rcTodayRows.reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
    const yesterdayRecharges = rcYestRows.reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
    const todaySales = todayDraws.reduce((acc: number, d: any) => acc + price(d), 0)
    const yesterdaySales = yesterdayDraws.reduce((acc: number, d: any) => acc + price(d), 0)
    const todayDrawCount = todayDraws.length
    const yesterdayDrawCount = yesterdayDraws.length
    const totalVisits = (visCur as any).count ?? 0
    const prevVisits = (visPrev as any).count ?? 0
    const todayVisits = (visToday as any).count ?? 0
    const yesterdayVisits = (visYest as any).count ?? 0

    // Key function: hour / week-Monday / date / month bucket
    const dtKey = (createdAt: string) => {
      const dt = new Date(new Date(createdAt).getTime() + TW)
      if (isHourly) return `${dt.toISOString().split('T')[0]} ${String(dt.getUTCHours()).padStart(2, '0')}`
      if (isMonthly) return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
      if (isWeekly) {
        // Round down to Monday (TW time)
        const day = dt.getUTCDay()
        const daysBack = day === 0 ? 6 : day - 1
        const mon = new Date(dt.getTime() - daysBack * 86400_000)
        return mon.toISOString().split('T')[0]
      }
      return dt.toISOString().split('T')[0]
    }

    // Bar chart grouping
    const barMap: Record<string, { sales: number; draws: number }> = {}
    draws.forEach((d: any) => {
      const key = dtKey(d.created_at)
      if (!barMap[key]) barMap[key] = { sales: 0, draws: 0 }
      barMap[key].sales += price(d)
      barMap[key].draws++
    })

    // Visit breakdown for sparkline
    const { data: visitRows } = await inR(db.from('visit_logs').select('created_at'), curStart, curEnd)
    const visitByKey: Record<string, number> = {}
    ;(visitRows ?? []).forEach((v: any) => {
      const key = dtKey(v.created_at)
      visitByKey[key] = (visitByKey[key] ?? 0) + 1
    })

    // Recharge breakdown for 儲值與消耗對比 chart
    const rechargeByKey: Record<string, number> = {}
    ;rcCurRows.forEach((r: any) => {
      const key = dtKey(r.created_at)
      rechargeByKey[key] = (rechargeByKey[key] ?? 0) + Number(r.amount ?? 0)
    })

    // Build bars
    const barsWithKey: { key: string; label: string; sales: number; draws: number; visits: number; recharges: number }[] = []
    if (isHourly) {
      const dayStr = startStr
      for (let h = 0; h <= 23; h++) {
        const key = `${dayStr} ${String(h).padStart(2, '0')}`
        barsWithKey.push({ key, label: String(h), sales: barMap[key]?.sales ?? 0, draws: barMap[key]?.draws ?? 0, visits: visitByKey[key] ?? 0, recharges: rechargeByKey[key] ?? 0 })
      }
    } else if (isMonthly) {
      const cur = new Date(curStart)
      while (cur < curEnd) {
        const dt = new Date(cur.getTime() + TW)
        const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
        const label = `${dt.getUTCMonth() + 1}月`
        if (!barsWithKey.find(b => b.label === label)) {
          barsWithKey.push({ key, label, sales: barMap[key]?.sales ?? 0, draws: barMap[key]?.draws ?? 0, visits: visitByKey[key] ?? 0, recharges: rechargeByKey[key] ?? 0 })
        }
        cur.setDate(cur.getDate() + 28)
      }
    } else if (isWeekly) {
      // 8-90天: 以週（週一）為區間
      const curStartDt = new Date(curStart.getTime() + TW)
      const startDay = curStartDt.getUTCDay()
      const daysBack = startDay === 0 ? 6 : startDay - 1
      const firstMon = new Date(curStart.getTime() - daysBack * 86400_000)
      const cur = new Date(firstMon)
      while (cur < curEnd) {
        const dt = new Date(cur.getTime() + TW)
        const key = dt.toISOString().split('T')[0]
        const mm = dt.getUTCMonth() + 1, dd = dt.getUTCDate()
        const label = `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
        barsWithKey.push({ key, label, sales: barMap[key]?.sales ?? 0, draws: barMap[key]?.draws ?? 0, visits: visitByKey[key] ?? 0, recharges: rechargeByKey[key] ?? 0 })
        cur.setUTCDate(cur.getUTCDate() + 7)
      }
    } else {
      // isShortRange: 1-7天，每日 MM-DD
      const cur = new Date(curStart)
      while (cur < curEnd) {
        const dt = new Date(cur.getTime() + TW)
        const key = dt.toISOString().split('T')[0]
        const mm = dt.getUTCMonth() + 1, dd = dt.getUTCDate()
        const label = `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
        barsWithKey.push({ key, label, sales: barMap[key]?.sales ?? 0, draws: barMap[key]?.draws ?? 0, visits: visitByKey[key] ?? 0, recharges: rechargeByKey[key] ?? 0 })
        cur.setDate(cur.getDate() + 1)
      }
    }
    const bars = barsWithKey.map(({ key: _k, ...rest }) => rest)

    // Spark: hourly → all 24 points; others → last 14
    const sparkSrc = isHourly ? barsWithKey : barsWithKey.slice(-14)
    const spark = sparkSrc.map((b, i) => ({
      x: i,
      date: isHourly ? `${b.label}:00` : b.key,
      sales: b.sales, draws: b.draws, visits: b.visits,
    }))

    // Keywords
    const kwMap: Record<string, number> = {}
    const kwPrevMap: Record<string, number> = {}
    ;kwCurRows.forEach((r: any) => { kwMap[r.keyword] = (kwMap[r.keyword] ?? 0) + 1 })
    ;kwPrevRows.forEach((r: any) => { kwPrevMap[r.keyword] = (kwPrevMap[r.keyword] ?? 0) + 1 })
    const keywords = Object.entries(kwMap)
      .sort(([, a], [, b]) => b - a).slice(0, 8)
      .map(([keyword, count], i) => ({
        rank: i + 1, keyword, count,
        growth: pct(count, kwPrevMap[keyword] ?? 0),
      }))

    // Categories
    /* 標籤與儀表板／廠商儀表板統一：盒玩不要在這頁叫「盲盒」，
       slot 與已刪除商品也要有看得懂的名字，不然圖上會出現 other 這種內部代號 */
    const CAT: Record<string, string> = {
      gacha: '轉蛋', ichiban: '一番賞', blindbox: '盒玩', card: '抽卡', custom: '自製賞',
      slot: '挑戰機台', other: '已刪除商品',
    }
    const catMap: Record<string, { count: number; amount: number }> = {}
    draws.forEach((d: any) => {
      const t = d.product?.type ?? 'other'
      if (!catMap[t]) catMap[t] = { count: 0, amount: 0 }
      catMap[t].count++
      catMap[t].amount += d.product?.price ?? d.points_used ?? 0
    })
    const categories = Object.entries(catMap)
      .map(([type, stats]) => ({ type, label: CAT[type] ?? type, ...stats }))
      .sort((a, b) => b.amount - a.amount)

    // Suppliers
    const supMap: Record<string, { id: string; name: string; draws: number; sales: number; visits: number }> = {}
    draws.forEach((d: any) => {
      const sup = d.product?.supplier
      if (!sup) return
      const k = String(sup.id)
      if (!supMap[k]) supMap[k] = { id: k, name: sup.name, draws: 0, sales: 0, visits: 0 }
      supMap[k].draws++
      supMap[k].sales += d.product?.price ?? d.points_used ?? 0
    })

    // 每廠商訪問量：商品瀏覽事件（product_view_events）依 product→supplier 彙總，
    // 讓右邊排行能切到「廠商訪問量排名」（老闆 2026-08-21）
    const pvRows = await fetchAllRows<any>(() => inR(
      noBot(db.from('product_view_events').select('product:products(supplier:suppliers(id, name))')),
      curStart, curEnd,
    ))
    ;(pvRows ?? []).forEach((v: any) => {
      const sup = v.product?.supplier
      if (!sup) return
      const k = String(sup.id)
      if (!supMap[k]) supMap[k] = { id: k, name: sup.name, draws: 0, sales: 0, visits: 0 }
      supMap[k].visits++
    })

    // 回全部廠商（家數不多），前端依當前模式(sales/visits)自己排序＋取前段
    const suppliers = Object.values(supMap).sort((a, b) => b.sales - a.sales).slice(0, 20)
    const maxSales = suppliers.reduce((m, s) => Math.max(m, s.sales), 0) || 1
    const maxDraws = suppliers.reduce((m, s) => Math.max(m, s.draws), 0) || 1
    const maxVisits = suppliers.reduce((m, s) => Math.max(m, s.visits), 0) || 1

    const convRate = totalVisits > 0 ? Math.round(totalDrawCount / totalVisits * 100) : 0
    const prevConvRate = prevVisits > 0 ? Math.round(prevDrawCount / prevVisits * 100) : 0

    /*
     * 熱門商品 TOP 15。原本掛在儀表板，儀表板改成營運駕駛艙之後排行榜統一收到這頁，
     * 免得兩頁各算一份、數字還不一樣（舊儀表板是前端自己 reduce 的）。
     */
    const prodMap: Record<string, { name: string; draws: number }> = {}
    for (const d of draws) {
      const p = (d as any).product
      if (!p?.id) continue
      const k = String(p.id)
      if (!prodMap[k]) prodMap[k] = { name: p.name ?? `#${k}`, draws: 0 }
      prodMap[k].draws++
    }
    const topProducts = Object.values(prodMap)
      .sort((a, b) => b.draws - a.draws)
      .slice(0, 15)
      .map(p => ({ name: p.name, value: p.draws }))

    return NextResponse.json({
      current: {
        totalSales, totalDrawCount, totalRecharges, totalVisits,
        todaySales, todayDrawCount, todayVisits, todayRecharges,
        yesterdaySales, yesterdayDrawCount, yesterdayVisits, yesterdayRecharges,
        convRate, bars, spark, keywords, categories, topProducts,
        suppliers: suppliers.map((s, i) => ({
          ...s, rank: i + 1,
          salesPct: Math.round(s.sales / maxSales * 100),
          drawsPct: Math.round(s.draws / maxDraws * 100),
          visitsPct: Math.round(s.visits / maxVisits * 100),
          convRate: totalDrawCount > 0
            ? Math.min(99, Math.round((s.draws / totalDrawCount) * Math.max(convRate, 10)))
            : 0,
        })),
      },
      growth: {
        sales: pct(totalSales, prevSales),
        draws: pct(totalDrawCount, prevDrawCount),
        recharges: pct(totalRecharges, prevRecharges),
        visits: pct(totalVisits, prevVisits),
        salesToday: pct(todaySales, yesterdaySales),
        drawsToday: pct(todayDrawCount, yesterdayDrawCount),
        visitsToday: pct(todayVisits, yesterdayVisits),
        rechargesToday: pct(todayRecharges, yesterdayRecharges),
        convRate: pct(convRate, prevConvRate),
      },
    })
  } catch (err: any) {
    console.error('[analytics-overview]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
