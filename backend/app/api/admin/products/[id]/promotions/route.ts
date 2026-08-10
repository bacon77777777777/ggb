import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 商品 × 促銷方案（掛鉤定案 2026-08-09）
 *
 * 商品編輯頁的「促銷方案」多選。這支只管 promotion_targets 的
 * product_id 列；分類目標由促銷方案頁維護 —— 兩個入口各管一個維度。
 *
 * GET 一次回齊商品編輯頁要的東西：
 * - promos：可選的方案清單（含檔期/啟停，畫面標示用）
 * - selected：這檔商品被直接勾選的方案 id
 * - viaCategories：經由分類間接參與的方案（唯讀顯示，這裡不能取消）
 * - effectiveId：目前實際生效的方案（同商品多方案取優先權最高，
 *   與前台引擎同一顆 get_product_promotion）
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const productId = Number(id)
  const supabase = getSupabaseAdmin()

  const [{ data: promos }, { data: direct }, { data: myCategories }, { data: effective }] = await Promise.all([
    supabase.from('promotions')
      .select('id, name, badge_text, is_active, starts_at, ends_at, priority, scope')
      .order('priority', { ascending: false })
      .order('id', { ascending: false }),
    supabase.from('promotion_targets')
      .select('promotion_id')
      .eq('product_id', productId),
    supabase.from('product_categories')
      .select('category_id, categories(name)')
      .eq('product_id', productId),
    supabase.rpc('get_product_promotion', { p_product_id: productId }),
  ])

  // 經由分類參與的方案：商品所在分類 ∩ 方案的分類目標
  const categoryIds = (myCategories ?? []).map(c => c.category_id)
  const categoryNameById = new Map(
    (myCategories ?? []).map(c => [
      c.category_id,
      (c as unknown as { categories: { name: string } | null }).categories?.name ?? '未命名分類',
    ]),
  )
  let viaCategories: { promotionId: number; categoryName: string }[] = []
  if (categoryIds.length) {
    const { data: catTargets } = await supabase
      .from('promotion_targets')
      .select('promotion_id, category_id')
      .in('category_id', categoryIds)
    viaCategories = (catTargets ?? []).map(t => ({
      promotionId: Number(t.promotion_id),
      categoryName: categoryNameById.get(t.category_id) ?? '未命名分類',
    }))
  }

  const effectiveRow = Array.isArray(effective) ? effective[0] : effective
  return NextResponse.json({
    promos: promos ?? [],
    selected: (direct ?? []).map(t => Number(t.promotion_id)),
    viaCategories,
    effectiveId: effectiveRow ? Number((effectiveRow as { id: number }).id) : null,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const productId = Number(id)
  const { promotionIds } = await req.json() as { promotionIds: number[] }
  const supabase = getSupabaseAdmin()

  const { data: existing } = await supabase
    .from('promotion_targets').select('promotion_id').eq('product_id', productId)
  const currentIds = new Set((existing ?? []).map(r => Number(r.promotion_id)))
  const nextIds = new Set((promotionIds ?? []).map(Number))

  const toRemove = [...currentIds].filter(x => !nextIds.has(x))
  if (toRemove.length) {
    await supabase.from('promotion_targets')
      .delete().eq('product_id', productId).in('promotion_id', toRemove)
  }

  const toAdd = [...nextIds].filter(x => !currentIds.has(x))
  if (toAdd.length) {
    const { error } = await supabase.from('promotion_targets')
      .insert(toAdd.map(promotion_id => ({ promotion_id, product_id: productId })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction({
    adminId: admin.adminId,
    action: '設定商品促銷',
    targetType: 'product',
    targetId: String(id),
    detail: { promotion_ids: [...nextIds] },
    ip: getClientIp(req),
  })
  return NextResponse.json({ ok: true })
}
