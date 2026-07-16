import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

const TW = 8 * 3600_000

function twDate(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d) - TW)
}

function getPeriod(period: string, start?: string | null, end?: string | null) {
  const n = new Date(Date.now() + TW)
  const y = n.getUTCFullYear(), mo = n.getUTCMonth(), d = n.getUTCDate()
  let s: Date, e: Date

  switch (period) {
    case 'today':
      s = twDate(y, mo, d)
      e = twDate(y, mo, d + 1)
      break
    case 'week': {
      const dow = n.getUTCDay() || 7
      s = twDate(y, mo, d - dow + 1)
      e = twDate(y, mo, d - dow + 8)
      break
    }
    case 'year':
      s = twDate(y, 0, 1)
      e = twDate(y + 1, 0, 1)
      break
    case 'custom':
      if (start && end) {
        const [sy, sm, sd] = start.split('-').map(Number)
        const [ey, em, ed] = end.split('-').map(Number)
        s = twDate(sy, sm - 1, sd)
        e = twDate(ey, em - 1, ed + 1)
        break
      }
    // fallthrough
    default:
      s = twDate(y, mo, 1)
      e = twDate(y, mo + 1, 1)
  }

  const dur = e.getTime() - s.getTime()
  const ps = new Date(s.getTime() - dur)
  const pe = s
  const ts = twDate(y, mo, d)
  const te = twDate(y, mo, d + 1)
  const ys = twDate(y, mo, d - 1)
  const ye = ts
  return { s, e, ps, pe, ts, te, ys, ye, isYear: period === 'year' }
}

