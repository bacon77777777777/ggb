import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Invalid menu id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const productIdsRaw = Array.isArray(body?.productIds) ? body.productIds : []
    const productIds = productIdsRaw.map((v: any) => Number(v)).filter((n: number) => Number.isFinite(n))

    const supabaseAdmin = getSupabaseAdmin()

    const { error: deleteError } = await supabaseAdmin.from('product_categories').delete().eq('category_id', id)
    if (deleteError) throw deleteError

    if (productIds.length > 0) {
      const rows = productIds.map((productId: number, idx: number) => ({
        category_id: id,
        product_id: productId,
        sort_order: productIds.length - idx,
      }))
      const { error: insertError } = await supabaseAdmin.from('product_categories').insert(rows)
      if (insertError) throw insertError
    }

    await logAdminAction({
      adminId: session.adminId,
      action: '設定分類商品',
      targetType: 'category',
      targetId: String(id),
      detail: { count: productIds?.length ?? 0 },
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}
