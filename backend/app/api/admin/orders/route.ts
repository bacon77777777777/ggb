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
            product_prizes(name, level, image_url, total),
            products(name, image_url, type)
          ),
          user:users(email, name, member_no)
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

    /*
     * 已取消的訂單：品項的關聯在取消時就被解開了（draw_records.order_id 設 NULL，
     * 品項退回倉庫），所以 items 撈不到東西。改讀取消當下拍的快照
     * （orders.cancelled_items，migration 659），讓後台展開看得到當時申請了什麼。
     *
     * 只有 items 真的空的時候才代打 —— 有些取消單的品項可能因為狀態不符沒被解開，
     * 那種情況下真實關聯比快照新。
     */
    for (const o of (data ?? []) as any[]) {
      if (o.status === 'cancelled' && (!o.items || o.items.length === 0) && Array.isArray(o.cancelled_items)) {
        o.items = o.cancelled_items.map((it: any) => ({
          id: it.id,
          prize_name: it.prize_name,
          prize_level: it.prize_level,
          ticket_number: it.ticket_number,
          product_prizes: { name: it.prize_name, level: it.prize_level, image_url: it.image_url },
          products: { name: it.product_name, image_url: it.image_url, type: it.product_type },
          // 標記出來，前端要讓人知道這是快照不是即時關聯
          _from_snapshot: true,
        }))
      }
    }

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

