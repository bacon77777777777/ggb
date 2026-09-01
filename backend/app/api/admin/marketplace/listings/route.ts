import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

/**
 * 交易所品項清單（後台「交易所品項管理」頁）。
 *
 * marketplace_listings 對 anon 是全開的 SELECT，但賣家資料與獎項來源要 join
 * draw_records／users，那兩張的 RLS 都是「只看得到自己的」—— 後台一律走 service role。
 */
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
          draw_record_id,
          draw_records (
            ticket_number,
            product_prizes ( name, level, image_url ),
            products ( name, type )
          ),
          seller:users!marketplace_listings_seller_id_fkey (
            id,
            name,
            email,
            member_no,
            is_bot
          )
        `
      )
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
