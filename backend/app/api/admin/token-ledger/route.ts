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
    .select('type, ref_id, delta, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('ref_id', { ascending: true }))

  /*
   * 對照鍵用 `type + ref_id`，**不能用 `ref_id + created_at`**。
   *
   * token_ledger 是五段 UNION（recharge_records ×1、draw_records ×3、
   * token_adjustments ×1），不同來源表的主鍵各自從 1 開始，撞號是常態。
   * PROD 實測：5,434 列裡 `(ref_id, created_at)` 只有 3,516 個相異值 ——
   * **1,918 列（35%）的餘額被同鍵的另一列蓋掉**，而畫面照樣顯示一個看起來合理的數字。
   * `(type, ref_id)` 在 PROD 是 5,434/5,434 完全唯一。
   *
   * 排序補上 ref_id：同一秒內的多筆若順序不定，累加出來的中間餘額會跳來跳去。
   */
  const key = (r: { type?: string; ref_id?: unknown }) => `${r.type}:${r.ref_id}`

  const balanceMap: Record<string, number> = {}
  let running = 0
  for (const r of allRows) {
    // 未成功的儲值在 VIEW 裡 delta 是 NULL（Number(null) === 0，不會污染累加）
    running += Number(r.delta) || 0
    balanceMap[key(r)] = running
  }

  const ledger = (rows ?? []).map(r => ({
    ...r,
    // VIEW 沒有主鍵，補一個穩定的 id 給表格當 key（原本 keyField="id" 拿到的是 undefined）
    id: key(r),
    balance_after: balanceMap[key(r)] ?? null,
  }))

  /*
   * 對帳健檢，跟積分帳本同一套：加總對不上 users.tokens 就代表有人繞過
   * token_adjustments 直接改了欄位（實際發生過：一個帳號被塞 100 萬，
   * 對帳短少 100 萬，2026-08-13 查出）。要看得到，不要等有人想到跑 SQL。
   *
   * running 累加完正好就是帳本加總，不用再查一次。
   */
  const balance = Number(user.tokens ?? 0)

  return NextResponse.json({
    user,
    ledger,
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / limit),
    balance,
    ledgerSum: running,
    reconciled: running === balance,
  })
}
