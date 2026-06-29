import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('marketplace_listings')
      .select(
        `
          id,
          price,
          status,
          created_at,
          updated_at,
          seller_id,
          draw_records (
            product_prizes ( name, level ),
            products ( name )
          ),
          seller:users!marketplace_listings_seller_id_fkey (
            id,
            name,
            email
          )
        `
      )
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

