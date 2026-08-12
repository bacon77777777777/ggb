import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'

const parseDateOnly = (value: string | null) => {
  if (!value) return null
  // 解析為台灣時間 (UTC+8) 的該日 00:00
  const d = new Date(`${value}T00:00:00+08:00`)
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

    /*
     * 儲值與抽獎走 fetchAllRows —— PostgREST 預設只回 1000 列且靜默截斷，
     * 儀表板的營收、筆數、熱門商品全是拿這兩批在 JS 端算的，
     * 過千就整片偏低（同樣的洞在分析頁與廠商結算都修過）。
     */
    const [recharges, draws, { data: users, error: userError }, { data: coupons }] =
      await Promise.all([
        fetchAllRows<any>(() => excludeBots(
          supabaseAdmin
            .from('recharge_records')
            .select('amount, created_at, user_id')
            .eq('status', 'success')
            .gte('created_at', startDate.toISOString())
            .lt('created_at', queryEndDate.toISOString())
        )),
        fetchAllRows<any>(() => excludeBots(
          supabaseAdmin
            .from('draw_records')
            .select(
              `
                created_at,
                prize_level,
                products (id, name, price, type, category, series)
              `
            )
            .gte('created_at', startDate.toISOString())
            .lt('created_at', queryEndDate.toISOString())
        )),
        supabaseAdmin.from('users').select('created_at, tokens, id').or('is_bot.eq.false,is_bot.is.null'),
        supabaseAdmin
          .from('user_coupons')
          .select('used_at, coupon:coupons(discount_type, discount_value)')
          .eq('status', 'used')
          .gte('used_at', startDate.toISOString())
          .lt('used_at', queryEndDate.toISOString()),
      ])

    // recharges／draws 改走 fetchAllRows，它自己會在查詢出錯時丟例外
    if (userError) throw userError

    let couponDiscountFixed = 0
    for (const uc of coupons ?? []) {
      const c = (uc as any).coupon
      if (!c) continue
      if (c.discount_type === 'fixed') couponDiscountFixed += Number(c.discount_value) || 0
    }

    return NextResponse.json({
      recharges: recharges ?? [],
      draws: draws ?? [],
      users: users ?? [],
      couponDiscountFixed,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

