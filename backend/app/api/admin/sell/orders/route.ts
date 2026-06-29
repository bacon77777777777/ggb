import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('sell_orders')
      .select(
        `
          id,
          listing_id,
          seller_id,
          buyer_id,
          item_index,
          quantity,
          unit_price,
          payment_method,
          step,
          paid_at,
          seller_confirmed_at,
          tracking_number,
          shipped_at,
          received_at,
          completed_at,
          cancelled,
          cancel_reason,
          created_at,
          updated_at,
          listing:sell_listings!sell_orders_listing_id_fkey ( id, title, items ),
          seller:users!sell_orders_seller_id_fkey ( id, name, email ),
          buyer:users!sell_orders_buyer_id_fkey ( id, name, email )
        `
      )
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

