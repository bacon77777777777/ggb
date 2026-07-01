import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import crypto from 'crypto'

const generateSeedHex = () => crypto.randomBytes(32).toString('hex')
const sha256Hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { name, type, price, total_count, remaining, category, distributor, series,
            description, image_url, release_year, release_month, status, is_hot, sales,
            supplier_name } = body

    if (!name || !type || !price) {
      return NextResponse.json({ error: '缺少必填欄位（名稱、類型、價格）' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 查廠商 ID
    let supplierId: number | null = null
    if (supplier_name) {
      const { data: sup } = await supabase
        .from('suppliers')
        .select('id')
        .ilike('name', supplier_name.trim())
        .maybeSingle()
      supplierId = sup?.id ?? null
    }

    const seed = generateSeedHex()
    const txidHash = sha256Hex(seed)
    const productCode = `IMPORT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`

    const { data, error } = await supabase
      .from('products')
      .insert({
        name: name.trim(),
        type,
        price: Number(price),
        total_count: Number(total_count) || 0,
        remaining: remaining !== undefined ? Number(remaining) : Number(total_count) || 0,
        category: category || null,
        distributor: distributor || null,
        series: series || null,
        description: description || null,
        image_url: image_url || '/images/item.png',
        release_year: release_year || null,
        release_month: release_month || null,
        status: status || 'active',
        is_hot: is_hot || false,
        sales: sales || 0,
        supplier_id: supplierId,
        seed,
        txid_hash: txidHash,
        product_code: productCode,
      })
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({ id: data.id })
  } catch (e: any) {
    console.error('Import product error:', e)
    return NextResponse.json({ error: e.message || '匯入失敗' }, { status: 500 })
  }
}
