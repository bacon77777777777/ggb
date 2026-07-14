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

  // Fetch extra to compensate for bot filtering
  const fetchLimit = limit * 3
  const { data: draws, error } = await adminSupabase
    .from('draw_records')
    .select('id, status, created_at, user_id, order_id')
    .eq('product_prize_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + fetchLimit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allUserIds = [...new Set((draws || []).map((r: any) => r.user_id).filter(Boolean))]
  let validUserIds = new Set<string>()
  let userMap: Map<string, string> = new Map()

  if (allUserIds.length > 0) {
    const { data: users } = await adminSupabase
      .from('users')
      .select('user_id, name')
      .in('user_id', allUserIds)
      .or('is_bot.is.null,is_bot.eq.false')
    for (const u of (users || [])) {
      userMap.set(u.user_id, u.name)
      validUserIds.add(u.user_id)
    }
  }

  // Filter bots and ghost accounts, then slice to requested limit
  const realDraws = (draws || [])
    .filter((r: any) => validUserIds.has(r.user_id))
    .slice(0, limit)

  const orderIds = [...new Set(realDraws.map((r: any) => r.order_id).filter(Boolean))]
  let orderMap: Map<number, string> = new Map()

  if (orderIds.length > 0) {
    const { data: orders } = await adminSupabase
      .from('orders').select('id, order_number').in('id', orderIds)
    orderMap = new Map((orders || []).map((o: any) => [o.id, o.order_number]))
  }

  // Total real draws count (approximate)
  const { count } = await adminSupabase
    .from('draw_records')
    .select('*', { count: 'exact', head: true })
    .eq('product_prize_id', id)

  const rows = realDraws.map((r: any) => ({
    ...r,
    userId:      r.user_id,
    userName:    userMap.get(r.user_id) || '—',
    orderNumber: r.order_id ? (orderMap.get(r.order_id) || `#${r.order_id}`) : null,
  }))

  return NextResponse.json({ rows, total: count ?? 0 })
}
