import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

/*
 * 保證金查帳。
 *
 * 唯讀。保證金的收／退／賠一律由 DB 函式在交易流程裡處理
 * （sell_deposit_charge / _release / _forfeit），後台不提供手動調整 ——
 * 手動改會讓 users.tokens 與 sell_deposits 對不起來，
 * 而這張表的用途就是出爭議時的證據。
 */

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || ''

    const supabaseAdmin = getSupabaseAdmin()

    let q = supabaseAdmin
      .from('sell_deposits')
      .select('id, order_id, seller_id, buyer_id, amount, status, released_at, note, created_at')
      .order('created_at', { ascending: false })
      .limit(300)

    if (status) q = q.eq('status', status)

    const { data: rows, error } = await q
    if (error) throw error

    const userIds = Array.from(
      new Set((rows || []).flatMap((r: any) => [r.seller_id, r.buyer_id]).filter(Boolean))
    )
    const { data: users } = userIds.length
      ? await supabaseAdmin.from('users').select('id, name, email').in('id', userIds)
      : { data: [] as any[] }

    const byId = new Map((users || []).map((u: any) => [u.id, u]))

    // 統計整體曝險：目前鎖了多少、賠出去多少
    const { data: allRows } = await supabaseAdmin.from('sell_deposits').select('amount, status')
    const sum = (s: string) =>
      (allRows || []).filter((r: any) => r.status === s).reduce((a: number, r: any) => a + (r.amount || 0), 0)

    return NextResponse.json({
      rows: (rows || []).map((r: any) => ({
        ...r,
        seller_name: byId.get(r.seller_id)?.name || '—',
        seller_email: byId.get(r.seller_id)?.email || '',
        buyer_name: byId.get(r.buyer_id)?.name || '—',
      })),
      stats: {
        locked: sum('locked'),
        released: sum('released'),
        forfeited: sum('forfeited'),
        forfeitedCount: (allRows || []).filter((r: any) => r.status === 'forfeited').length,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '讀取失敗' }, { status: 500 })
  }
}
