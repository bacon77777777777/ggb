import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    const { data: botRows } = await supabaseAdmin.from('users').select('id').eq('is_bot', true)
    const botIds = botRows?.map(r => r.id) ?? []

    let query = supabaseAdmin
      .from('draw_records')
      .select(
        `
          *,
          user:users (id, name, email),
          product:products (name, image_url, price, type)
        `
      )
      .order('created_at', { ascending: false })

    if (botIds.length > 0) query = query.not('user_id', 'in', `(${botIds.join(',')})`)

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

