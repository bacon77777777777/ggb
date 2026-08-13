import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/*
 * 商城假資料（開發／驗收用）。
 *
 * 這支曾經在 2026-07-22「清除全站垃圾檔案」被當成開發用 route 刪掉，
 * 但後台「建立商城假資料」按鈕留著沒拆 —— 於是按下去必定 404。
 * 這次重寫時把圖片來源換掉：舊版寫死 `/images/other/card/nft_image*.jpg`，
 * 而那批圖在同一個 commit 也被刪了，就算 route 還在，資料建出來也是整排破圖。
 *
 * 改成從站上真實商品／品項取材：圖片一定存在，兩個環境都能跑，
 * 也不必再維護一份會過期的硬編清單。
 *
 * 類別必須落在 platform_settings.sell_category_whitelist 內 ——
 * 白名單外的值玩家端篩選看不到，等於建了一批查不到的資料。
 */

// products.type → 商城類別。白名單沒有「自製賞」，歸到周邊商品。
const TYPE_TO_CATEGORY: Record<string, string> = {
  ichiban: '一番賞',
  blindbox: '盒玩',
  gacha: '轉蛋',
  card: '卡牌',
  custom: '周邊商品',
  slot: '周邊商品',
}

const GRADES = ['全新未拆', '近全新', '良好', '普通']
const NOTES = [
  '已放防潮箱保存。\n下單後 24 小時內出貨。',
  '卡況良好，出貨前會再拍照確認。\n可超商寄送。\n售出不退。',
  '同賣場多件可合併寄送。\n收到請先錄影開箱，有問題 24 小時內提出。',
]

const LISTING_COUNT = 8

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    // ── 賣家：只挑真人，機器人不該出現在商城 ──
    const { data: sellerRows, error: sellersError } = await supabaseAdmin
      .from('users')
      .select('id')
      .or('is_bot.is.null,is_bot.eq.false')
      .order('created_at', { ascending: false })
      .limit(3)
    if (sellersError) throw sellersError

    const sellerIds = (sellerRows || []).map((u: any) => String(u?.id || '')).filter(Boolean)
    if (sellerIds.length === 0) {
      return NextResponse.json({ error: '站上還沒有真實會員，無法建立商城假資料' }, { status: 400 })
    }

    // ── 類別白名單：建出來的資料要能被前台篩到 ──
    const { data: whitelistRow } = await supabaseAdmin
      .from('platform_settings')
      .select('value')
      .eq('key', 'sell_category_whitelist')
      .maybeSingle()

    let whitelist: string[] = []
    try {
      const parsed = JSON.parse(String((whitelistRow as any)?.value || '[]'))
      if (Array.isArray(parsed)) whitelist = parsed.map((x) => String(x || '')).filter(Boolean)
    } catch {
      whitelist = []
    }
    const fallbackCategory = whitelist[0] || null

    // ── 取材：真實商品 + 它的品項圖 ──
    const { data: productRows, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name, type, image_url')
      .not('image_url', 'is', null)
      .neq('image_url', '')
      .limit(60)
    if (productsError) throw productsError

    const products = (productRows || []).filter((p: any) => String(p?.name || '').trim())
    if (products.length === 0) {
      return NextResponse.json({ error: '站上還沒有商品可以當素材，請先建立商品' }, { status: 400 })
    }

    const { data: prizeRows, error: prizesError } = await supabaseAdmin
      .from('product_prizes')
      .select('product_id, name, level, image_url')
      .in('product_id', products.map((p: any) => p.id))
      .not('image_url', 'is', null)
      .neq('image_url', '')
    if (prizesError) throw prizesError

    const prizesByProduct = new Map<string, any[]>()
    for (const row of prizeRows || []) {
      const key = String((row as any)?.product_id || '')
      if (!key) continue
      if (!prizesByProduct.has(key)) prizesByProduct.set(key, [])
      prizesByProduct.get(key)!.push(row)
    }

    // 有品項圖的商品優先 —— 沒有品項就只剩單一規格，畫面看不出多規格的樣子
    const usable = products
      .filter((p: any) => (prizesByProduct.get(String(p.id)) || []).length > 0)
      .slice(0, LISTING_COUNT)
    const pool = usable.length > 0 ? usable : products.slice(0, LISTING_COUNT)

    const inserts = pool.map((product: any, idx: number) => {
      const prizes = (prizesByProduct.get(String(product.id)) || []).slice(0, 3)
      const category = TYPE_TO_CATEGORY[String(product.type || '')] || fallbackCategory
      const safeCategory = category && (whitelist.length === 0 || whitelist.includes(category))
        ? category
        : fallbackCategory

      const items = (prizes.length > 0 ? prizes : [{ name: product.name, level: '', image_url: product.image_url }])
        .map((prize: any, i: number) => ({
          name: String(prize?.name || product.name).slice(0, 60),
          series: String(product.name).slice(0, 40),
          grade: String(prize?.level || GRADES[(idx + i) % GRADES.length]),
          image: String(prize?.image_url || product.image_url || ''),
          quantity: 1 + ((idx + i) % 5),
          price: 120 + ((idx + i) % 6) * 80,
        }))

      const itemImages = items.map((it) => it.image).filter(Boolean)
      const images = Array.from(new Set([String(product.image_url || ''), ...itemImages])).filter(Boolean).slice(0, 5)
      const minPrice = Math.min(...items.map((it) => it.price))

      return {
        seller_id: sellerIds[idx % sellerIds.length],
        // service_role 走 sell_is_privileged()，trigger 會直接放行，可以一次就上架
        status: 'active',
        category: safeCategory,
        title: `${product.name}｜二手轉讓`.slice(0, 80),
        note: NOTES[idx % NOTES.length],
        images,
        items,
        price: minPrice,
      }
    })

    const { data: created, error: insertError } = await supabaseAdmin
      .from('sell_listings')
      .insert(inserts as any)
      .select('id')
    if (insertError) throw insertError

    const count = Array.isArray(created) ? created.length : 0

    await logAdminAction({
      adminId: session.adminId,
      action: `建立商城假資料（${count} 筆）`,
      targetType: 'sell_listings',
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true, created: count })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '建立假資料失敗' }, { status: 500 })
  }
}
