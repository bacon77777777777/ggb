import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

const parseDateOnly = (value: string | null) => {
  if (!value) return null
  const d = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d
}

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('start')
    const endStr = searchParams.get('end')

    const startDate = parseDateOnly(startStr)
    const endDate = parseDateOnly(endStr)
    if (!startDate || !endDate) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })

    const queryEndDate = new Date(endDate)
    queryEndDate.setUTCDate(queryEndDate.getUTCDate() + 1)

    const supabaseAdmin = getSupabaseAdmin()

    // 取得機器人 user_id 列表，後續所有查詢排除
    const { data: botRows } = await supabaseAdmin.from('users').select('id').eq('is_bot', true)
    const botIds = (botRows ?? []).map((r: any) => r.id as string)
    const excludeBots = (q: any) => botIds.length > 0 ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q

    const [{ data: recharges, error: rechargeError }, { data: draws, error: drawError }, { data: users, error: userError }] =
      await Promise.all([
        excludeBots(
          supabaseAdmin
            .from('recharge_records')
            .select('amount, created_at, user_id')
            .gte('created_at', startDate.toISOString())
            .lt('created_at', queryEndDate.toISOString())
        ),
        excludeBots(
          supabaseAdmin
            .from('draw_records')
            .select(
              `
                created_at,
                prize_level,
                products (id, name, price, type, category)
              `
            )
            .gte('created_at', startDate.toISOString())
            .lt('created_at', queryEndDate.toISOString())
        ),
        supabaseAdmin.from('users').select('created_at, tokens, id').or('is_bot.eq.false,is_bot.is.null'),
      ])

    if (rechargeError) throw rechargeError
    if (drawError) throw drawError
    if (userError) throw userError

    return NextResponse.json({
      recharges: recharges ?? [],
      draws: draws ?? [],
      users: users ?? [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

