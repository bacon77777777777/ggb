import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

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

  // 計算累計餘額（從最舊到最新，再倒序輸出）
  // 先取所有記錄算 running balance（最多取 2000 筆）
  const { data: allRows } = await supabase
    .from('token_ledger')
    .select('ref_id, delta, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(2000)

  const balanceMap: Record<string, number> = {}
  let running = 0
  for (const r of allRows ?? []) {
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
