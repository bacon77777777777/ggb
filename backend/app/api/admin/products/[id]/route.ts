import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope, assertOwnedBySupplier, stripSecretsForSupplier, ScopeError } from '@/lib/requireAdmin'
import { detectSeriesFromName } from '@/lib/detectSeries'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import { pushSensitiveAlert } from '@/lib/sensitiveAlert'

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

    // 封存排籤的商品（一番賞公平性承諾）賞項結構不可再動，但商品本身的
    // 資料（名稱、分類、上下架…）要照常可存。編輯頁存檔是把沒動過的品項
    // 也整包 upsert，upsert 的 INSERT 階段會撞上 DB 的 guard_sealed_product
    // trigger —— 改分類清單都存不了。封存商品改走「逐筆只更新安全欄位」，
    // 真的動到賞項結構（增刪、改總數/等級）才明確擋下。
    const { data: seal } = await supabaseAdmin
      .from('product_ticket_seals').select('product_id').eq('product_id', productId).maybeSingle()
    const isSealed = !!seal

    if (deletedPrizeIds.length > 0) {
      if (isSealed) {
        return NextResponse.json({ error: '此商品已封存排籤，不可刪除賞項（要重排請先刪除整個商品）' }, { status: 400 })
      }
      const { error: deleteError } = await supabaseAdmin.from('product_prizes').delete().in('id', deletedPrizeIds)
      if (deleteError) throw deleteError
    }

    if (prizes.length > 0) {
      const normalized = prizes.map((p: any) => ({ ...p, product_id: productId }))
      const existing = normalized.filter((p: any) => p.id != null)
      const fresh = normalized.filter((p: any) => p.id == null)

      if (isSealed) {
        if (fresh.length > 0) {
          return NextResponse.json({ error: '此商品已封存排籤，不可新增賞項（要重排請先刪除整個商品）' }, { status: 400 })
        }
        /*
         * 封存後只能改「不影響排籤承諾」的欄位；total/level/remaining/probability 一律不碰
         * （remaining 由抽獎扣、probability 封存後不參與出獎）。
         *
         * 這裡原本是 `for … await` 逐筆 UPDATE —— 一個 69 品項的商品就是 69 次來回，
         * 光儲存要十幾秒（老闆回報「儲存都跑好久」）。改成兩件事：
         *   1. 先比對，**沒變的那幾筆完全不送** —— 實務上一次只會改一兩筆
         *   2. 真的要改的並行送出，不再一筆等一筆
         * 不改成 upsert 是因為 upsert 的 INSERT 階段會撞上 guard_sealed_product。
         */
        const SAFE_FIELDS = [
          'name', 'image_url', 'recycle_value', 'decompose_type',
          'sale_price', 'decompose_value', 'display_mode',
        ] as const

        const { data: currentRows } = await supabaseAdmin
          .from('product_prizes')
          // select 用字面值：組字串的話 supabase-js 的型別推導解析不出來
          .select('id, total, level, name, image_url, recycle_value, decompose_type, sale_price, decompose_value, display_mode')
          .eq('product_id', productId)
        const currentById = new Map(
          (currentRows ?? []).map(r => {
            const row = r as unknown as Record<string, unknown>
            return [Number(row.id), row] as const
          }),
        )

        const changed: { id: number; patch: Record<string, unknown> }[] = []
        for (const p of existing) {
          const cur = currentById.get(Number(p.id))
          if (!cur) continue
          if (Number(p.total) !== Number(cur.total) || String(p.level ?? '') !== String(cur.level ?? '')) {
            return NextResponse.json({ error: '此商品已封存排籤，賞項的總數量與等級不可再異動' }, { status: 400 })
          }
          const patch: Record<string, unknown> = {}
          for (const f of SAFE_FIELDS) {
            const next = (p as Record<string, unknown>)[f] ?? null
            if (String(next ?? '') !== String(cur[f] ?? '')) patch[f] = next
          }
          if (Object.keys(patch).length > 0) changed.push({ id: Number(p.id), patch })
        }

        // 併發上限 8：再高對 Supabase 的連線池沒有好處，反而容易被排隊
        for (let i = 0; i < changed.length; i += 8) {
          const results = await Promise.all(
            changed.slice(i, i + 8).map(c =>
              supabaseAdmin.from('product_prizes').update(c.patch).eq('id', c.id)),
          )
          const failed = results.find(r => r.error)
          if (failed?.error) throw failed.error
        }
      } else {
        if (existing.length > 0) {
          const { error: upsertError } = await supabaseAdmin.from('product_prizes').upsert(existing)
          if (upsertError) throw upsertError
        }
        if (fresh.length > 0) {
          const { error: insertError } = await supabaseAdmin.from('product_prizes').insert(fresh)
          if (insertError) throw insertError
        }
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

    pushSensitiveAlert(
      `🗑️ 管理員敏感操作\n操作：刪除商品\n管理員ID：${scope.adminId}\n商品：${product?.name ?? productId}`
    )

    return NextResponse.json({ success: true })
  } catch (e: any) {
    if (e instanceof ScopeError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || '刪除失敗' }, { status: 500 })
  }
}
