import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'

export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const userId  = searchParams.get('userId')
  const query   = searchParams.get('q')        // email / name 搜尋
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit   = 50
  const offset  = (page - 1) * limit

  const supabase = getSupabaseAdmin()

  // 用 q 搜尋用戶
  if (query && !userId) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, tokens')
      .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
      .eq('is_bot', false)
      .limit(20)
    return NextResponse.json({ users: users ?? [] })
  }

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const [
    { data: user },
    { data: rows, count },
  ] = await Promise.all([
    supabase.from('users').select('id, name, email, tokens').eq('id', userId).single(),
    supabase
      .from('token_ledger')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
  ])

  if (!user) return NextResponse.json({ error: '用戶不存在' }, { status: 404 })

  /*
   * 累計餘額（從最舊到最新算 running balance，再倒序輸出）
   *
   * ⚠️ 這裡本來寫 .limit(2000)，但 PostgREST 上限就是 1,000 筆 ——
   * 超過 1,000 筆的帳號，第 1,001 筆之後的「餘額」全部是錯的。
   * PROD 上 bacon731 就有 3,167 筆。running balance 少加了七成的異動，
   * 算出來的餘額看起來仍是個合理數字，但跟實際餘額對不起來。
   */
  const allRows = await fetchAllRows<any>(() => supabase
    .from('token_ledger')
    .select('ref_id, delta, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true }))

  const balanceMap: Record<string, number> = {}
  let running = 0
  for (const r of allRows) {
    running += Number(r.delta)
    balanceMap[`${r.ref_id}_${r.created_at}`] = running
  }

  const ledger = (rows ?? []).map(r => ({
    ...r,
    balance_after: balanceMap[`${r.ref_id}_${r.created_at}`] ?? null,
  }))

  return NextResponse.json({
    user,
    ledger,
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / limit),
  })
}
