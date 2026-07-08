import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
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

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as CreateProductPayload
    const product = body?.product || null
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
      adminId: session.adminId,
      action: '新增商品',
      targetType: 'product',
      targetId: String(newProductId),
      detail: { name: product.name, product_code: newProductCode },
      ip: getClientIp(request),
    })

    // Auto-seed bot draws on first product creation (fire-and-forget)
    import('@/lib/seedBotDraws').then(m => m.seedBotDraws()).catch(() => {})

    return NextResponse.json({ product: finalProduct || { ...created, product_code: newProductCode } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '新增商品失敗' }, { status: 500 })
  }
}
