import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminScope()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    const { data: botRows } = await supabaseAdmin.from('users').select('id').eq('is_bot', true)
    const botIds = botRows?.map(r => r.id) ?? []

    let query = supabaseAdmin
      .from('orders')
      .select(
        `
          *,
          items:draw_records(
            *,
            product_prizes(name, level, image_url),
            products(name, image_url, type)
          ),
          user:users(email, name)
        `
      )
      .order('submitted_at', { ascending: false })

    if (botIds.length > 0) query = query.not('user_id', 'in', `(${botIds.join(',')})`)

    // 廠商只看自己的訂單（訂單本來就按廠商拆單，supplier_id 必填）
    if (session.supplierScope !== undefined) {
      query = query.eq('supplier_id', session.supplierScope)
    }

    const { data, error } = await query

    if (error) throw error

    // 廠商是外部人，玩家個資要遮：姓名留姓、電話留末三碼、地址整個拿掉
    //（平台出貨，廠商只需要知道「哪張單、出什麼、到哪個狀態」）。
    // 店配門市名不是個資，保留讓廠商知道走什麼通路
    if (session.supplierScope !== undefined) {
      const masked = (data ?? []).map((o: Record<string, unknown>) => ({
        ...o,
        recipient_name: o.recipient_name ? String(o.recipient_name).slice(0, 1) + '○○' : null,
        recipient_phone: o.recipient_phone ? '****' + String(o.recipient_phone).slice(-3) : null,
        address: null,
        user: null,
      }))
      return NextResponse.json(masked)
    }

    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

