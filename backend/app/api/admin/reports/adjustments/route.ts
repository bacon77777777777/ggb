import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { TOKEN_ADJUSTMENT_CATEGORIES } from '@/lib/tokenAdjustmentCategories'

/**
 * 手動調整明細（token_adjustments）—— 給會計對帳／報稅用。
 *
 * token_ledger 裡 type='manual' 的全部來源都在這張表：GB哥補幣、後台直接改代幣、
 * 出貨運費扣款、商城保證金／廣告、交易所買賣、直撃 RUSH…… 以 category 欄分類
 * （migration 582：程式明確帶的以程式為準，沒帶的由 trigger 照 created_by／reason 前綴判）。
 *
 * 只回真實玩家（排除 is_bot），區間以台灣時間切日。
 */

export async function GET(request: NextRequest) {
  try {
    const scope = await requireAdminScope()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // /api/admin/reports 在 middleware 對廠商是放行的（為了結算頁）；這支是全站帳本，廠商不能看
    if (scope.supplierScope != null) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const category = searchParams.get('category')
    const q = (searchParams.get('q') ?? '').trim().toLowerCase()

    const supabase = getSupabaseAdmin()
    // 用「排除機器人」而不是「只留真人」：真人會破千（PostgREST 一頁 1000 靜默截斷），機器人只有百來個
    const { data: botRows } = await supabase.from('users').select('id').eq('is_bot', true)
    const botSet = new Set((botRows ?? []).map((b: any) => b.id))

    const build = () => {
      let query = supabase
        .from('token_adjustments')
        .select('id, created_at, user_id, delta, reason, created_by, category, user:users(id, name, email)')
        .order('created_at', { ascending: false })
      if (start) query = query.gte('created_at', `${start}T00:00:00+08:00`)
      if (end)   query = query.lte('created_at', `${end}T23:59:59.999+08:00`)
      if (category && category !== 'all' && TOKEN_ADJUSTMENT_CATEGORIES[category]) query = query.eq('category', category)
      return query
    }

    const raw = await fetchAllRows<any>(build)

    const rows = raw
      .filter(r => !botSet.has(r.user_id))
      .map(r => ({
        id: r.id,
        created_at: r.created_at,
        user_id: r.user_id,
        userName: r.user?.name ?? '（已刪除）',
        userEmail: r.user?.email ?? '',
        delta: Number(r.delta ?? 0),
        reason: r.reason ?? '',
        created_by: r.created_by ?? '',
        category: r.category ?? 'other',
        categoryLabel: TOKEN_ADJUSTMENT_CATEGORIES[r.category] ?? r.category ?? '其他',
      }))
      .filter(r => !q || r.userName.toLowerCase().includes(q) || r.userEmail.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q))

    // 依分類小計：+ 補出去、− 扣回來，淨額給對帳公式的 manual_total 對
    const byCategory: Record<string, { count: number; plus: number; minus: number; net: number }> = {}
    let total = { count: 0, plus: 0, minus: 0, net: 0 }
    for (const r of rows) {
      const c = byCategory[r.category] ?? (byCategory[r.category] = { count: 0, plus: 0, minus: 0, net: 0 })
      c.count++; total.count++
      if (r.delta >= 0) { c.plus += r.delta; total.plus += r.delta } else { c.minus += -r.delta; total.minus += -r.delta }
      c.net += r.delta; total.net += r.delta
    }

    return NextResponse.json({ data: rows, byCategory, total, categories: TOKEN_ADJUSTMENT_CATEGORIES })
  } catch (error: any) {
    console.error('[reports/adjustments]', error)
    return NextResponse.json({ error: error.message || '載入手動調整明細失敗' }, { status: 500 })
  }
}
