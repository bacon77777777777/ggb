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

    let bet: number | undefined
    try {
      const body = await request.json()
      bet = typeof body?.bet === 'number' ? body.bet : undefined
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

    const { data, error } = await userSupabase.rpc('enter_slot_rush_direct', {
      p_machine_id: machineId,
      p_bet: bet,
    })

    if (error) throw error

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '直撃失敗' }, { status: 500 })
  }
}
