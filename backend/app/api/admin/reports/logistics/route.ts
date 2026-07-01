import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')

    const supabase = getSupabaseAdmin()

    let query = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        submitted_at,
        shipped_at,
        status,
        logistics_type,
        logistics_subtype,
        tracking_number,
        total_amount,
        recipient_name,
        recipient_phone,
        address,
        store_name,
        user:users(id, name, email),
        items:draw_records(
          id,
          product_prizes(name, level),
          products(name, supplier_id, suppliers(name))
        )
      `)
      .order('submitted_at', { ascending: false })

    if (start) query = query.gte('submitted_at', start)
    if (end) {
      const endDate = new Date(end)
      endDate.setDate(endDate.getDate() + 1)
      query = query.lt('submitted_at', endDate.toISOString())
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
