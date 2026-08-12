import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'

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

  const days = dur / 86400000
  const isHourly = days <= 1
  const isMonthly = days > 90

  const db = getSupabaseAdmin()
  const { data: bots } = await db.from('users').select('id').eq('is_bot', true)
  const botIds = (bots ?? []).map((r: any) => r.id as string)
  const noBot = (q: any) => botIds.length ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q
  const inR = (q: any, a: Date, b: Date) => q.gte('created_at', a.toISOString()).lt('created_at', b.toISOString())

  try {
    // 先取這家廠商的商品，之後所有統計都只認這批 id
    const { data: prodRows } = await db
      .from('products')
      .select('id, name, type, status, price')
      .eq('supplier_id', supplierId)
    const products = prodRows ?? []
    const productIds = products.map(p => p.id)
    const supplierName = (await db.from('suppliers').select('name').eq('id', supplierId).single()).data?.name ?? ''

    if (productIds.length === 0) {
      return NextResponse.json({
        supplierName, empty: true,
        current: { totalSales: 0, totalDraws: 0, activeProducts: 0, avgPerDraw: 0, bars: [], categories: [], topProducts: [] },
        growth: { sales: 0, draws: 0 },
      })
    }

    const drawSel = 'id, created_at, product_id, product:products(name, price, type)'
    const [cur, prev] = await Promise.all([
      inR(noBot(db.from('draw_records').select(drawSel).in('product_id', productIds)), curStart, curEnd),
      inR(noBot(db.from('draw_records').select(drawSel).in('product_id', productIds)), prevStart, curStart),
    ])
    const draws: any[] = cur.data ?? []
    const prevDraws: any[] = prev.data ?? []

    const amountOf = (r: any) => r.product?.price ?? 0
    const totalSales = draws.reduce((s, r) => s + amountOf(r), 0)
    const totalDraws = draws.length
    const prevSales = prevDraws.reduce((s, r) => s + amountOf(r), 0)

    // 走勢：跟分析頁同一套分桶規則（今日看小時、超過 90 天看月、其餘看日）
    const keyOf = (iso: string) => {
      const t = new Date(new Date(iso).getTime() + TW)
      if (isHourly) return String(t.getUTCHours())
      if (isMonthly) return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
      return `${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
    }
    const barMap: Record<string, { sales: number; draws: number }> = {}
    draws.forEach(r => {
      const k = keyOf(r.created_at)
      if (!barMap[k]) barMap[k] = { sales: 0, draws: 0 }
      barMap[k].sales += amountOf(r)
      barMap[k].draws++
    })
    const bars = Object.entries(barMap)
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))

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
        bars, categories, topProducts,
      },
      growth: {
        sales: pct(totalSales, prevSales),
        draws: pct(totalDraws, prevDraws.length),
      },
    })
  } catch (err: any) {
    console.error('[analytics-supplier]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
