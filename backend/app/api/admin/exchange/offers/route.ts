import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

const VALID_STATUSES = new Set(['active', 'paused', 'deleted'])

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('exchange_offers')
      .select(
        `
          id,
          owner_id,
          status,
          note,
          created_at,
          updated_at,
          owner:users!exchange_offers_owner_id_fkey (
            id,
            name,
            email
          ),
          cards:exchange_offer_cards (
            id,
            side,
            external_id,
            name,
            series,
            image_url,
            value,
            position
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

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as { id?: string; status?: string } | null
    const id = body?.id || ''
    const status = body?.status || ''

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    if (!VALID_STATUSES.has(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('exchange_offers').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}
