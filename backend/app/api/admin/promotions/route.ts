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
/**
 * 促銷型別（migration 608）：
 *   bundle          買 N 送 M（收入不打折、多送庫存）
 *   first_n         全站前 N 個付費抽打折（配額共享，搶完為止）
 *   first_per_user  每人在該商品的付費首抽打折（限一次）
 * 折扣一律在 play_ichiban／play_gacha 伺服器端算，這裡只存設定。
 */
const VALID_TYPE = ['bundle', 'first_n', 'first_per_user']

/** 依型別組 config 與預設標籤；不合法回 { error } */
function buildTypeConfig(b: Record<string, unknown>) {
  const type = String(b?.type ?? 'bundle')
  if (!VALID_TYPE.includes(type)) return { error: '促銷型別不正確' }
  if (type === 'bundle') {
    const buy = Number(b?.buy), free = Number(b?.free)
    if (!(buy >= 1) || !(free >= 1)) return { error: '買幾抽送幾抽要大於 0' }
    return { type, config: { buy, free }, defaultBadge: `買${buy}送${free}` }
  }
  const offPct = Number(b?.offPct)
  // 上限 90：全免會被小號蹭爆，而且 0 元抽獎在帳上也很難解釋
  if (!(offPct >= 1) || offPct > 90) return { error: '折扣百分比請填 1～90' }
  if (type === 'first_n') {
    const n = Number(b?.n)
    if (!(n >= 1)) return { error: '前幾抽要大於 0' }
    return { type, config: { n, off_pct: offPct }, defaultBadge: `前${n}抽${(100 - offPct) / 10}折` }
  }
  return { type, config: { off_pct: offPct }, defaultBadge: `首抽${(100 - offPct) / 10}折` }
}

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

    if (!name) return NextResponse.json({ error: '請輸入方案名稱' }, { status: 400 })
    if (!VALID_SCOPE.includes(scope)) return NextResponse.json({ error: '適用範圍不正確' }, { status: 400 })
    const typed = buildTypeConfig(b)
    if ('error' in typed) return NextResponse.json({ error: typed.error }, { status: 400 })

    const targets: { product_id?: number; category_id?: string }[] =
      scope === 'product' ? (b?.productIds ?? []).map((id: number) => ({ product_id: Number(id) }))
      : scope === 'category' ? (b?.categoryIds ?? []).map((id: string) => ({ category_id: String(id) }))
      : []
    // 分類範圍允許先不選 —— 「先建方案，商品編輯那邊再把商品勾進來」
    // 是掛鉤定案裡的合法流程（無分類促銷）
    if (scope === 'product' && !targets.length) {
      return NextResponse.json({ error: '請至少選一個適用對象' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: promo, error } = await supabase.from('promotions').insert({
      name,
      type: typed.type,
      config: typed.config,
      badge_text: String(b?.badgeText ?? '').trim() || typed.defaultBadge,
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
      detail: { name, scope, type: typed.type, config: typed.config }, ip: getClientIp(request),
    })
    return NextResponse.json({ id: promo.id })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '建立失敗' }, { status: 500 })
  }
}

/**
 * PATCH：快速調整（啟停/優先權）＋完整編輯（老闆指定要能編輯）。
 *
 * 掛鉤定案（2026-08-09）：方案這邊只管「分類目標」；「商品目標」
 * 由商品編輯頁維護（/api/admin/products/[id]/promotions）——
 * 所以這裡改 categoryIds 時**絕不動 product_id 的 target 列**，
 * 兩個入口寫同一張表、各管一個維度，不會互相蓋掉。
 */
export async function PATCH(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await request.json()
  if (!b?.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const supabase = getSupabaseAdmin()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.isActive !== undefined) patch.is_active = Boolean(b.isActive)
  if (b.priority !== undefined) patch.priority = Number(b.priority) || 0
  if (b.endsAt !== undefined) patch.ends_at = b.endsAt || null
  if (b.startsAt !== undefined) patch.starts_at = b.startsAt || null
  if (b.name !== undefined) {
    const name = String(b.name).trim()
    if (!name) return NextResponse.json({ error: '請輸入方案名稱' }, { status: 400 })
    patch.name = name
  }
  if (b.type !== undefined || b.buy !== undefined || b.free !== undefined || b.n !== undefined || b.offPct !== undefined) {
    const typed = buildTypeConfig(b)
    if ('error' in typed) return NextResponse.json({ error: typed.error }, { status: 400 })
    patch.type = typed.type
    patch.config = typed.config
    if (b.badgeText !== undefined && !String(b.badgeText).trim()) patch.badge_text = typed.defaultBadge
  }
  if (b.badgeText !== undefined && String(b.badgeText).trim()) patch.badge_text = String(b.badgeText).trim()
  if (b.scope !== undefined) {
    // 編輯介面只提供 分類/全站；歷史的 product scope 列不從這裡產生
    if (!['category', 'all'].includes(b.scope)) return NextResponse.json({ error: '適用範圍不正確' }, { status: 400 })
    patch.scope = b.scope
  }

  const { error } = await supabase.from('promotions').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 分類目標同步：先清舊的分類列（product 列不碰），再寫新的。
  // categoryIds 可為空陣列 —— 「先建方案、商品那邊自己勾」是合法用法
  if (Array.isArray(b.categoryIds)) {
    const { error: delErr } = await supabase
      .from('promotion_targets')
      .delete()
      .eq('promotion_id', b.id)
      .not('category_id', 'is', null)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    const wantCategories = b.scope !== 'all' ? (b.categoryIds as string[]) : []
    if (wantCategories.length) {
      const { error: insErr } = await supabase.from('promotion_targets')
        .insert(wantCategories.map((id: string) => ({ promotion_id: b.id, category_id: String(id) })))
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  await logAdminAction({
    adminId: session.adminId, action: '調整促銷方案',
    targetType: 'promotions', targetId: String(b.id),
    detail: { ...patch, categoryIds: Array.isArray(b.categoryIds) ? b.categoryIds : undefined },
    ip: getClientIp(request),
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
