import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/site'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: '最新消息',
  description: '吉吉比最新消息與公告：新商品上架、活動資訊、平台更新一手掌握。',
  alternates: { canonical: `${siteUrl}/news` },
  openGraph: {
    type: 'website',
    url: `${siteUrl}/news`,
    siteName: '吉吉比',
    locale: 'zh_TW',
    title: '最新消息 | 吉吉比',
    description: '吉吉比最新消息與公告：新商品上架、活動資訊、平台更新一手掌握。',
  },
}

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
