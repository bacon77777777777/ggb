import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/site'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: '轉蛋情報・一番賞新品消息',
  description: '吉吉比最新轉蛋情報：一番賞新品、盲盒盒玩上市、卡牌新彈資訊、寶可夢・鬼滅之刃・航海王・咒術迴戰等熱門 IP 最新消息，第一手掌握。',
  keywords: '轉蛋情報, 一番賞新品, 盲盒新品, 盒玩, 寶可夢卡牌, 吉吉比消息, 線上轉蛋新聞, 日本一番賞情報',
  alternates: { canonical: `${siteUrl}/news` },
  openGraph: {
    type: 'website',
    url: `${siteUrl}/news`,
    siteName: '吉吉比 GGB',
    locale: 'zh_TW',
    title: '轉蛋情報・一番賞新品消息｜吉吉比 線上轉蛋',
    description: '吉吉比最新轉蛋情報：一番賞新品、盲盒盒玩上市、卡牌新彈資訊，第一手掌握。',
  },
}

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
