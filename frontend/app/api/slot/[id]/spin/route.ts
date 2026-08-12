import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { drawLimiter } from '@/lib/ratelimit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const machineId = parseInt(id)
    if (isNaN(machineId)) return NextResponse.json({ error: '無效機台 ID' }, { status: 400 })

    const ssrSupabase = await createSsrClient()
    const { data: { session } } = await ssrSupabase.auth.getSession()
    const user = session?.user
    if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

    const { success } = await drawLimiter.limit(user.id)
    if (!success) {
      return NextResponse.json({ error: '操作太頻繁，請稍候再試' }, { status: 429 })
    }

    let bet: number | undefined;
    try {
      const body = await request.json();
      bet = typeof body?.bet === 'number' ? body.bet : undefined;
    } catch { /* no body */ }

    if (!bet) {
      return NextResponse.json({ error: '請指定下注檔次' }, { status: 400 })
    }

    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      }
    )

    const { data, error } = await userSupabase.rpc('play_slot_locked', {
      p_machine_id: machineId,
      p_bet: bet,
    })

    if (error) throw error

    // 抽到 RUSH 獎池品項才算一抽 —— 退幣是找零，不是抽獎結果。
    // 實測一台下來 86% 的轉是退幣，若每轉都算，機台玩家單日 196 轉
    // 就吃掉「火力全開 單日100抽」，轉蛋玩家要花 29,400 代幣才追得上。
    // 折算後約 7 轉中 1 次品項 = 70 代幣/抽，跟轉蛋單抽 150 同一量級。
    //
    // 這裡不推 spend_amount：那個事件目前是拿「抽了幾次」當「花了幾代幣」
    // 在算（見 /api/gacha 的 p_data.amount），機台照著推只會讓它更歪。
    const spin = data as { is_coin_return?: boolean } | null
    if (spin && !spin.is_coin_return) {
      // Fire-and-forget: 不阻塞轉動的回應
      Promise.allSettled([
        userSupabase.rpc('track_mission_event', { p_event_type: 'draw_count', p_data: { count: 1 } }),
      ]).catch(() => {})
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '挑戰失敗' }, { status: 500 })
  }
}
