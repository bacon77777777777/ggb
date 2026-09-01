import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getSiteUrl } from '@/lib/site'
import { asset } from '@/lib/asset'

/*
 * 交易所商品的分享預覽（og:title / og:image）。
 *
 * 分享鈕跟商城商品同一套：手機系統分享面板／桌機複製連結 —— 連結貼到 LINE／FB
 * 要有品項名跟圖才像個商品頁，所以在 server 端補 metadata。
 *
 * 資料走 public_marketplace_listings（489/670）：那個 view 只含**還在架上**的，
 * 賣掉或下架的就給「商品不存在」＋ noindex。用 anon key 就夠 —— view 本來就是公開的。
 */

type Row = {
  id: number
  price: number
  prize_name: string
  prize_level: string | null
  prize_image: string | null
  product_name: string | null
  seller_name: string | null
}

async function fetchListing(id: number): Promise<Row | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  try {
    const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb
      .from('public_marketplace_listings')
      .select('id, price, prize_name, prize_level, prize_image, product_name, seller_name')
      .eq('id', id)
      .maybeSingle()
    if (error) return null
    return (data as Row) || null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const listingId = Number(id)
  const row = Number.isFinite(listingId) && listingId > 0 ? await fetchListing(listingId) : null
  const siteUrl = getSiteUrl()

  if (!row) {
    return {
      title: '這件已經不在架上了｜吉吉比交易所',
      robots: { index: false, follow: false },
      alternates: { canonical: '/market' },
    }
  }

  const canonical = `${siteUrl}/market/${row.id}`
  const level = row.prize_level ? `${row.prize_level} ` : ''
  const title = `${level}${row.prize_name}｜吉吉比交易所`
  const seller = row.seller_name || '玩家'
  const description = `${seller} 在吉吉比交易所掛出「${level}${row.prize_name}」${row.product_name ? `（${row.product_name}）` : ''}，${row.price.toLocaleString()} G 幣。買到直接進你的倉庫。`
  const imagePath = row.prize_image || asset('/images/item_defaulet.webp')
  const imageUrl = imagePath.startsWith('http') ? imagePath : `${siteUrl}${imagePath}`
  const images = [{ url: imageUrl, width: 800, height: 800, alt: row.prize_name }]

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: '吉吉比 GGB',
      locale: 'zh_TW',
      title,
      description,
      images,
    },
    twitter: { card: 'summary_large_image', title, description, images: [imageUrl] },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
