import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

function parseDateRange(searchParams: URLSearchParams): { since: string; until: string } {
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const now = new Date()

  if (start && end) {
    const since = new Date(start)
    since.setHours(0, 0, 0, 0)
    const until = new Date(end)
    until.setHours(23, 59, 59, 999)
    return { since: since.toISOString(), until: until.toISOString() }
  }

  // fallback: today
  const since = new Date(now)
  since.setHours(0, 0, 0, 0)
  const until = new Date(now)
  until.setHours(23, 59, 59, 999)
  return { since: since.toISOString(), until: until.toISOString() }
}

const CLICK_EVENTS = new Set([
  'draw', 'draw_single', 'draw_multi', 'draw_preview', 'draw_trial',
  'delivery_modal_open', 'delivery_logistics_select', 'delivery_success', 'delivery_abandon',
  'dismantle', 'list_to_market', 'topup_plan_select', 'topup_success',
  'banner_click', 'leaderboard_view', 'winning_records_view',
  'search_query', 'marketplace_item_view', 'prize_reveal', 'tab_switch',
  'insufficient_balance', 'error_draw_fail', 'error_delivery_fail',
])

const EVENT_LABEL: Record<string, string> = {
  draw: '轉蛋（舊版）',
  draw_single: '立即轉蛋（單抽）',
  draw_multi: '立即轉蛋（多抽）',
  draw_preview: '推一下',
  draw_trial: '試試看',
  prize_reveal: '獎項揭曉',
  insufficient_balance: '餘額不足彈窗',
  topup_plan_select: '選擇儲值方案',
  topup_success: '儲值成功',
  delivery_modal_open: '申請配送按鈕',
  delivery_logistics_select: '選擇物流方式',
  delivery_success: '確認送出配送',
  delivery_abandon: '關閉配送彈窗',
  dismantle: '分解按鈕',
  list_to_market: '上架市集',
  banner_click: 'Banner 點擊',
  leaderboard_view: '排行榜',
  winning_records_view: '開獎紀錄',
  search_query: '搜尋',
  marketplace_item_view: '查看市集商品',
  tab_switch: 'Tab 切換',
  error_draw_fail: '轉蛋失敗',
  error_delivery_fail: '配送失敗',
}

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const { since, until } = parseDateRange(searchParams)

    const supabase = getSupabaseAdmin()

    // Fetch all events in range
    let query = supabase
      .from('user_events')
      .select('event_type, product_id, path, meta, created_at')
      .gte('created_at', since)
      .lte('created_at', until)
      .limit(100000)

    const { data: events, error } = await query
    if (error) throw error

    // Collect all product IDs referenced
    const productIds = new Set<number>()
    for (const e of events ?? []) {
      if (e.product_id) productIds.add(e.product_id)
      // also extract from path like /item/123 or /gacha/123
      const match = e.path?.match(/\/(item|gacha|shop|blindbox|card)\/(\d+)/)
      if (match) productIds.add(Number(match[2]))
    }

    // Fetch product names
    const productMap: Record<number, string> = {}
    if (productIds.size > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', Array.from(productIds))
      for (const p of products ?? []) productMap[p.id] = p.name
    }

    // --- 1. Product view counts (all products, 0 if none) ---
    const pvMap: Record<number, number> = {}
    for (const e of events ?? []) {
      if (e.event_type !== 'product_view') continue
      const pid = e.product_id
      if (!pid) continue
      pvMap[pid] = (pvMap[pid] ?? 0) + 1
    }
    // fetch all products to show full list including 0
    const { data: allProducts } = await supabase
      .from('products')
      .select('id, name')
      .order('id', { ascending: true })
    const productViews = (allProducts ?? []).map(p => ({
      product_id: p.id,
      product_name: p.name,
      count: pvMap[p.id] ?? 0,
    })).sort((a, b) => b.count - a.count)

    // --- 2. Button click counts (always full list, 0 if none) ---
    const clickMap: Record<string, number> = {}
    for (const e of events ?? []) {
      if (!CLICK_EVENTS.has(e.event_type)) continue
      clickMap[e.event_type] = (clickMap[e.event_type] ?? 0) + 1
    }
    const buttonClicks = Array.from(CLICK_EVENTS).map(event_type => ({
      event_type,
      label: EVENT_LABEL[event_type] ?? event_type,
      count: clickMap[event_type] ?? 0,
    })).sort((a, b) => b.count - a.count)

    // --- 3. Page dwell times ---
    const dwellMap: Record<string, number[]> = {}
    for (const e of events ?? []) {
      if (e.event_type !== 'page_exit') continue
      const path = e.path ?? 'unknown'
      const dwell = (e.meta as Record<string, unknown>)?.dwell_seconds
      if (typeof dwell === 'number' && dwell > 0 && dwell < 7200) {
        if (!dwellMap[path]) dwellMap[path] = []
        dwellMap[path].push(dwell)
      }
    }
    const pageDwells = Object.entries(dwellMap).map(([path, times]) => {
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      const match = path.match(/\/(item|gacha|shop|blindbox|card)\/(\d+)/)
      const productName = match ? (productMap[Number(match[2])] ?? null) : null
      return { path, product_name: productName, avg_seconds: avg, sample_count: times.length }
    }).sort((a, b) => b.sample_count - a.sample_count)

    // --- 4. Insights ---
    const countOf = (type: string) => clickMap[type] ?? 0
    const insights: { level: 'warn' | 'info' | 'ok'; message: string }[] = []

    const totalViews = pvMap ? Object.values(pvMap).reduce((a, b) => a + b, 0) : 0
    const totalDraws = countOf('draw_single') + countOf('draw_multi') + countOf('draw')
    const convRate = totalViews > 0 ? totalDraws / totalViews : 0

    if (totalViews > 5) {
      if (convRate < 0.05) insights.push({ level: 'warn', message: `商品詳情轉蛋轉換率僅 ${(convRate * 100).toFixed(1)}%，建議優化商品頁說明文案或調整定價` })
      else if (convRate >= 0.3) insights.push({ level: 'ok', message: `轉換率 ${(convRate * 100).toFixed(1)}%，表現優秀` })
      else insights.push({ level: 'info', message: `轉換率 ${(convRate * 100).toFixed(1)}%（商品瀏覽 ${totalViews} → 轉蛋 ${totalDraws}）` })
    }

    const insuf = countOf('insufficient_balance')
    const topupPage = countOf('topup_page_view') || countOf('topup_plan_select')
    if (insuf >= 3) {
      const rate = topupPage / insuf
      if (rate < 0.3) insights.push({ level: 'warn', message: `${insuf} 次餘額不足，僅 ${(rate * 100).toFixed(0)}% 前往儲值，建議加強餘額不足的儲值引導彈窗` })
    }

    const openDelivery = countOf('delivery_modal_open')
    const successDelivery = countOf('delivery_success')
    const abandonDelivery = countOf('delivery_abandon')
    if (openDelivery >= 3) {
      const abandonRate = abandonDelivery / openDelivery
      if (abandonRate > 0.4) insights.push({ level: 'warn', message: `配送流程放棄率 ${(abandonRate * 100).toFixed(0)}%，建議檢查填單流程是否過於繁瑣` })
    }
    if (successDelivery > 0) insights.push({ level: 'info', message: `本時段完成 ${successDelivery} 筆配送申請` })

    const preview = countOf('draw_preview')
    const trial = countOf('draw_trial')
    if (preview + trial > 0) insights.push({ level: 'info', message: `「推一下」${preview} 次、「試試看」${trial} 次，顯示用戶轉蛋前的觀望行為` })

    // Longest dwell page
    if (pageDwells.length > 0) {
      const longest = [...pageDwells].sort((a, b) => b.avg_seconds - a.avg_seconds)[0]
      const label = longest.product_name ? `${longest.path}（${longest.product_name}）` : longest.path
      const m = Math.floor(longest.avg_seconds / 60)
      const s = longest.avg_seconds % 60
      insights.push({ level: 'info', message: `停留最久頁面：${label}，平均 ${m > 0 ? `${m}分` : ''}${s}秒` })
    }

    return NextResponse.json({
      meta: { since, until, total_events: events?.length ?? 0 },
      product_views: productViews,
      button_clicks: buttonClicks,
      page_dwells: pageDwells,
      insights,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '載入失敗' }, { status: 500 })
  }
}
