import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope, forceSupplierField, scopeToSupplier, ScopeError } from '@/lib/requireAdmin'
import { detectSeriesFromName } from '@/lib/detectSeries'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import crypto from 'crypto'

type CreateProductPayload = {
  product: Record<string, any>
  prizes?: Array<Record<string, any>>
  tagIds?: string[]
}

const generateSeedHex = () => crypto.randomBytes(32).toString('hex')
const sha256Hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
const generateTempProductCode = () => `TEMP-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`

/**
 * 商品列表
 *
 * 後台原本是從瀏覽器用 anon key 直接查 `select('*', prizes:product_prizes(*))`。
 * migration 471 用欄位級授權把 seed / cost / profit_rate 從 anon 撤掉之後，
 * `*` 會展開到那三欄而整個查詢 42501 —— 商品管理頁就空了。
 *
 * 而後台是真的需要 cost（表格有「成本」欄）與 profit_rate（殺率），
 * 所以只能走 service role。順帶把廠商範圍的過濾搬到伺服器端：
 * 原本在前端加 `.eq('supplier_id', ...)`，那只是介面效果，改一下請求就繞過去了。
 */
export async function GET() {
  try {
    const scope = await requireAdminScope()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let query = getSupabaseAdmin()
      .from('products')
      .select('*, prizes:product_prizes(*)')
      .order('created_at', { ascending: false })
    query = scopeToSupplier(query, scope)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e: unknown) {
    if (e instanceof ScopeError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e instanceof Error ? e.message : '讀取失敗' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const scope = await requireAdminScope()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as CreateProductPayload
    // 廠商送上來的 supplier_id 一律以 session 為準 —— 不能自己指定成別家
    const product = body?.product ? forceSupplierField(body.product, scope) : null
    if (!product?.name) return NextResponse.json({ error: '缺少商品資料' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()

    const seed = product.seed || generateSeedHex()
    const txidHash = product.txid_hash || sha256Hex(seed)
    const rawProductCode = product.product_code ? String(product.product_code).trim() : ''
    const productCode =
      rawProductCode && rawProductCode.toUpperCase() !== 'PENDING'
        ? rawProductCode
        : generateTempProductCode()

    const detectedSeries = !product.series
      ? await detectSeriesFromName(product.name, supabaseAdmin)
      : null

    const now = new Date().toISOString()
    const insertProduct: Record<string, any> = {
      ...product,
      category: product.category && String(product.category).trim() !== '' ? product.category : '未分類',
      product_code: productCode,
      seed,
      txid_hash: txidHash,
      series: product.series || detectedSeries || null,
      started_at: product.status === 'active' && !product.started_at ? now : (product.started_at ?? null),
    }

    const { data: created, error: insertError } = await supabaseAdmin
      .from('products')
      .insert(insertProduct)
      .select('*')
      .single()

    if (insertError || !created) {
      const errorMessage = insertError
        ? [insertError.message, insertError.details, insertError.hint].filter(Boolean).join(' | ')
        : '新增商品失敗'
      return NextResponse.json({ error: errorMessage || '新增商品失敗' }, { status: 500 })
    }

    const newProductId = created.id as number
    const newProductCode = String(10000000 + newProductId)

    await supabaseAdmin.from('products').update({ product_code: newProductCode }).eq('id', newProductId)

    const prizes = Array.isArray(body?.prizes) ? body.prizes : []
    if (prizes.length > 0) {
      const invalidPrize = prizes.find((p: any) => !p.total || p.total < 1)
      if (invalidPrize) {
        return NextResponse.json({ error: `品項「${invalidPrize.name || '未命名'}」總數量必須至少 1` }, { status: 400 })
      }
      const { error: prizesError } = await supabaseAdmin
        .from('product_prizes')
        .insert(prizes.map((p) => ({ ...p, product_id: newProductId })))
      if (prizesError) {
        return NextResponse.json({ error: prizesError.message }, { status: 500 })
      }
    }

    const tagIds = Array.isArray(body?.tagIds) ? body.tagIds : []
    if (tagIds.length > 0) {
      const { error: tagError } = await supabaseAdmin
        .from('product_tag_links')
        .insert(tagIds.map((tagId) => ({ product_id: newProductId, tag_id: tagId })))
      if (tagError) {
        return NextResponse.json({ error: tagError.message }, { status: 500 })
      }
    }

    const { data: finalProduct } = await supabaseAdmin.from('products').select('*').eq('id', newProductId).single()

    await logAdminAction({
      adminId: scope.adminId,
      action: '新增商品',
      targetType: 'product',
      targetId: String(newProductId),
      detail: { name: product.name, product_code: newProductCode },
      ip: getClientIp(request),
    })

    return NextResponse.json({ product: finalProduct || { ...created, product_code: newProductCode } })
  } catch (e: any) {
    if (e instanceof ScopeError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || '新增商品失敗' }, { status: 500 })
  }
}
