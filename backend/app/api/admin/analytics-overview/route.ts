import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

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
    const [drCur, drPrev, rcCur, rcPrev, drToday, drYest, visCur, visPrev, visToday, visYest, kwCur, kwPrev, rcToday, rcYest] =
      await Promise.all([
        inR(noBot(db.from('draw_records').select('id, created_at, product:products(price, type, supplier:suppliers(id, name))')), curStart, curEnd),
        inR(noBot(db.from('draw_records').select('id, product:products(price)')), prevStart, prevEnd),
        inR(noBot(db.from('recharge_records').select('amount, created_at').eq('status', 'success')), curStart, curEnd),
        inR(noBot(db.from('recharge_records').select('amount').eq('status', 'success')), prevStart, prevEnd),
        inR(noBot(db.from('draw_records').select('id, product:products(price)')), ts, te),
        inR(noBot(db.from('draw_records').select('id, product:products(price)')), ys, ye),
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), curStart, curEnd),
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), prevStart, prevEnd),
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), ts, te),
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), ys, ye),
        inR(db.from('search_logs').select('keyword'), curStart, curEnd),
        inR(db.from('search_logs').select('keyword'), prevStart, prevEnd),
        inR(noBot(db.from('recharge_records').select('amount').eq('status', 'success')), ts, te),
        inR(noBot(db.from('recharge_records').select('amount').eq('status', 'success')), ys, ye),
      ])

    const draws: any[] = drCur.data ?? []
    const prevDraws: any[] = drPrev.data ?? []
    const todayDraws: any[] = drToday.data ?? []
    const yesterdayDraws: any[] = drYest.data ?? []

    const price = (d: any) => d.product?.price ?? 0
    const totalSales = draws.reduce((acc: number, d: any) => acc + price(d), 0)
    const prevSales = prevDraws.reduce((acc: number, d: any) => acc + price(d), 0)
    const totalDrawCount = draws.length
    const prevDrawCount = prevDraws.length
    const totalRecharges = (rcCur.data ?? []).reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
    const prevRecharges = (rcPrev.data ?? []).reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
    const todayRecharges = (rcToday.data ?? []).reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
    const yesterdayRecharges = (rcYest.data ?? []).reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
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
    ;(rcCur.data ?? []).forEach((r: any) => {
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
    ;(kwCur.data ?? []).forEach((r: any) => { kwMap[r.keyword] = (kwMap[r.keyword] ?? 0) + 1 })
    ;(kwPrev.data ?? []).forEach((r: any) => { kwPrevMap[r.keyword] = (kwPrevMap[r.keyword] ?? 0) + 1 })
    const keywords = Object.entries(kwMap)
      .sort(([, a], [, b]) => b - a).slice(0, 8)
      .map(([keyword, count], i) => ({
        rank: i + 1, keyword, count,
        growth: pct(count, kwPrevMap[keyword] ?? 0),
      }))

    // Categories
    const CAT: Record<string, string> = { gacha: '轉蛋', ichiban: '一番賞', blindbox: '盲盒', card: '抽卡', custom: '自製賞' }
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
    const supMap: Record<string, { id: string; name: string; draws: number; sales: number }> = {}
    draws.forEach((d: any) => {
      const sup = d.product?.supplier
      if (!sup) return
      const k = String(sup.id)
      if (!supMap[k]) supMap[k] = { id: k, name: sup.name, draws: 0, sales: 0 }
      supMap[k].draws++
      supMap[k].sales += d.product?.price ?? d.points_used ?? 0
    })
    const suppliers = Object.values(supMap).sort((a, b) => b.sales - a.sales).slice(0, 10)
    const maxSales = suppliers[0]?.sales ?? 1
    const maxDraws = suppliers[0]?.draws ?? 1

    const convRate = totalVisits > 0 ? Math.round(totalDrawCount / totalVisits * 100) : 0
    const prevConvRate = prevVisits > 0 ? Math.round(prevDrawCount / prevVisits * 100) : 0

    return NextResponse.json({
      current: {
        totalSales, totalDrawCount, totalRecharges, totalVisits,
        todaySales, todayDrawCount, todayVisits, todayRecharges,
        yesterdaySales, yesterdayDrawCount, yesterdayVisits, yesterdayRecharges,
        convRate, bars, spark, keywords, categories,
        suppliers: suppliers.map((s, i) => ({
          ...s, rank: i + 1,
          salesPct: Math.round(s.sales / maxSales * 100),
          drawsPct: Math.round(s.draws / maxDraws * 100),
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
