import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('exchange_orders')
      .select(
        `
          id,
          offer_id,
          owner_id,
          initiator_id,
          step,
          done,
          created_at,
          updated_at,
          offer:exchange_offers ( id, status ),
          owner:users!exchange_orders_owner_id_fkey ( id, name, email ),
          initiator:users!exchange_orders_initiator_id_fkey ( id, name, email )
        `
      )
      .order('updated_at', { ascending: false })

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

    const body = (await req.json().catch(() => null)) as { id?: string; step?: number; done?: boolean } | null
    const id = body?.id || ''
    const step = body?.step
    const done = body?.done

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const patch: Record<string, any> = { updated_at: new Date().toISOString() }
    if (typeof step === 'number') {
      if (![1, 2, 3, 4, 5].includes(step)) return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
      patch.step = step
    }
    if (typeof done === 'boolean') patch.done = done

    if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'No changes' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('exchange_orders').update(patch).eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}
