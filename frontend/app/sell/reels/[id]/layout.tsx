import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/site'
import { findReel } from '@/lib/sell/reelsProto'

/* 分享預覽：og 標題＝文案、圖＝封面（第 0 期讀原型資料；第一期改讀 sell_posts） */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const r = findReel(Number(id))
  const siteUrl = getSiteUrl()
  if (!r) return { title: '影片不存在｜吉吉比商城', robots: { index: false, follow: false } }
  const title = `${r.caption.slice(0, 40)}｜吉吉比商城短影音`
  const description = `${r.seller.name} 分享「${r.listing.title}」NT$${r.listing.price}`
  const url = `${siteUrl}/sell/reels/${r.id}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'video.other', url, siteName: '吉吉比 GGB', locale: 'zh_TW', title, description, images: [{ url: r.poster, width: 540, height: 960 }], videos: [{ url: r.video, width: 720, height: 1280, type: 'video/mp4' }] },
    twitter: { card: 'summary_large_image', title, description, images: [r.poster] },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
