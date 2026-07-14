import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAGE_LIMIT = 10

export async function GET(req: NextRequest, { params }: { params: Promise<{ prizeId: string }> }) {
  const { prizeId } = await params
  const id = parseInt(prizeId)
  if (isNaN(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const url = new URL(req.url)
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0'))
  const limit  = Math.min(100, parseInt(url.searchParams.get('limit')  || String(PAGE_LIMIT)))

  // Total count
  const { count } = await adminSupabase
    .from('draw_records')
    .select('*', { count: 'exact', head: true })
    .eq('product_prize_id', id)

  const { data: draws, error } = await adminSupabase
    .from('draw_records')
    .select('id, status, created_at, user_id, order_id')
    .eq('product_prize_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds  = [...new Set((draws || []).map((r: any) => r.user_id).filter(Boolean))]
  const orderIds = [...new Set((draws || []).map((r: any) => r.order_id).filter(Boolean))]
  let userMap:  Map<string, string> = new Map()
  let orderMap: Map<number, string> = new Map()

  if (userIds.length > 0) {
    const { data: users } = await adminSupabase
      .from('users').select('user_id, name').in('user_id', userIds)
    userMap = new Map((users || []).map((u: any) => [u.user_id, u.name]))
  }

  if (orderIds.length > 0) {
    const { data: orders } = await adminSupabase
      .from('orders').select('id, order_number').in('id', orderIds)
    orderMap = new Map((orders || []).map((o: any) => [o.id, o.order_number]))
  }

  const rows = (draws || []).map((r: any) => ({
    ...r,
    userName:    userMap.get(r.user_id) || r.user_id?.slice(0, 8) || '—',
    orderNumber: r.order_id ? (orderMap.get(r.order_id) || `#${r.order_id}`) : null,
  }))

  return NextResponse.json({ rows, total: count ?? 0 })
}
