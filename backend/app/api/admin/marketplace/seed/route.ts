import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    const { data: records, error } = await supabaseAdmin
      .from('draw_records')
      .select('id, user_id, status, is_tradable, image_url')
      .eq('status', 'in_warehouse')
      .or('is_tradable.is.null,is_tradable.eq.true')
      .not('user_id', 'is', null)
      .order('id', { ascending: false })
      .limit(24)

    if (error) throw error

    const usable = (Array.isArray(records) ? records : []).filter((r: any) => String(r?.image_url || '').trim())
    if (usable.length === 0) {
      return NextResponse.json({ success: false, message: '找不到可用倉庫賞項（需 status=in_warehouse 且有圖片）' }, { status: 200 })
    }

    const pick = usable.slice(0, 12)
    const inserts = pick.map((r: any, idx: number) => {
      const recordId = Number(r?.id || 0)
      const price = 200 + ((recordId * 97 + idx * 13) % 2000)
      return { seller_id: r.user_id, draw_record_id: recordId, price, status: 'active' }
    })

    const { data: created, error: insertError } = await supabaseAdmin.from('marketplace_listings').insert(inserts as any).select('id')
    if (insertError) throw insertError

    const recordIds = pick.map((r: any) => Number(r?.id || 0)).filter((n: number) => Number.isFinite(n) && n > 0)
    if (recordIds.length > 0) {
      await supabaseAdmin.from('draw_records').update({ status: 'listing' }).in('id', recordIds as any)
    }

    const createdCount = Array.isArray(created) ? created.length : 0
    await logAdminAction({ adminId: session.adminId, action: '建立市集假資料', targetType: 'marketplace_listings', detail: { created: createdCount }, ip: getClientIp(request) })
    return NextResponse.json({ success: true, created: createdCount })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '建立假資料失敗' }, { status: 500 })
  }
}
