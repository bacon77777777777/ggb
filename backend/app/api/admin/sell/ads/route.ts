import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/*
 * 商城廣告版位管理。
 *
 * 兩件事：
 *   ① 調整版位型錄（價格、席次、停售）—— 營運參數，不該每次改價都推版
 *   ② 供應商版位「代客開單」—— 這類版位 self_serve=false，
 *      DB 的 sell_ad_purchase() 會直接擋掉前台自助購買，
 *      因為供應商是公司對公司的生意，價格會談，不能讓人自己下單
 */

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    const [{ data: slots, error: e1 }, { data: bookings, error: e2 }] = await Promise.all([
      supabaseAdmin.from('sell_ad_slots').select('*').order('sort_order'),
      supabaseAdmin
        .from('sell_ad_bookings')
        .select('id, slot_id, listing_id, buyer_id, supplier_name, start_date, days, keyword, cost, status, created_by, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    if (e1) throw e1
    if (e2) throw e2

    // 補上商品標題與買家名稱，後台列表要看得懂是誰買了什麼
    const listingIds = Array.from(new Set((bookings || []).map((b: any) => b.listing_id).filter(Boolean)))
    const buyerIds = Array.from(new Set((bookings || []).map((b: any) => b.buyer_id).filter(Boolean)))

    const [{ data: listings }, { data: buyers }] = await Promise.all([
      listingIds.length
        ? supabaseAdmin.from('sell_listings').select('id, title').in('id', listingIds)
        : Promise.resolve({ data: [] as any[] }),
      buyerIds.length
        ? supabaseAdmin.from('users').select('id, name').in('id', buyerIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const titleById = new Map((listings || []).map((l: any) => [l.id, l.title]))
    const nameById = new Map((buyers || []).map((u: any) => [u.id, u.name]))

    return NextResponse.json({
      slots: slots || [],
      bookings: (bookings || []).map((b: any) => ({
        ...b,
        listing_title: b.listing_id ? titleById.get(b.listing_id) || `#${b.listing_id}` : null,
        buyer_name: b.buyer_id ? nameById.get(b.buyer_id) || '—' : null,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '讀取失敗' }, { status: 500 })
  }
}

// 調整版位參數
export async function PATCH(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const id = String(body?.id || '')
    if (!id) return NextResponse.json({ error: '缺少版位 id' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (body.price_per_day !== undefined) {
      const v = Math.floor(Number(body.price_per_day))
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: '價格不正確' }, { status: 400 })
      patch.price_per_day = v
    }
    if (body.seats_per_day !== undefined) {
      const v = Math.floor(Number(body.seats_per_day))
      if (!Number.isFinite(v) || v < 1) return NextResponse.json({ error: '席次至少要 1' }, { status: 400 })
      patch.seats_per_day = v
    }
    if (body.is_active !== undefined) patch.is_active = !!body.is_active

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('sell_ad_slots').update(patch).eq('id', id)
    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: `調整廣告版位 ${id}`,
      targetType: 'sell_ad_slots',
      targetId: id,
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

// 代客開單（供應商版位）
export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const slotId = String(body?.slot_id || '')
    const supplier = String(body?.supplier_name || '').trim()
    const startDate = String(body?.start_date || '')
    const days = Math.floor(Number(body?.days) || 0)

    if (!slotId) return NextResponse.json({ error: '請選擇版位' }, { status: 400 })
    if (!supplier) return NextResponse.json({ error: '請填寫供應商名稱' }, { status: 400 })
    if (!startDate) return NextResponse.json({ error: '請選擇檔期起始日' }, { status: 400 })
    if (days < 1) return NextResponse.json({ error: '天數至少 1 天' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()

    const { data: slot, error: slotErr } = await supabaseAdmin
      .from('sell_ad_slots')
      .select('*')
      .eq('id', slotId)
      .single()
    if (slotErr || !slot) return NextResponse.json({ error: '找不到這個版位' }, { status: 400 })

    // 席次照樣要檢查 —— 代客開單不是特權，超賣一樣會開天窗
    for (let i = 0; i < days; i++) {
      const d = new Date(`${startDate}T00:00:00+08:00`)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      const { data: left, error } = await supabaseAdmin.rpc('sell_ad_seats_left', {
        p_slot_id: slotId,
        p_date: key,
      })
      if (error) throw error
      if ((left ?? 0) <= 0) {
        return NextResponse.json({ error: `${key} 已經額滿，請改選其他檔期` }, { status: 400 })
      }
    }

    const cost = Math.max(0, Math.floor(Number(body?.cost) ?? slot.price_per_day * days))

    const { data, error } = await supabaseAdmin
      .from('sell_ad_bookings')
      .insert({
        slot_id: slotId,
        listing_id: body?.listing_id ? Number(body.listing_id) : null,
        buyer_id: null,
        supplier_name: supplier,
        start_date: startDate,
        days,
        keyword: String(body?.keyword || '').trim() || null,
        cost,
        created_by: `admin:${session.adminId}`,
      })
      .select('id')
      .single()
    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: `代客開單：${slot.name} × ${supplier}（${startDate} 起 ${days} 天）`,
      targetType: 'sell_ad_bookings',
      targetId: String(data?.id ?? ''),
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true, id: data?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '開單失敗' }, { status: 500 })
  }
}

// 取消檔期
export async function DELETE(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = Number(searchParams.get('id'))
    if (!id) return NextResponse.json({ error: '缺少檔期 id' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()

    // 標記 cancelled 而不是刪除：席次計算只看 active，
    // 但這筆錢收過，刪掉就查不到了
    const { error } = await supabaseAdmin
      .from('sell_ad_bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)
    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: `取消廣告檔期 #${id}`,
      targetType: 'sell_ad_bookings',
      targetId: String(id),
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '取消失敗' }, { status: 500 })
  }
}
