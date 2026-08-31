import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

/**
 * 會員的積分流動明細（migration 646~650 的 point_ledger）
 *
 * 比 token-ledger 那支單純，因為 `point_ledger.balance_after` 是**寫入當下就存好的**，
 * 不用在這裡算 running balance —— 那支為了算餘額要把整條帳撈回來，
 * 還踩過 PostgREST 1,000 筆上限導致第 1,001 筆之後餘額全錯的坑。
 * 帳本存餘額就是為了不要每次都重算。
 */
export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const userId = searchParams.get('userId')
  const type = searchParams.get('type')          // 篩選單一類型，對帳時會用到
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 50
  const offset = (page - 1) * limit

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  let q = supabase
    .from('point_ledger')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (type) q = q.eq('type', type)

  const [{ data: user }, { data: rows, count }] = await Promise.all([
    supabase.from('users').select('id, name, email, points').eq('id', userId).single(),
    q.range(offset, offset + limit - 1),
  ])

  if (!user) return NextResponse.json({ error: '用戶不存在' }, { status: 404 })

  /*
   * 對帳用的健檢：帳本加總跟餘額對不對得起來。
   * 對不上就代表有人繞過 grant_points/spend_points 直接改了 users.points ——
   * 那是必須立刻查的事，所以直接放在畫面上，不要等有人想到去跑 SQL。
   *
   * 走 RPC 而不是 PostgREST 的 `delta.sum()`：聚合要專案開 db-aggregates-enabled，
   * 沒開是回錯誤不是回 0；撈全部自己加又會踩 PostgREST 1,000 筆上限（見 migration 651）。
   */
  const { data: sumVal } = await supabase.rpc('point_ledger_sum', { p_user_id: userId })
  const ledgerSum = Number(sumVal ?? 0)
  const balance = Number(user.points ?? 0)

  return NextResponse.json({
    user,
    ledger: rows ?? [],
    total: count ?? 0,
    pages: Math.max(1, Math.ceil((count ?? 0) / limit)),
    page,
    balance,
    ledgerSum,
    reconciled: ledgerSum === balance,
  })
}
