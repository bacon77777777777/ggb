import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

/**
 * 交易所成交紀錄（後台「交易紀錄」頁）。
 *
 * marketplace_transactions 的 RLS 是「只有買賣雙方看得到」，所以一律走 service role。
 * 一筆成交同時牽動三方帳：買家 −price、賣家 +seller_receive、平台收 fee，
 * 三個數字都回給前端，對帳時不用再自己算（也不會兩邊算法不一致）。
 */
export async function GET(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const supabaseAdmin = getSupabaseAdmin()
    let q = supabaseAdmin
      .from('marketplace_transactions')
      .select(`
        id,
        listing_id,
        price,
        fee,
        seller_receive,
        created_at,
        buyer_id,
        seller_id,
        draw_records ( product_prizes ( name, level, image_url ), products ( name, type ) ),
        buyer:users!marketplace_transactions_buyer_id_fkey ( id, name, email, member_no, is_bot ),
        seller:users!marketplace_transactions_seller_id_fkey ( id, name, email, member_no, is_bot )
      `)
      .order('created_at', { ascending: false })
      .limit(2000)

    // 台灣時間的日界線：前端傳 YYYY-MM-DD，這裡補成 +08:00 的當日起訖
    if (from) q = q.gte('created_at', `${from}T00:00:00+08:00`)
    if (to) q = q.lte('created_at', `${to}T23:59:59+08:00`)

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
