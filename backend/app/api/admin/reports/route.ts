import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET(request: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'recharge'
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  const supabase = getSupabaseAdmin()

  // end date is inclusive — add 1 day for lt comparison
  const endExclusive = end
    ? new Date(new Date(end).getTime() + 86400000).toISOString().split('T')[0]
    : null

  try {
    if (tab === 'recharge') {
      let query = supabase
        .from('recharge_records')
        .select('*, user:users(id, name, email)')
        .order('created_at', { ascending: false })

      if (start) query = query.gte('created_at', start)
      if (endExclusive) query = query.lt('created_at', endExclusive)

      const { data, error } = await query
      if (error) throw error
      return NextResponse.json({ data: data ?? [] })
    }

    if (tab === 'consumption') {
      let query = supabase
        .from('draw_records')
        .select('*, user:users(id, name, email), product:products(id, name, price)')
        .order('created_at', { ascending: false })

      if (start) query = query.gte('created_at', start)
      if (endExclusive) query = query.lt('created_at', endExclusive)

      const { data, error } = await query
      if (error) throw error
      return NextResponse.json({ data: data ?? [] })
    }

    if (tab === 'summary') {
      const [rechargeRes, drawRes, userRes] = await Promise.all([
        (() => {
          let q = supabase.from('recharge_records').select('amount, user_id, status, created_at')
          if (start) q = q.gte('created_at', start)
          if (endExclusive) q = q.lt('created_at', endExclusive)
          return q
        })(),
        (() => {
          let q = supabase.from('draw_records').select('id, user_id, prize_level, created_at, product:products(price)')
          if (start) q = q.gte('created_at', start)
          if (endExclusive) q = q.lt('created_at', endExclusive)
          return q
        })(),
        (() => {
          let q = supabase.from('users').select('id, created_at')
          if (start) q = q.gte('created_at', start)
          if (endExclusive) q = q.lt('created_at', endExclusive)
          return q
        })(),
      ])

      if (rechargeRes.error) throw rechargeRes.error
      if (drawRes.error) throw drawRes.error
      if (userRes.error) throw userRes.error

      const recharges = rechargeRes.data ?? []
      const draws = drawRes.data ?? []
      const newUsers = userRes.data ?? []

      const completed = recharges.filter((r) => r.status === 'completed')
      const totalRecharge = completed.reduce((s, r) => s + (r.amount || 0), 0)
      const totalRechargeCount = completed.length
      const totalTokenConsumed = draws.reduce((s, d: any) => s + (d.product?.price || 0), 0)
      const totalDraws = draws.length
      const uniquePayers = new Set(completed.map((r) => r.user_id)).size
      const avgPerPayer = uniquePayers > 0 ? Math.round(totalRecharge / uniquePayers) : 0

      // Daily breakdown
      const byDay: Record<string, { recharge: number; draws: number; newUsers: number }> = {}
      const addDay = (date: string) => {
        const d = date.split('T')[0]
        if (!byDay[d]) byDay[d] = { recharge: 0, draws: 0, newUsers: 0 }
      }
      completed.forEach((r) => { addDay(r.created_at); byDay[r.created_at.split('T')[0]].recharge += r.amount || 0 })
      draws.forEach((d) => { addDay(d.created_at); byDay[d.created_at.split('T')[0]].draws += 1 })
      newUsers.forEach((u) => { addDay(u.created_at); byDay[u.created_at.split('T')[0]].newUsers += 1 })

      const dailyBreakdown = Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }))

      return NextResponse.json({
        summary: {
          totalRecharge,
          totalRechargeCount,
          totalTokenConsumed,
          totalDraws,
          newUserCount: newUsers.length,
          uniquePayers,
          avgPerPayer,
        },
        dailyBreakdown,
      })
    }

    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
  } catch (error: any) {
    console.error('Reports API error:', error)
    return NextResponse.json({ error: error.message || '載入失敗' }, { status: 500 })
  }
}
