import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/*
 * 官方商城（B2C）商品。
 *
 * 商品跟玩家商城共用 sell_listings，靠 is_official 區分 —— 兩者的欄位
 * 幾乎一樣（標題、多圖、多規格、類別、運費），共用可以直接沿用前台既有的
 * 卡片與商品頁，不必維護兩套長得一樣的畫面。
 *
 * 這裡一律用 service_role 寫入，所以 sell_guard_listing() 會直接放行
 * （它開頭就對 privileged 回傳）—— 官方商品不需要審核、實名、上架則數、
 * 售價上限，平台不需要審自己。
 */

const OFFICIAL_SELLER = '00000000-0000-0000-0000-000000000001'

type Item = { name: string; image?: string; price: number; quantity: number }

const cleanItems = (raw: unknown): Item[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x: any) => ({
      name: String(x?.name || '').trim().slice(0, 60),
      image: String(x?.image || '').trim(),
      price: Math.max(0, Math.floor(Number(x?.price) || 0)),
      quantity: Math.max(0, Math.floor(Number(x?.quantity) || 0)),
    }))
    .filter((x) => x.name && x.price > 0)
}

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('sell_listings')
      .select('id, title, note, category, price, shipping_fee, images, items, status, sold_count, created_at, updated_at')
      .eq('is_official', true)
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json(data || [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '讀取失敗' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const title = String(body?.title || '').trim()
    const category = String(body?.category || '').trim()
    const items = cleanItems(body?.items)
    const images = Array.isArray(body?.images)
      ? body.images.map((x: any) => String(x || '').trim()).filter(Boolean)
      : []

    if (!title) return NextResponse.json({ error: '請填寫商品名稱' }, { status: 400 })
    if (!category) return NextResponse.json({ error: '請選擇商品類別' }, { status: 400 })
    if (items.length === 0) return NextResponse.json({ error: '至少要有一個規格（含名稱與售價）' }, { status: 400 })

    // 卡片標價用最低規格價，跟前台顯示邏輯一致
    const price = Math.min(...items.map((i) => i.price))

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('sell_listings')
      .insert({
        seller_id: OFFICIAL_SELLER,
        is_official: true,
        // 官方商品直接上架 —— 沒有人要審，卡在 pending 只會讓人以為壞了
        status: String(body?.status || 'active') === 'active' ? 'active' : 'removed',
        title,
        note: String(body?.note || '').trim() || null,
        category,
        price,
        shipping_fee: Math.max(0, Math.floor(Number(body?.shipping_fee) || 0)),
        images,
        items,
      })
      .select('id')
      .single()
    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: `新增官方商品「${title}」`,
      targetType: 'sell_listings',
      targetId: String(data?.id ?? ''),
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true, id: data?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '新增失敗' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const id = Number(body?.id)
    if (!id) return NextResponse.json({ error: '缺少商品 id' }, { status: 400 })

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.title !== undefined) {
      const t = String(body.title).trim()
      if (!t) return NextResponse.json({ error: '商品名稱不能空白' }, { status: 400 })
      patch.title = t
    }
    if (body.note !== undefined) patch.note = String(body.note).trim() || null
    if (body.category !== undefined) patch.category = String(body.category).trim()
    if (body.shipping_fee !== undefined) patch.shipping_fee = Math.max(0, Math.floor(Number(body.shipping_fee) || 0))
    if (body.images !== undefined) {
      patch.images = Array.isArray(body.images)
        ? body.images.map((x: any) => String(x || '').trim()).filter(Boolean)
        : []
    }
    if (body.items !== undefined) {
      const items = cleanItems(body.items)
      if (items.length === 0) return NextResponse.json({ error: '至少要有一個規格' }, { status: 400 })
      patch.items = items
      patch.price = Math.min(...items.map((i) => i.price))
    }
    if (body.status !== undefined) {
      const s = String(body.status)
      if (!['active', 'removed'].includes(s)) {
        return NextResponse.json({ error: '狀態只能是上架或下架' }, { status: 400 })
      }
      patch.status = s
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('sell_listings')
      .update(patch)
      .eq('id', id)
      .eq('is_official', true)
    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: `更新官方商品 #${id}`,
      targetType: 'sell_listings',
      targetId: String(id),
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = Number(searchParams.get('id'))
    if (!id) return NextResponse.json({ error: '缺少商品 id' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()

    // 有訂單就不給刪 —— shop_orders.listing_id 沒有 ON DELETE CASCADE，
    // 硬刪會讓歷史訂單失去商品資料，對帳與客訴都查不回來
    const { count } = await supabaseAdmin
      .from('shop_orders')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', id)

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `這件商品已經有 ${count} 筆訂單，不能刪除。請改成下架` },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('sell_listings')
      .delete()
      .eq('id', id)
      .eq('is_official', true)
    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: `刪除官方商品 #${id}`,
      targetType: 'sell_listings',
      targetId: String(id),
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '刪除失敗' }, { status: 500 })
  }
}
