import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'

/**
 * 廠商分析
 *
 * 刻意做成獨立端點，而不是給 `/api/admin/analytics-overview` 加一個 supplierId ——
 * 那支算的是平台指標（總儲值、訪問量、轉換率、全站熱門搜尋、廠商排行），
 * 要在裡面「依角色決定哪些欄位不回」很容易漏一個。這裡從頭到尾只算
 * 「這一家廠商自己的東西」，結構上就不存在洩漏平台量體的路徑。
 *
 * 廠商帳號不管網址帶什麼 supplierId，一律看自己那家（同結算頁的做法）。
 */

const TW = 8 * 3600_000

function twDate(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d) - TW)
}

function pct(cur: number, prev: number) {
  if (!prev) return cur > 0 ? 100 : 0
  return Math.round((cur - prev) / prev * 1000) / 10
}

const CAT: Record<string, string> = {
  gacha: '轉蛋', ichiban: '一番賞', blindbox: '盒玩', card: '抽卡', custom: '自製賞',
}

export async function GET(req: NextRequest) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  // 廠商帳號忽略網址參數，只能看自己那家
  const supplierId = scope.supplierScope != null ? String(scope.supplierScope) : sp.get('supplierId')
  if (!supplierId) return NextResponse.json({ error: '請選擇廠商' }, { status: 400 })

  const now = new Date(Date.now() + TW)
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), d = now.getUTCDate()
  const startStr = sp.get('start') || `${y}-${String(mo + 1).padStart(2, '0')}-01`
  const endStr = sp.get('end') || `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const [sy, sm, sd] = startStr.split('-').map(Number)
  const [ey, em, ed] = endStr.split('-').map(Number)
  const curStart = twDate(sy, sm - 1, sd)
  const curEnd = twDate(ey, em - 1, ed + 1)      // 含當日 → 轉成不含右界
  const dur = curEnd.getTime() - curStart.getTime()
  const prevStart = new Date(curStart.getTime() - dur)

  /*
   * 分桶模式與分析頁 (`/api/admin/analytics-overview`) 完全一致，
   * 兩頁選同一個區間才會畫出同樣的刻度。
   */
  const days = dur / 86400000
  const isHourly = days <= 1                                   // 今日：0–23 時
  const isShortRange = !isHourly && days <= 7                   // 本週：逐日
  const isMonthly = days > 90                                   // 本年：逐月
  const isWeekly = !isHourly && !isShortRange && !isMonthly     // 8–90 天：逐週（週一）

  // 今日／昨日：KPI 卡的「日同比」與「日銷售額」用
  const ts = twDate(y, mo, d), te = twDate(y, mo, d + 1)
  const ys = twDate(y, mo, d - 1), ye = ts

  const db = getSupabaseAdmin()
  const { data: bots } = await db.from('users').select('id').eq('is_bot', true)
  const botIds = (bots ?? []).map((r: any) => r.id as string)
  const noBot = (q: any) => botIds.length ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q
  const inR = (q: any, a: Date, b: Date) => q.gte('created_at', a.toISOString()).lt('created_at', b.toISOString())

  try {
    // 先取這家廠商的商品，之後所有統計都只認這批 id
    const products = await fetchAllRows<any>(() => db
      .from('products')
      .select('id, name, type, status, price')
      .eq('supplier_id', supplierId))
    const productIds = products.map(p => p.id)

    /*
     * 銷售成數的分母：這家廠商所有品項備貨量的總和（`product_prizes.total`）。
     *
     * 分子改用「這個區間抽掉幾份」（= 期間內的抽獎筆數，一抽出一份），
     * 所以卡片會跟著上方日期切換而變 —— 老闆要的是區間售出比例，
     * 不是庫存快照。
     *
     * 為什麼不用 `total - remaining`：remaining 只有「現在」一個值、
     * 沒有歷史軌跡，還原不出任一時點的剩餘量，那個算法永遠是累計的。
     * 順帶把累計值一起回傳（`cumulativeSold`），需要時可以對照。
     */
    let prizeTotal = 0, cumulativeSold = 0, prizeItems = 0
    if (productIds.length > 0) {
      const prizeRows = await fetchAllRows<any>(() => db
        .from('product_prizes')
        .select('total, remaining')
        .in('product_id', productIds))
      for (const r of prizeRows) {
        prizeItems++
        prizeTotal += r.total ?? 0
        cumulativeSold += Math.max(0, (r.total ?? 0) - (r.remaining ?? 0))
      }
    }
    const supplierName = (await db.from('suppliers').select('name').eq('id', supplierId).single()).data?.name ?? ''

    if (productIds.length === 0) {
      return NextResponse.json({
        supplierName, empty: true,
        current: { totalSales: 0, totalDraws: 0, activeProducts: 0, totalProducts: 0, avgPerDraw: 0, todaySales: 0, todayDraws: 0, sellThrough: 0, periodSold: 0, cumulativeSold: 0, prizeTotal: 0, prizeItems: 0, bars: [], spark: [], categories: [], topProducts: [], topViewed: [], topSearched: [] },
        growth: { sales: 0, draws: 0, salesToday: 0, drawsToday: 0, sellThrough: 0 },
      })
    }

    const drawSel = 'id, created_at, product_id, product:products(name, price, type)'
    const scoped = () => noBot(db.from('draw_records').select(drawSel).in('product_id', productIds))
    const [draws, prevDraws, todayDraws, yestDraws] = await Promise.all([
      fetchAllRows<any>(() => inR(scoped(), curStart, curEnd)),
      fetchAllRows<any>(() => inR(scoped(), prevStart, curStart)),
      fetchAllRows<any>(() => inR(scoped(), ts, te)),
      fetchAllRows<any>(() => inR(scoped(), ys, ye)),
    ])

    const amountOf = (r: any) => r.product?.price ?? 0
    const totalSales = draws.reduce((s, r) => s + amountOf(r), 0)
    const totalDraws = draws.length
    const prevSales = prevDraws.reduce((s, r) => s + amountOf(r), 0)

    // 銷售成數＝這個區間抽掉的份數 ÷ 總備貨量（一抽出一份）
    const sellThrough = prizeTotal > 0 ? Math.round(totalDraws * 1000 / prizeTotal) / 10 : 0
    const prevSellThrough = prizeTotal > 0 ? Math.round(prevDraws.length * 1000 / prizeTotal) / 10 : 0

    // 走勢分桶：key 的算法與分析頁一字不差
    const dtKey = (createdAt: string) => {
      const dt = new Date(new Date(createdAt).getTime() + TW)
      if (isHourly) return `${dt.toISOString().split('T')[0]} ${String(dt.getUTCHours()).padStart(2, '0')}`
      if (isMonthly) return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
      if (isWeekly) {
        const day = dt.getUTCDay()
        const daysBack = day === 0 ? 6 : day - 1
        return new Date(dt.getTime() - daysBack * 86400_000).toISOString().split('T')[0]
      }
      return dt.toISOString().split('T')[0]
    }
    const barMap: Record<string, { sales: number; draws: number }> = {}
    draws.forEach(r => {
      const k = dtKey(r.created_at)
      if (!barMap[k]) barMap[k] = { sales: 0, draws: 0 }
      barMap[k].sales += amountOf(r)
      barMap[k].draws++
    })

    /*
     * **走完整個區間把每一格都排出來，沒資料的補 0**（老闆指定）。
     * 只用有紀錄的 key 去組，中間空檔會整格消失 —— 例如本週只有兩天有單，
     * 圖上就只剩兩根柱子、看不出其他五天是零。
     */
    const barsWithKey: { key: string; label: string; sales: number; draws: number }[] = []
    const push = (key: string, label: string) =>
      barsWithKey.push({ key, label, sales: barMap[key]?.sales ?? 0, draws: barMap[key]?.draws ?? 0 })

    if (isHourly) {
      for (let h = 0; h <= 23; h++) push(`${startStr} ${String(h).padStart(2, '0')}`, String(h))
    } else if (isMonthly) {
      const cur = new Date(curStart)
      while (cur < curEnd) {
        const dt = new Date(cur.getTime() + TW)
        const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
        const label = `${dt.getUTCMonth() + 1}月`
        if (!barsWithKey.find(b => b.label === label)) push(key, label)
        cur.setDate(cur.getDate() + 28)
      }
    } else if (isWeekly) {
      const startDt = new Date(curStart.getTime() + TW)
      const sDay = startDt.getUTCDay()
      const firstMon = new Date(curStart.getTime() - (sDay === 0 ? 6 : sDay - 1) * 86400_000)
      const cur = new Date(firstMon)
      while (cur < curEnd) {
        const dt = new Date(cur.getTime() + TW)
        const key = dt.toISOString().split('T')[0]
        push(key, `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`)
        cur.setUTCDate(cur.getUTCDate() + 7)
      }
    } else {
      const cur = new Date(curStart)
      while (cur < curEnd) {
        const dt = new Date(cur.getTime() + TW)
        const key = dt.toISOString().split('T')[0]
        push(key, `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`)
        cur.setDate(cur.getDate() + 1)
      }
    }
    const bars = barsWithKey.map(({ key: _k, ...rest }) => rest)
    // 迷你圖：今日給滿 24 點，其餘取最後 14 段（同分析頁）
    const spark = (isHourly ? bars : bars.slice(-14)).map((b, i) => ({ x: i, date: b.label, sales: b.sales, draws: b.draws }))

    // 類別佔比（只含這家廠商的商品類型）
    const catMap: Record<string, { count: number; amount: number }> = {}
    draws.forEach(r => {
      const t = r.product?.type ?? 'other'
      if (!catMap[t]) catMap[t] = { count: 0, amount: 0 }
      catMap[t].count++
      catMap[t].amount += amountOf(r)
    })
    const categories = Object.entries(catMap)
      .map(([type, v]) => ({ type, label: CAT[type] ?? type, ...v }))
      .sort((a, b) => b.amount - a.amount)

    // 熱門商品 TOP 15（本期銷售額排序，附上期成長率）
    const byProduct: Record<string, { name: string; type: string; draws: number; sales: number }> = {}
    draws.forEach(r => {
      const k = String(r.product_id)
      if (!byProduct[k]) byProduct[k] = { name: r.product?.name ?? `#${k}`, type: r.product?.type ?? '', draws: 0, sales: 0 }
      byProduct[k].draws++
      byProduct[k].sales += amountOf(r)
    })
    const prevByProduct: Record<string, number> = {}
    prevDraws.forEach(r => {
      const k = String(r.product_id)
      prevByProduct[k] = (prevByProduct[k] ?? 0) + amountOf(r)
    })
    /*
     * 瀏覽排行與搜尋排行都從 `user_events` 來（前台 trackEvent 寫的）：
     *
     *   product_view  ── 進入商品頁，帶 product_id，直接依商品分組
     *   search        ── 只有 meta.query 這個關鍵字，**沒有 product_id**，
     *                     所以只能拿關鍵字去比對這家廠商的商品名稱
     *                     （玩家搜「蠟筆小新」對到「[90]蠟筆小新 BIG公仔2」）。
     *                     一個關鍵字可能同時命中同系列的多件商品，是近似歸因不是精確歸因。
     *
     * ⚠️ 只收 'search'。前台 `app/search/page.tsx` 另外還送一種 'search_query'，
     * 但 `user_events_event_type_check` 只允許
     * product_view / product_click / search / draw / series_click ——
     * 'search_query' 會被資料庫擋掉、根本進不來。
     *
     * ⚠️ 2026-08-12 實測 PROD：product_view 387 筆可用，
     * 但 search 事件是 **0 筆**（還沒人搜過），所以搜尋排行目前會是空的。
     */
    const evSel = 'event_type, product_id, meta, created_at'
    const evScoped = () => db.from('user_events').select(evSel).in('event_type', ['product_view', 'search'])
    const [evCur, evPrev] = await Promise.all([
      fetchAllRows<any>(() => inR(evScoped(), curStart, curEnd)),
      fetchAllRows<any>(() => inR(evScoped(), prevStart, curStart)),
    ])

    const nameById = new Map<string, string>(products.map(p => [String(p.id), p.name as string]))
    const idSet = new Set(productIds.map(String))

    /** 進入商品頁次數，只算這家廠商的商品 */
    const countViews = (rows: any[]) => {
      const m: Record<string, number> = {}
      for (const r of rows) {
        if (r.event_type !== 'product_view') continue
        const k = String(r.product_id ?? '')
        if (!idSet.has(k)) continue
        m[k] = (m[k] ?? 0) + 1
      }
      return m
    }

    /** 搜尋關鍵字對到商品名稱的次數（近似歸因，見上方註解） */
    const countSearches = (rows: any[]) => {
      const m: Record<string, number> = {}
      const lowered = products.map(p => [String(p.id), String(p.name ?? '').toLowerCase()] as const)
      for (const r of rows) {
        if (r.event_type !== 'search') continue
        const q = String(r.meta?.query ?? '').trim().toLowerCase()
        if (q.length < 2) continue           // 一個字太容易誤中
        for (const [id, name] of lowered) {
          if (name.includes(q)) m[id] = (m[id] ?? 0) + 1
        }
      }
      return m
    }

    const viewCur = countViews(evCur), viewPrev = countViews(evPrev)
    const searchCur = countSearches(evCur), searchPrev = countSearches(evPrev)

    /** 共用：把 {productId: 次數} 轉成排行卡要的格式 */
    const toRanking = (cur: Record<string, number>, prev: Record<string, number>) =>
      Object.entries(cur)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([id, value], i) => ({
          rank: i + 1, id, name: nameById.get(id) ?? `#${id}`,
          value, growth: pct(value, prev[id] ?? 0),
        }))

    const topViewed = toRanking(viewCur, viewPrev)
    const topSearched = toRanking(searchCur, searchPrev)

    const topProducts = Object.entries(byProduct)
      .sort((a, b) => b[1].sales - a[1].sales)
      .slice(0, 15)
      .map(([id, v], i) => ({
        rank: i + 1, id, ...v,
        label: CAT[v.type] ?? v.type,
        growth: pct(v.sales, prevByProduct[id] ?? 0),
      }))

    return NextResponse.json({
      supplierName,
      current: {
        totalSales,
        totalDraws,
        activeProducts: products.filter(p => p.status === 'active').length,
        totalProducts: products.length,
        avgPerDraw: totalDraws > 0 ? Math.round(totalSales / totalDraws) : 0,
        todaySales: todayDraws.reduce((s, r) => s + amountOf(r), 0),
        todayDraws: todayDraws.length,
        sellThrough, periodSold: totalDraws, cumulativeSold, prizeTotal, prizeItems,
        bars, spark, categories, topProducts, topViewed, topSearched,
      },
      growth: {
        sales: pct(totalSales, prevSales),
        draws: pct(totalDraws, prevDraws.length),
        sellThrough: pct(sellThrough, prevSellThrough),
        salesToday: pct(todayDraws.reduce((s, r) => s + amountOf(r), 0), yestDraws.reduce((s, r) => s + amountOf(r), 0)),
        drawsToday: pct(todayDraws.length, yestDraws.length),
      },
    })
  } catch (err: any) {
    console.error('[analytics-supplier]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
