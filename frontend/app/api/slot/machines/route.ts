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
        day_rush, day_reset_date, start_at, end_at,
        slot_themes(
          id, name, image_url, event_slug, start_at, end_at,
          video_rush_entry, video_rush_anticipation,
          video_rush_win, video_rush_win_strong,
          video_rush_win_god, video_rush_revival
        )
      `)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) throw error

    return NextResponse.json({ machines: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
