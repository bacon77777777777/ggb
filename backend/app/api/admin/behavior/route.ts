import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const days = Math.min(parseInt(searchParams.get('days') ?? '7'), 90)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const supabase = getSupabaseAdmin()

    const [eventsRes, pageExitRes, productViewRes] = await Promise.all([
      // 1. All events in range
      supabase
        .from('user_events')
        .select('id, user_id, event_type, product_id, path, meta, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50000),

      // 2. Page exit events (for dwell time)
      supabase
        .from('user_events')
        .select('path, meta')
        .eq('event_type', 'page_exit')
        .gte('created_at', since),

      // 3. Product views with product name
      supabase
        .from('user_events')
        .select('product_id, meta, created_at')
        .eq('event_type', 'product_view')
        .gte('created_at', since),
    ])

    if (eventsRes.error) throw eventsRes.error

    const events = eventsRes.data ?? []

    // --- Event counts ---
    const eventCounts: Record<string, number> = {}
    const dauMap: Record<string, Set<string>> = {}
    const hourMap: Record<number, number> = {}

    for (const e of events) {
      eventCounts[e.event_type] = (eventCounts[e.event_type] ?? 0) + 1

      if (e.user_id) {
        const day = e.created_at.slice(0, 10)
        if (!dauMap[day]) dauMap[day] = new Set()
        dauMap[day].add(e.user_id)
      }

      const hour = new Date(e.created_at).getHours()
      hourMap[hour] = (hourMap[hour] ?? 0) + 1
    }

    // --- DAU by day ---
    const dauByDay = Object.entries(dauMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, users]) => ({ date, dau: users.size }))

    // --- Active hours ---
    const activeHours = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourMap[h] ?? 0,
    }))

    // --- Page dwell times ---
    const dwellMap: Record<string, number[]> = {}
    for (const e of pageExitRes.data ?? []) {
      const path = e.path ?? 'unknown'
      const dwell = (e.meta as { dwell_seconds?: number })?.dwell_seconds
      if (typeof dwell === 'number' && dwell > 0 && dwell < 3600) {
        if (!dwellMap[path]) dwellMap[path] = []
        dwellMap[path].push(dwell)
      }
    }
    const pageDwells = Object.entries(dwellMap)
      .map(([path, times]) => ({
        path,
        avg_seconds: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
        sample_count: times.length,
      }))
      .sort((a, b) => b.sample_count - a.sample_count)
      .slice(0, 20)

    // --- Top products by view ---
    const productViewCount: Record<number, { count: number; name: string }> = {}
    for (const e of productViewRes.data ?? []) {
      if (!e.product_id) continue
      const name = (e.meta as { product_name?: string })?.product_name ?? `#${e.product_id}`
      if (!productViewCount[e.product_id]) {
        productViewCount[e.product_id] = { count: 0, name }
      }
      productViewCount[e.product_id].count++
    }
    const topProducts = Object.entries(productViewCount)
      .map(([id, v]) => ({ product_id: Number(id), name: v.name, views: v.count }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10)

    // --- Conversion funnel ---
    const countEvent = (type: string) => eventCounts[type] ?? 0
    const funnel = [
      { step: '商品瀏覽', count: countEvent('product_view') },
      { step: '點擊轉蛋', count: countEvent('draw_single') + countEvent('draw_multi') + countEvent('draw') },
      { step: '餘額不足', count: countEvent('insufficient_balance') },
      { step: '前往儲值', count: countEvent('topup_page_view') },
      { step: '儲值成功', count: countEvent('topup_success') },
    ]

    // --- Insights (rule-based) ---
    const insights: { level: 'warn' | 'info' | 'ok'; message: string }[] = []

    const totalViews = countEvent('product_view')
    const totalDraws = countEvent('draw_single') + countEvent('draw_multi') + countEvent('draw')
    const conversionRate = totalViews > 0 ? (totalDraws / totalViews) : 0

    if (conversionRate < 0.1 && totalViews > 20) {
      insights.push({ level: 'warn', message: `商品瀏覽到轉蛋轉換率僅 ${(conversionRate * 100).toFixed(1)}%，建議優化商品頁說明或調整定價` })
    } else if (conversionRate >= 0.3) {
      insights.push({ level: 'ok', message: `轉換率 ${(conversionRate * 100).toFixed(1)}% 表現良好` })
    }

    const insufBalance = countEvent('insufficient_balance')
    const topupTriggered = countEvent('topup_page_view')
    if (insufBalance > 10) {
      const topupRate = topupTriggered > 0 ? (topupTriggered / insufBalance) : 0
      if (topupRate < 0.4) {
        insights.push({ level: 'warn', message: `${insufBalance} 次餘額不足中僅 ${(topupRate * 100).toFixed(0)}% 前往儲值，引導文案可再加強` })
      }
    }

    const deliveryOpen = countEvent('delivery_modal_open')
    const deliverySuccess = countEvent('delivery_success')
    const deliveryAbandon = countEvent('delivery_abandon')
    if (deliveryOpen > 5) {
      const abandonRate = deliveryAbandon / deliveryOpen
      if (abandonRate > 0.5) {
        insights.push({ level: 'warn', message: `配送流程放棄率 ${(abandonRate * 100).toFixed(0)}%，建議簡化填單流程` })
      }
    }
    if (deliverySuccess > 0) {
      insights.push({ level: 'info', message: `近 ${days} 天共完成 ${deliverySuccess} 筆配送申請` })
    }

    const peakHour = activeHours.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, count: 0 })
    if (peakHour.count > 0) {
      insights.push({ level: 'info', message: `用戶最活躍時段為 ${peakHour.hour}:00 — ${peakHour.hour + 1}:00，建議在此時段推送活動` })
    }

    const drawPreview = countEvent('draw_preview')
    const drawTrial = countEvent('draw_trial')
    if (drawPreview > 0 || drawTrial > 0) {
      insights.push({ level: 'info', message: `「推一下」${drawPreview} 次、「試試看」${drawTrial} 次，顯示用戶轉蛋前的猶豫行為` })
    }

    return NextResponse.json({
      meta: { days, since, total_events: events.length },
      event_counts: Object.entries(eventCounts)
        .map(([event_type, count]) => ({ event_type, count }))
        .sort((a, b) => b.count - a.count),
      dau_by_day: dauByDay,
      active_hours: activeHours,
      page_dwells: pageDwells,
      top_products: topProducts,
      funnel,
      insights,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '載入失敗' }, { status: 500 })
  }
}
