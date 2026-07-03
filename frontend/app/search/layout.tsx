import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/site'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: '搜尋商品',
  description: '搜尋吉吉比轉蛋商品：一番賞、盲盒、轉蛋卡包，輸入關鍵字快速找到你喜愛的商品。',
  alternates: { canonical: `${siteUrl}/search` },
  openGraph: {
    type: 'website',
    url: `${siteUrl}/search`,
    siteName: '吉吉比',
    locale: 'zh_TW',
    title: '搜尋商品 | 吉吉比',
    description: '搜尋吉吉比轉蛋商品：一番賞、盲盒、轉蛋卡包，輸入關鍵字快速找到你喜愛的商品。',
  },
  robots: { index: false, follow: true },
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
