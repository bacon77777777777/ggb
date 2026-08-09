import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

export const runtime = 'nodejs'

/**
 * 促銷方案
 *
 * 目前只有 bundle（買 N 送 M）。scope=category 時掛在分類上，
 * 之後往那個分類丟商品會自動繼承，不必逐一設定 —— 這是老闆要的
 * 「連動分類清單」。
 */

const VALID_SCOPE = ['product', 'category', 'all']

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('promotions')
    .select('*, promotion_targets(product_id, category_id)')
    .order('priority', { ascending: false })
    .order('id', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 用掉幾次、送出幾抽。做促銷的人第一個想知道的就是這個
  // （517 起促銷是「多送抽」：bonus_count=送出抽數、discount=贈品零售價值）
  const { data: stats } = await supabase
    .from('promotion_redemptions')
    .select('promotion_id, discount, bonus_count')
  const agg = new Map<number, { uses: number; discount: number; bonus: number }>()
  for (const r of stats ?? []) {
    const k = Number(r.promotion_id)
    const e = agg.get(k) ?? { uses: 0, discount: 0, bonus: 0 }
    e.uses += 1
    e.discount += Number(r.discount) || 0
    e.bonus += Number((r as { bonus_count?: number }).bonus_count) || 0
    agg.set(k, e)
  }

  return NextResponse.json((data ?? []).map(p => ({
    ...p,
    uses: agg.get(p.id)?.uses ?? 0,
    total_discount: agg.get(p.id)?.discount ?? 0,
    total_bonus: agg.get(p.id)?.bonus ?? 0,
  })))
}

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const b = await request.json()
    const name = String(b?.name ?? '').trim()
    const scope = String(b?.scope ?? '')
    const buy = Number(b?.buy)
    const free = Number(b?.free)

    if (!name) return NextResponse.json({ error: '請輸入方案名稱' }, { status: 400 })
    if (!VALID_SCOPE.includes(scope)) return NextResponse.json({ error: '適用範圍不正確' }, { status: 400 })
    if (!(buy >= 1) || !(free >= 1)) return NextResponse.json({ error: '買幾抽送幾抽要大於 0' }, { status: 400 })

    const targets: { product_id?: number; category_id?: string }[] =
      scope === 'product' ? (b?.productIds ?? []).map((id: number) => ({ product_id: Number(id) }))
      : scope === 'category' ? (b?.categoryIds ?? []).map((id: string) => ({ category_id: String(id) }))
      : []
    if (scope !== 'all' && !targets.length) {
      return NextResponse.json({ error: '請至少選一個適用對象' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: promo, error } = await supabase.from('promotions').insert({
      name,
      type: 'bundle',
      config: { buy, free },
      badge_text: String(b?.badgeText ?? '').trim() || `買${buy}送${free}`,
      scope,
      starts_at: b?.startsAt || null,
      ends_at: b?.endsAt || null,
      is_active: b?.isActive !== false,
      priority: Number(b?.priority) || 0,
    }).select('id').single()
    if (error || !promo) return NextResponse.json({ error: error?.message ?? '建立失敗' }, { status: 500 })

    if (targets.length) {
      const { error: tErr } = await supabase.from('promotion_targets')
        .insert(targets.map(t => ({ ...t, promotion_id: promo.id })))
      if (tErr) {
        // 目標寫不進去的話這個方案等於沒有適用對象，留著只會讓人以為有在跑
        await supabase.from('promotions').delete().eq('id', promo.id)
        return NextResponse.json({ error: tErr.message }, { status: 500 })
      }
    }

    await logAdminAction({
      adminId: session.adminId, action: '建立促銷方案',
      targetType: 'promotions', targetId: String(promo.id),
      detail: { name, scope, buy, free }, ip: getClientIp(request),
    })
    return NextResponse.json({ id: promo.id })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '建立失敗' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await request.json()
  if (!b?.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.isActive !== undefined) patch.is_active = Boolean(b.isActive)
  if (b.priority !== undefined) patch.priority = Number(b.priority) || 0
  if (b.endsAt !== undefined) patch.ends_at = b.endsAt || null

  const { error } = await getSupabaseAdmin().from('promotions').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: session.adminId, action: '調整促銷方案',
    targetType: 'promotions', targetId: String(b.id), detail: patch, ip: getClientIp(request),
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  // promotion_targets 是 CASCADE；promotion_redemptions 的 promotion_id 設成 NULL，
  // 歷史折抵記錄要留著，那是結算的依據
  const { error } = await getSupabaseAdmin().from('promotions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: session.adminId, action: '刪除促銷方案',
    targetType: 'promotions', targetId: id, ip: getClientIp(request),
  })
  return NextResponse.json({ ok: true })
}
