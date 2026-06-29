import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('sell_listings')
      .select(
        `
          id,
          price,
          status,
          title,
          note,
          images,
          items,
          view_count,
          created_at,
          updated_at,
          seller_id,
          seller:users!sell_listings_seller_id_fkey (
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

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as null | { id?: number | string; status?: string }
    const idRaw = body?.id
    const status = String(body?.status || '').trim()
    const id = Number(idRaw)

    if (!Number.isFinite(id) || !status) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('sell_listings').update({ status }).eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const idParam = url.searchParams.get('id')
    const id = Number(idParam)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('sell_listings').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '刪除失敗' }, { status: 500 })
  }
}
