import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope, assertOwnedBySupplier, stripSecretsForSupplier, ScopeError } from '@/lib/requireAdmin'
import { detectSeriesFromName } from '@/lib/detectSeries'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

async function pushLineAlert(text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const id    = process.env.NOTIFY_TARGET_ID
  if (!token || !id) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: id, messages: [{ type: 'text', text }] }),
  }).catch(() => {})
}

/**
 * 單筆商品
 *
 * 編輯頁原本從瀏覽器用 anon key 查 `select('*', product_prizes(*))`。
 * migration 471 把 seed / cost / profit_rate 從 anon 撤掉之後，`*` 展開會 42501，
 * 編輯頁整頁載不出來。改走 service role，並依身份濾掉廠商不該看的欄位。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await requireAdminScope()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const productId = Number(id)
    if (!Number.isFinite(productId)) return NextResponse.json({ error: 'Invalid product id' }, { status: 400 })

    const { data, error } = await getSupabaseAdmin()
      .from('products')
      .select('*, product_prizes(*)')
      .eq('id', productId)
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message || '找不到商品' }, { status: 404 })

    assertOwnedBySupplier(scope, data.supplier_id)
    return NextResponse.json(stripSecretsForSupplier(data, scope))
  } catch (e: unknown) {
    if (e instanceof ScopeError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e instanceof Error ? e.message : '讀取失敗' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await requireAdminScope()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const productId = Number(id)
    if (!Number.isFinite(productId)) return NextResponse.json({ error: 'Invalid product id' }, { status: 400 })

    // 廠商只能改自己的商品。介面已經只列出自己的，但擋不住直接打 API 帶別人的 id
    if (scope.isSupplier) {
      const { data: owner } = await getSupabaseAdmin()
        .from('products').select('supplier_id').eq('id', productId).single()
      assertOwnedBySupplier(scope, owner?.supplier_id)
    }

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
      adminId: scope.adminId,
      action: '修改商品',
      targetType: 'product',
      targetId: String(productId),
      detail: { name: product?.name },
      ip: getClientIp(request),
    })

    return NextResponse.json({ product: updated })
  } catch (e: any) {
    if (e instanceof ScopeError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await requireAdminScope()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const productId = Number(id)
    if (!Number.isFinite(productId)) return NextResponse.json({ error: 'Invalid product id' }, { status: 400 })

    // 廠商不得刪除商品。老闆定的：廠商只有編輯，沒有刪除，也沒有公平性驗證。
    // 介面上的刪除鈕已經藏起來，但藏起來的按鈕擋不住直接打 API
    if (scope.isSupplier) {
      return NextResponse.json({ error: '廠商帳號不能刪除商品' }, { status: 403 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data: product } = await supabaseAdmin.from('products').select('name').eq('id', productId).single()
    const { error } = await supabaseAdmin.from('products').delete().eq('id', productId)
    if (error) throw error

    await logAdminAction({
      adminId: scope.adminId,
      action: '刪除商品',
      targetType: 'product',
      targetId: String(productId),
      detail: { name: product?.name },
      ip: getClientIp(request),
    })

    pushLineAlert(
      `🗑️ 管理員敏感操作\n操作：刪除商品\n管理員ID：${scope.adminId}\n商品：${product?.name ?? productId}`
    )

    return NextResponse.json({ success: true })
  } catch (e: any) {
    if (e instanceof ScopeError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || '刪除失敗' }, { status: 500 })
  }
}
