import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { detectSeriesFromName } from '@/lib/detectSeries'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const productId = Number(id)
    if (!Number.isFinite(productId)) return NextResponse.json({ error: 'Invalid product id' }, { status: 400 })

    const body = await request.json()
    const product = body?.product || null
    const prizes = Array.isArray(body?.prizes) ? body.prizes : []
    const deletedPrizeIds = Array.isArray(body?.deletedPrizeIds) ? body.deletedPrizeIds : []
    const tagIds = Array.isArray(body?.tagIds) ? body.tagIds : null

    const supabaseAdmin = getSupabaseAdmin()

    if (product) {
      if (!product.series && product.name) {
        product.series = await detectSeriesFromName(product.name, supabaseAdmin) || null
      }
      if (product.status === 'active' && !product.started_at) {
        product.started_at = new Date().toISOString()
      }
      const { error: updateError } = await supabaseAdmin.from('products').update(product).eq('id', productId)
      if (updateError) throw updateError
    }

    if (tagIds) {
      await supabaseAdmin.from('product_tag_links').delete().eq('product_id', productId)
      if (tagIds.length > 0) {
        const { error: tagError } = await supabaseAdmin
          .from('product_tag_links')
          .insert(tagIds.map((tagId: string) => ({ product_id: productId, tag_id: tagId })))
        if (tagError) throw tagError
      }
    }

    if (deletedPrizeIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin.from('product_prizes').delete().in('id', deletedPrizeIds)
      if (deleteError) throw deleteError
    }

    if (prizes.length > 0) {
      const normalized = prizes.map((p: any) => ({ ...p, product_id: productId }))
      const existing = normalized.filter((p: any) => p.id != null)
      const fresh = normalized.filter((p: any) => p.id == null)

      if (existing.length > 0) {
        const { error: upsertError } = await supabaseAdmin.from('product_prizes').upsert(existing)
        if (upsertError) throw upsertError
      }
      if (fresh.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('product_prizes').insert(fresh)
        if (insertError) throw insertError
      }
    }

    const { data: updated } = await supabaseAdmin
      .from('products')
      .select('*, product_prizes(*)')
      .eq('id', productId)
      .single()

    await logAdminAction({
      adminId: session.adminId,
      action: '修改商品',
      targetType: 'product',
      targetId: String(productId),
      detail: { name: product?.name },
      ip: getClientIp(request),
    })

    return NextResponse.json({ product: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const productId = Number(id)
    if (!Number.isFinite(productId)) return NextResponse.json({ error: 'Invalid product id' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()

    const { data: product } = await supabaseAdmin.from('products').select('name').eq('id', productId).single()
    const { error } = await supabaseAdmin.from('products').delete().eq('id', productId)
    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: '刪除商品',
      targetType: 'product',
      targetId: String(productId),
      detail: { name: product?.name },
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '刪除失敗' }, { status: 500 })
  }
}
