import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// 機台品項改由商品管理維護（type='slot' 的品項庫商品）。
// 此 API 供主題獎池挑品使用：回傳所有機台類別商品的 product_prizes。
export async function GET() {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const [{ data, error }, { data: suppliersData }] = await Promise.all([
    supabase
      .from('product_prizes')
      .select('id, name, level, image_url, recycle_value, remaining, total, products!inner(id, name, type, supplier_id, suppliers(id, name))')
      .eq('products.type', 'slot')
      .order('id', { ascending: false }),
    supabase.from('suppliers').select('id, name').order('name'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const prizes = (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    level: p.level,
    image_url: p.image_url,
    recycle_value: p.recycle_value ?? 0,
    remaining: p.remaining,
    prize_type: 'rush',
    supplier_id: p.products?.supplier_id ?? null,
    suppliers: p.products?.suppliers ?? null,
    product_name: p.products?.name ?? null,
  }))

  return NextResponse.json({ prizes, suppliers: suppliersData ?? [] })
}
