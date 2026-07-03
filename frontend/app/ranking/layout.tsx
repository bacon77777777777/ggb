import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/site'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: '排行榜',
  description: '查看吉吉比轉蛋平台最新排行榜！最頂尖的轉蛋達人、最大課金排行、每日每週熱門玩家一覽無遺。',
  alternates: { canonical: `${siteUrl}/ranking` },
  openGraph: {
    type: 'website',
    url: `${siteUrl}/ranking`,
    siteName: '吉吉比',
    locale: 'zh_TW',
    title: '排行榜 | 吉吉比',
    description: '查看吉吉比轉蛋平台最新排行榜！最頂尖的轉蛋達人、最大課金排行、每日每週熱門玩家一覽無遺。',
  },
}

export default function RankingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
