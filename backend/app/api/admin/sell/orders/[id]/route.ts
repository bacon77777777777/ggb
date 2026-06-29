import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: idRaw } = await params
    const id = Number(idRaw)
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data: order, error } = await supabaseAdmin
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
          payment_proof_urls,
          seller_confirmed_at,
          tracking_number,
          shipped_at,
          received_at,
          completed_at,
          cancelled,
          cancel_reason,
          created_at,
          updated_at,
          listing:sell_listings!sell_orders_listing_id_fkey ( id, title, note, images, items ),
          seller:users!sell_orders_seller_id_fkey ( id, name, email ),
          buyer:users!sell_orders_buyer_id_fkey ( id, name, email )
        `
      )
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const listingId = Number((order as any)?.listing_id)
    const { data: messages } = await supabaseAdmin
      .from('sell_messages')
      .select('id, listing_id, sender_id, receiver_id, kind, body, created_at')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })
      .limit(80)

    return NextResponse.json({ order, messages: messages ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: idRaw } = await params
    const id = Number(idRaw)
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const body = (await req.json().catch(() => null)) as any
    const patch: Record<string, any> = { updated_at: new Date().toISOString() }

    if (typeof body?.step === 'number') {
      if (![1, 2, 3, 4, 5, 6].includes(body.step)) return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
      patch.step = body.step
    }
    if (typeof body?.cancelled === 'boolean') patch.cancelled = body.cancelled
    if (typeof body?.cancel_reason === 'string') patch.cancel_reason = body.cancel_reason
    if (typeof body?.tracking_number === 'string') patch.tracking_number = body.tracking_number.trim() || null

    const timeKeys = ['paid_at', 'seller_confirmed_at', 'shipped_at', 'received_at', 'completed_at'] as const
    for (const k of timeKeys) {
      if (!(k in body)) continue
      const v = body?.[k]
      if (v === null || v === '') patch[k] = null
      else if (v === 'now') patch[k] = new Date().toISOString()
      else if (typeof v === 'string') patch[k] = v
    }

    if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'No changes' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('sell_orders').update(patch).eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}
