import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

const CARD_IMAGES = [
  '/images/other/card/nft_image.jpg',
  '/images/other/card/nft_image%20(1).jpg',
  '/images/other/card/nft_image%20(2).jpg',
  '/images/other/card/nft_image%20(3).jpg',
  '/images/other/card/nft_image%20(4).jpg',
  '/images/other/card/nft_image%20(5).jpg',
  '/images/other/card/nft_image%20(6).jpg',
  '/images/other/card/nft_image%20(7).jpg',
  '/images/other/card/nft_image%20(8).jpg',
  '/images/other/card/nft_image%20(9).jpg',
  '/images/other/card/nft_image%20(10).jpg',
]

export async function POST() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    const { data: sellerRows, error: sellersError } = await supabaseAdmin
      .from('users')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(5)

    if (sellersError) throw sellersError
    const sellerIds = (Array.isArray(sellerRows) ? sellerRows : []).map((u: any) => String(u?.id || '')).filter(Boolean).slice(0, 3)
    if (sellerIds.length === 0) {
      return NextResponse.json({ success: false, message: '找不到可用的使用者（users）來建立販售假資料' }, { status: 200 })
    }

    const notes = [
      '實體寶可夢卡。\n已放防潮箱保存。\n下單後 24 小時內出貨。',
      '卡況良好，出貨前會再拍照確認。\n可超商寄送/面交（雙北）。\n售出不退。',
      '同賣場多張可合併寄送。\n收到請先錄影開箱，有問題 24 小時內提出。',
    ]

    const listings = [
      {
        title: '寶可夢卡牌｜SV2a 151｜噴火龍ex / 妙蛙花ex / 水箭龜ex',
        price: 320,
        note: notes[0],
        images: [CARD_IMAGES[1], CARD_IMAGES[2], CARD_IMAGES[3]],
        items: [
          { name: '噴火龍ex（SAR）', series: 'SV2a 151', grade: 'SAR', image: CARD_IMAGES[1], quantity: 1, price: 1680 },
          { name: '妙蛙花ex（SR）', series: 'SV2a 151', grade: 'SR', image: CARD_IMAGES[2], quantity: 2, price: 780 },
          { name: '水箭龜ex（RR）', series: 'SV2a 151', grade: 'RR', image: CARD_IMAGES[3], quantity: 3, price: 320 },
        ],
      },
      {
        title: '寶可夢卡牌｜伊布家族套組｜可選單張',
        price: 220,
        note: notes[1],
        images: [CARD_IMAGES[4], CARD_IMAGES[5], CARD_IMAGES[6]],
        items: [
          { name: '伊布', series: 'SV 系列', grade: '近全新', image: CARD_IMAGES[4], quantity: 5, price: 220 },
          { name: '水伊布', series: 'SV 系列', grade: '近全新', image: CARD_IMAGES[5], quantity: 3, price: 320 },
          { name: '雷伊布', series: 'SV 系列', grade: '近全新', image: CARD_IMAGES[6], quantity: 3, price: 320 },
        ],
      },
      {
        title: '寶可夢卡牌｜皮卡丘 / 雷丘｜卡況可選',
        price: 120,
        note: notes[2],
        images: [CARD_IMAGES[7], CARD_IMAGES[8], CARD_IMAGES[9]],
        items: [
          { name: '皮卡丘', series: '經典', grade: '近全新', image: CARD_IMAGES[7], quantity: 6, price: 180 },
          { name: '皮卡丘', series: '經典', grade: '良好', image: CARD_IMAGES[8], quantity: 4, price: 150 },
          { name: '雷丘', series: '經典', grade: '良好', image: CARD_IMAGES[9], quantity: 2, price: 120 },
        ],
      },
      {
        title: '寶可夢卡牌｜人氣 AR 組合｜可選單張',
        price: 260,
        note: notes[0],
        images: [CARD_IMAGES[10], CARD_IMAGES[0], CARD_IMAGES[2]],
        items: [
          { name: '耿鬼（AR）', series: 'SV 系列', grade: 'AR', image: CARD_IMAGES[10], quantity: 2, price: 320 },
          { name: '路卡利歐（AR）', series: 'SV 系列', grade: 'AR', image: CARD_IMAGES[0], quantity: 2, price: 260 },
          { name: '沙奈朵（AR）', series: 'SV 系列', grade: 'AR', image: CARD_IMAGES[2], quantity: 2, price: 260 },
        ],
      },
      {
        title: '寶可夢卡牌｜訓練家卡｜支援者 / 物品',
        price: 90,
        note: notes[1],
        images: [CARD_IMAGES[3], CARD_IMAGES[4], CARD_IMAGES[5]],
        items: [
          { name: '博士的研究', series: '標準', grade: '近全新', image: CARD_IMAGES[3], quantity: 10, price: 90 },
          { name: '高級球', series: '標準', grade: '近全新', image: CARD_IMAGES[4], quantity: 10, price: 90 },
          { name: '老大的指令', series: '標準', grade: '近全新', image: CARD_IMAGES[5], quantity: 8, price: 120 },
        ],
      },
      {
        title: '寶可夢卡牌｜VSTAR / ex｜可選單張',
        price: 220,
        note: notes[2],
        images: [CARD_IMAGES[6], CARD_IMAGES[7], CARD_IMAGES[8]],
        items: [
          { name: '噴火龍ex', series: 'SV 系列', grade: 'RR', image: CARD_IMAGES[6], quantity: 3, price: 220 },
          { name: '蒼響VSTAR', series: 'SWSH', grade: 'RRR', image: CARD_IMAGES[7], quantity: 2, price: 320 },
          { name: '洛奇亞VSTAR', series: 'SWSH', grade: 'RRR', image: CARD_IMAGES[8], quantity: 2, price: 360 },
        ],
      },
      {
        title: '寶可夢卡牌｜基礎能量｜大量出清',
        price: 25,
        note: notes[0],
        images: [CARD_IMAGES[9], CARD_IMAGES[10], CARD_IMAGES[0]],
        items: [
          { name: '火能量', series: '能量', grade: '近全新', image: CARD_IMAGES[9], quantity: 50, price: 25 },
          { name: '水能量', series: '能量', grade: '近全新', image: CARD_IMAGES[10], quantity: 50, price: 25 },
          { name: '雷能量', series: '能量', grade: '近全新', image: CARD_IMAGES[0], quantity: 50, price: 25 },
        ],
      },
      {
        title: '寶可夢卡牌｜收藏向｜閃卡 / 異圖（隨機小套組）',
        price: 540,
        note: notes[1],
        images: [CARD_IMAGES[2], CARD_IMAGES[1], CARD_IMAGES[4]],
        items: [
          { name: '閃卡小套組（5 張）', series: '混合', grade: '良好', image: CARD_IMAGES[2], quantity: 6, price: 540 },
          { name: '異圖小套組（3 張）', series: '混合', grade: '良好', image: CARD_IMAGES[1], quantity: 4, price: 420 },
          { name: '隨機小套組（10 張）', series: '混合', grade: '良好', image: CARD_IMAGES[4], quantity: 3, price: 880 },
        ],
      },
    ]

    const inserts = listings.map((l, idx) => ({
      seller_id: sellerIds[idx % sellerIds.length],
      price: l.price,
      status: 'active',
      title: l.title,
      note: l.note,
      images: l.images.filter(Boolean),
      items: l.items,
    }))

    const { data: created, error: insertError } = await supabaseAdmin.from('sell_listings').insert(inserts as any).select('id')
    if (insertError) throw insertError

    return NextResponse.json({ success: true, created: Array.isArray(created) ? created.length : 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '建立假資料失敗' }, { status: 500 })
  }
}
