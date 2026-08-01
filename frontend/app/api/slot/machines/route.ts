import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('slot_machines')
      .select(`
        id, name, description, image_url, price_per_spin, is_active,
        sort_order, bet_tiers, floor_spin_count, floor_counter, trigger_rate,
        machine_theme, event_slug, theme_id, machine_number, rush_state,
        occupant_id, occupant_active_until, occupancy_expires_at,
        slot_themes(
          id, name, image_url, event_slug,
          video_rush_entry, video_rush_anticipation,
          video_rush_win, video_rush_win_strong,
          video_rush_win_god, video_rush_revival
        )
      `)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) throw error

    // 近 7 日每日 RUSH 次數（觸發 + 直擊），台灣時區切日，供列表走勢圖
    const since = new Date(Date.now() - 7 * 86400_000).toISOString()
    const { data: logs } = await supabase
      .from('slot_spin_logs')
      .select('machine_id, created_at')
      .in('kind', ['rush_trigger', 'direct_entry'])
      .gte('created_at', since)

    const dayKey = (iso: string) =>
      new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
    const days: string[] = Array.from({ length: 7 }, (_, i) =>
      dayKey(new Date(Date.now() - (6 - i) * 86400_000).toISOString())
    )
    const rushTrend: Record<number, number[]> = {}
    for (const m of data ?? []) rushTrend[(m as { id: number }).id] = Array(7).fill(0)
    for (const l of logs ?? []) {
      const idx = days.indexOf(dayKey((l as { created_at: string }).created_at))
      const mid = (l as { machine_id: number }).machine_id
      if (idx >= 0 && rushTrend[mid]) rushTrend[mid][idx]++
    }

    return NextResponse.json({ machines: data ?? [], rush_trend: rushTrend })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