function pct(cur: number, prev: number) {
  if (!prev) return cur > 0 ? 100 : 0
  return Math.round((cur - prev) / prev * 100 * 10) / 10
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const { s, e, ps, pe, ts, te, ys, ye, isYear } = getPeriod(
    sp.get('period') || 'month',
    sp.get('start'),
    sp.get('end')
  )

  const db = getSupabaseAdmin()
  const { data: bots } = await db.from('users').select('id').eq('is_bot', true)
  const botIds = (bots ?? []).map((r: any) => r.id as string)
  const noBot = (q: any) => botIds.length ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q
  const inR = (q: any, a: Date, b: Date, f = 'created_at') =>
    q.gte(f, a.toISOString()).lt(f, b.toISOString())

  try {
    const [drCur, drPrev, rcCur, rcPrev, drToday, drYest, visCur, visPrev, visToday, visYest, kwCur, kwPrev] =
      await Promise.all([
        // draws current (with product + supplier for categories/suppliers breakdown)
        inR(noBot(db.from('draw_records').select('id, points_used, created_at, product:products(price, type, supplier:suppliers(id, name))')), s, e),
        // draws previous (totals only)
        inR(noBot(db.from('draw_records').select('id, points_used')), ps, pe),
        // recharges current
        inR(noBot(db.from('recharge_records').select('amount').eq('status', 'success')), s, e),
        // recharges previous
        inR(noBot(db.from('recharge_records').select('amount').eq('status', 'success')), ps, pe),
        // draws today
        inR(noBot(db.from('draw_records').select('id, points_used')), ts, te),
        // draws yesterday
        inR(noBot(db.from('draw_records').select('id, points_used')), ys, ye),
        // visits current (count)
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), s, e),
        // visits previous (count)
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), ps, pe),
        // visits today
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), ts, te),
        // visits yesterday
        inR(db.from('visit_logs').select('id', { count: 'exact', head: true }), ys, ye),
        // keywords current
        inR(db.from('search_logs').select('keyword'), s, e),
        // keywords previous
        inR(db.from('search_logs').select('keyword'), ps, pe),
      ])

    const draws: any[] = drCur.data ?? []
    const prevDraws: any[] = drPrev.data ?? []
    const todayDraws: any[] = drToday.data ?? []
    const yesterdayDraws: any[] = drYest.data ?? []

    // Totals
    const totalSales = draws.reduce((acc: number, d: any) => acc + (d.product?.price ?? d.points_used ?? 0), 0)
    const prevSales = prevDraws.reduce((acc: number, d: any) => acc + (d.points_used ?? 0), 0)
    const totalDrawCount = draws.length
    const prevDrawCount = prevDraws.length
    const totalRecharges = (rcCur.data ?? []).reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
    const prevRecharges = (rcPrev.data ?? []).reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
    const todaySales = todayDraws.reduce((acc: number, d: any) => acc + (d.points_used ?? 0), 0)
    const yesterdaySales = yesterdayDraws.reduce((acc: number, d: any) => acc + (d.points_used ?? 0), 0)
    const todayDrawCount = todayDraws.length
    const yesterdayDrawCount = yesterdayDraws.length
    const totalVisits = (visCur as any).count ?? 0
    const prevVisits = (visPrev as any).count ?? 0
    const todayVisits = (visToday as any).count ?? 0
    const yesterdayVisits = (visYest as any).count ?? 0

    // Bar chart data (daily or monthly)
    const barMap: Record<string, { sales: number; draws: number }> = {}
    draws.forEach((d: any) => {
      const dt = new Date(new Date(d.created_at).getTime() + TW)
      const key = isYear
        ? `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
        : dt.toISOString().split('T')[0]
      if (!barMap[key]) barMap[key] = { sales: 0, draws: 0 }
      barMap[key].sales += d.product?.price ?? d.points_used ?? 0
      barMap[key].draws++
    })

    const bars: { label: string; sales: number; draws: number }[] = []
    if (isYear) {
      const y0 = new Date(s.getTime() + TW).getUTCFullYear()
      for (let m = 0; m < 12; m++) {
        const key = `${y0}-${String(m + 1).padStart(2, '0')}`
        bars.push({ label: `${m + 1}月`, ...(barMap[key] ?? { sales: 0, draws: 0 }) })
      }
    } else {
      const cur = new Date(s)
      const now = new Date()
      while (cur < e && cur <= now) {
        const dt = new Date(cur.getTime() + TW)
        const key = dt.toISOString().split('T')[0]
        const mm = dt.getUTCMonth() + 1, dd = dt.getUTCDate()
        bars.push({ label: `${mm}/${dd}`, ...(barMap[key] ?? { sales: 0, draws: 0 }) })
        cur.setDate(cur.getDate() + 1)
      }
    }

    // Keywords
    const kwMap: Record<string, number> = {}
    const kwPrevMap: Record<string, number> = {}
    ;(kwCur.data ?? []).forEach((r: any) => { kwMap[r.keyword] = (kwMap[r.keyword] ?? 0) + 1 })
    ;(kwPrev.data ?? []).forEach((r: any) => { kwPrevMap[r.keyword] = (kwPrevMap[r.keyword] ?? 0) + 1 })
    const keywords = Object.entries(kwMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([keyword, count], i) => ({
        rank: i + 1,
        keyword,
        count,
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
    const suppliers = Object.values(supMap)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10)
    const maxSales = suppliers[0]?.sales ?? 1
    const maxDraws = suppliers[0]?.draws ?? 1

    // Conversion rate = draws / visits
    const convRate = totalVisits > 0 ? Math.round(totalDrawCount / totalVisits * 100) : 0
    const prevConvRate = prevVisits > 0 ? Math.round(prevDrawCount / prevVisits * 100) : 0

    return NextResponse.json({
      current: {
        totalSales,
        totalDrawCount,
        totalRecharges,
        totalVisits,
        todaySales,
        todayDrawCount,
        todayVisits,
        yesterdaySales,
        yesterdayDrawCount,
        yesterdayVisits,
        convRate,
        bars,
        keywords,
        categories,
        suppliers: suppliers.map((s, i) => ({
          ...s,
          rank: i + 1,
          salesPct: Math.round(s.sales / maxSales * 100),
          drawsPct: Math.round(s.draws / maxDraws * 100),
          convRate: totalVisits > 0
            ? Math.min(99, Math.round((s.draws / (totalDrawCount || 1)) * Math.max(convRate, 5)))
            : Math.round((s.draws / (totalDrawCount || 1)) * 100),
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
        convRate: pct(convRate, prevConvRate),
      },
    })
  } catch (err: any) {
    console.error('[analytics-overview]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
