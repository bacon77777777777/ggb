import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const machineId = parseInt(id)
    if (isNaN(machineId)) return NextResponse.json({ error: '無效機台 ID' }, { status: 400 })

    const ssrSupabase = await createSsrClient()
    const { data: { user } } = await ssrSupabase.auth.getUser()
    if (!user) return NextResponse.json({ session: null })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 同時查 per-user 統計 + 機台層級 RUSH 狀態
    const [userSessionRes, machineRes] = await Promise.all([
      supabase
        .from('slot_sessions')
        .select('tier_progress, total_spins')
        .eq('user_id', user.id)
        .eq('machine_id', machineId)
        .single(),
      supabase
        .from('slot_machines')
        .select('rush_state, rush_hits_remaining, rush_locked_bet, floor_counter, day_spins, day_rush, day_reset_date')
        .eq('id', machineId)
        .single(),
    ])

    const userSession = userSessionRes.data
    const machine = machineRes.data

    if (!machine) return NextResponse.json({ session: null })

    // 每日統計：台灣時間跨日視為歸零（DB 於下一次 spin 才實際重置）
    const taiwanToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
    const isToday = machine.day_reset_date === taiwanToday

    // 合併成前端期望的 session 結構（RUSH 狀態來自機台，統計來自 user session）
    return NextResponse.json({
      session: {
        state:               machine.rush_state ?? 'normal',
        rush_hits_remaining: machine.rush_hits_remaining ?? 0,
        locked_bet:          machine.rush_locked_bet ?? null,
        spins_since_rush:    machine.floor_counter ?? 0,   // 機台層級保底計數
        floor_counter:       machine.floor_counter ?? 0,
        tier_progress:       userSession?.tier_progress ?? {},
        total_spins:         userSession?.total_spins ?? 0,
        day_spins:           isToday ? (machine.day_spins ?? 0) : 0,
        day_rush:            isToday ? (machine.day_rush ?? 0) : 0,
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
