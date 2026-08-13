import type { Metadata } from 'next'

/**
 * 登入頁的分享卡片
 *
 * 這一層存在的唯一理由是 metadata：`app/login/page.tsx` 是 client component，
 * 沒辦法自己 export metadata，得由外面的 server layout 帶。
 *
 * ── 為什麼整個 /login 都套邀請圖 ──
 * 邀請連結的網址就是 `/login?invite=XXXXXX`（`lib/inviteMessage.ts` 組的），
 * 而 layout 拿不到 searchParams，沒辦法只針對帶邀請碼的那一種換圖。
 *
 * 選擇讓整個 /login 都用邀請圖，理由是：會被貼到聊天室的 /login 網址幾乎
 * 都是邀請連結，一般人分享平台會貼首頁。而且這樣做，**老闆已經發出去的那些
 * 邀請連結不用重發就會換成新圖** —— 若改成另開 `/invite/[code]` 專屬路由，
 * 舊連結只能繼續吃預設圖。
 *
 * 文案與 `lib/inviteMessage.ts` 對齊（綁 LINE 送 300 積分是 migration 505
 * 真的有的獎勵）。獎勵改了，那個檔案跟這裡都要一起改。
 */

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ggb.com.tw').replace(/\/$/, '')
const INVITE_OG = `${siteUrl}/images/invite/invite_banner.png`

const TITLE = '邀請好友一起拿好禮｜吉吉比 線上轉蛋'
const DESCRIPTION = '用邀請碼加入吉吉比，綁定 LINE 就送 300 積分，免費抽一次！線上一番賞、轉蛋、盲盒、卡牌，即抽即看、公正透明。'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: '吉吉比 GGB',
    locale: 'zh_TW',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: INVITE_OG, width: 1200, height: 630, alt: '邀請好友一起拿好禮' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [INVITE_OG],
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
