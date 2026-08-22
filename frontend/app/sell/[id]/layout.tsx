import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getSiteUrl } from '@/lib/site'
import { asset } from '@/lib/asset';

/*
 * 商城商品詳情的分享預覽（og:title / og:image）。
 *
 * 分享鈕跟抽獎商品同一套：手機系統分享面板／桌機複製連結 —— 連結貼到 LINE／FB
 * 要有商品名跟主圖才像個商品頁，所以照 app/item/[id]/layout.tsx 的做法在 server 端補 metadata。
 * 資料走 sell_feed_one（578 版；只回上架中的商品，下架的就給「商品不存在」＋ noindex）。
 */

type Row = {
  id: number
  title: string
  note: string | null
  price: number
  images: string[] | null
  seller_name: string | null
  is_official: boolean | null
}

async function fetchListing(id: number): Promise<Row | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  try {
    const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb.rpc('sell_feed_one', { p_id: id })
    if (error) return null
    const row = Array.isArray(data) ? data[0] : data
    return (row as Row) || null
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
      title: '商品不存在｜吉吉比商城',
      robots: { index: false, follow: false },
      alternates: { canonical: '/sell' },
    }
  }

  const canonical = `${siteUrl}/sell/${row.id}`
  const title = `${row.title}｜吉吉比商城`
  const seller = row.is_official ? '吉吉比官方' : row.seller_name || '玩家'
  const note = (row.note || '').trim()
  const description = note
    ? `${note.slice(0, 100)} — ${seller} 上架 · NT$${row.price}`
    : `${seller} 在吉吉比商城上架「${row.title}」，NT$${row.price}。玩家二手轉讓、官方商品，安心交易。`
  const imagePath = (Array.isArray(row.images) && row.images[0]) || asset('/images/item_defaulet.webp')
  const imageUrl = imagePath.startsWith('http') ? imagePath : `${siteUrl}${imagePath}`
  const images = [{ url: imageUrl, width: 800, height: 800, alt: row.title }]

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
