import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as { listingId?: number; sellerId?: string }
    const listingId = Number(body?.listingId)
    const sellerId = String(body?.sellerId || '')
    if (!listingId || !sellerId) return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin.rpc('cancel_listing', {
      p_listing_id: listingId,
      p_user_id: sellerId,
    })
    if (error) throw error

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '下架失敗' }, { status: 500 })
  }
}

