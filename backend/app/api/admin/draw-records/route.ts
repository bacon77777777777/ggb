import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'

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
          user:users (id, member_no, name, email),
          product:products (name, image_url, price, type, cards_per_pack),
          prize:product_prizes (name, level),
          slot_log:slot_spin_logs (bet, kind, machine:slot_machines (machine_number, theme:slot_themes (name)))
        `
      )
      .order('created_at', { ascending: false })

    if (botIds.length > 0) query = query.not('user_id', 'in', `(${botIds.join(',')})`)

    // 前端是一次撈完自己篩，沒有分頁 —— 不撈完就是「列表少一截」而且不會報錯
    const data = await fetchAllRows<any>(() => query)
    const error = null as any

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

