
import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import FooterWrapper from '@/components/FooterWrapper';
import MobileTabbar from '@/components/MobileTabbar';
import { RouteTransitionProvider } from '@/components/ui/RouteTransition';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { AlertProvider } from '@/components/ui/AlertDialog';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { FeatureFlagsProvider } from '@/contexts/FeatureFlagsContext';
import { PromotionsProvider } from '@/contexts/PromotionsContext';
import PathnameKeyed from '@/components/PathnameKeyed';
import PwaInputFocusFix from '@/components/PwaInputFocusFix';
import PwaPullToRefresh from '@/components/PwaPullToRefresh';
import AnalyticsTracker from '@/components/AnalyticsTracker';
import { getSiteUrl } from '@/lib/site';
import MaintenanceWatcher from '@/components/MaintenanceWatcher';
import { getThemeCss } from '@/lib/serverTheme';

const siteUrl = getSiteUrl();

const SITE_DESCRIPTION = '吉吉比｜台灣最大線上轉蛋平台，提供線上一番賞、轉蛋、盲盒、盒玩、集換式卡牌等多種商品。寶可夢、鬼滅之刃、進擊的巨人、航海王等熱門 IP，即抽即看、公正透明、安全出貨。'

const SITE_KEYWORDS = [
  '線上轉蛋', '線上一番賞', '線上抽獎', '轉蛋', '一番賞',
  '線上盲盒', '盲盒', '盒玩', '抽卡', '卡包', '集換式卡牌',
  '轉蛋台灣', '一番賞台灣', '台灣轉蛋', '台灣一番賞',
  '線上轉蛋台灣', '日本一番賞', '日本扭蛋',
  '寶可夢卡牌', '寶可夢轉蛋', '鬼滅之刃一番賞', '航海王一番賞',
  '進擊的巨人一番賞', '咒術迴戰一番賞', '龍珠一番賞',
  'GGB', '吉吉比',
  '線上扭蛋', '扭蛋台灣', '免出門轉蛋', '宅配轉蛋',
].join(', ')

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '吉吉比 GGB',
  alternateName: ['GGB', '吉吉比轉蛋'],
  url: siteUrl,
  description: SITE_DESCRIPTION,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/search?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
}

// 分享到 LINE／FB 時的預覽圖。原本指 banner.png，但 repo 裡從來沒有這個檔案，
// 等於全站分享都沒有預覽圖。改用實際存在的 banner_defaulet.png（檔名 typo 是原本就有的）。
// 這張刻意保持 PNG 不轉 WebP —— 各家爬蟲對 OG 圖的 WebP 支援不一致。
/*
 * 分享卡片的預設圖（LINE / FB / Threads 讀 og:image）。
 *
 * 原本指到 `banner_defaulet.png` —— 那是一張 1200×400 的灰階佔位圖，
 * 而且 metadata 宣告 630、實際檔案 400，LINE 自己補白，卡片就變成一塊灰。
 * 那個檔案還是 news-agent 抓不到圖時的 fallback（見 CLAUDE.md），所以留著，
 * 只是不再拿它當分享圖。
 *
 * 換成 1200×630（1.91:1，各家通吃）的正式主視覺。
 */
const OG_IMAGE = `${siteUrl}/images/line_default.png`

export const metadata: Metadata = {
  title: {
    template: '%s｜吉吉比 線上轉蛋',
    default: '吉吉比｜線上轉蛋・線上一番賞・盲盒・卡牌 台灣最大平台',
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: '吉吉比 GGB',
    locale: 'zh_TW',
    title: '吉吉比｜線上轉蛋・線上一番賞・盲盒・卡牌 台灣最大平台',
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: '吉吉比 GGB 線上轉蛋平台' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '吉吉比｜線上轉蛋・線上一番賞・盲盒・卡牌',
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
  icons: {
    icon: '/images/20260629/favicon.png',
    apple: '/images/20260629/favicon.png',
  },
  appleWebApp: {
    title: '吉吉比轉蛋',
    capable: true,
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 在伺服器端就把主題色算好塞進 <head>。
  // 交給 client 端載入後再套的話，畫面會先閃一次預設色再變成設定色
  const themeCss = await getThemeCss();

  return (
    <html lang="zh-TW">
      <head>
        {/* 先把連線建起來：字型在 googleapis（CSS）與 gstatic（字檔）兩個網域，
            不 preconnect 的話 DNS＋TLS 要等到解析出 @font-face 才開始 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

        {/* 全站都要的兩套：內文與金額數字，照常阻塞載入 */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Chiron+GoRound+TC:wght@200..900&family=Tilt+Warp&display=swap"
        />

        {/* 只有特定頁面用得到的四套，改成不擋渲染：
            先以 media="print" 下載（瀏覽器不會為了它延後繪製），載完再切回 all。
            Inter／Noto Sans JP 只有排行榜、Noto Serif HK 只有抽卡對戰特效、
            Oswald 只有商城的金額數字在用，
            為了它們讓每一頁都慢下來不划算。（Noto Sans SC 全站沒用到，已移除）

            這個 <link> 刻意用 script 建，不放進 React 的樹裡：
            字型通常在 hydrate 之前就載完、onload 已經把 media 改成 'all'，
            React 拿它跟自己記得的 'print' 一比就報 hydration mismatch
            （"some attributes of the server rendered HTML didn't match"）。
            結果是對的（media 本來就該變成 all），但每次進站都噴一則 console error。
            元素不由 React 管，就沒有這個比對。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var l=document.createElement('link');l.rel='stylesheet';l.media='print';l.href='https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,700;1,700&family=Noto+Sans+JP:wght@400;500;700;800;900&family=Noto+Serif+HK:wght@200..900&family=Oswald:wght@500;600&display=swap';l.onload=function(){l.media='all'};document.head.appendChild(l)})()`,
          }}
        />

        {/*
          suppressHydrationWarning：有些瀏覽器擴充套件（例如網頁檢視類的工具）
          會在 React 載入前把這顆 script 整個換掉 —— 把 type 改成 text/javascript、
          內容清空、再塞一個 src="chrome-extension://…/inspector.js" 進來。
          React 一比對就報 hydration mismatch，每次進站都噴一則 console error。

          那是使用者端的環境問題，我們改不了；但 JSON-LD 是給爬蟲看的靜態內容，
          本來就不需要 React 去對帳。標上這個屬性讓它跳過比對，
          擴充套件裝了也不會再洗版。
        */}
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      </head>
      <body className="min-h-screen flex flex-col font-sans text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50 transition-colors duration-300">
        <AuthProvider>
        {/* 維護開啟時把停在頁面上的使用者帶到維護頁 */}
        <MaintenanceWatcher />
          <ThemeProvider>
            <AlertProvider>
              <ToastProvider>
                <FeatureFlagsProvider>
                <PromotionsProvider>
                  <RouteTransitionProvider>
                  <PwaInputFocusFix />
                  <PwaPullToRefresh />
                  <AnalyticsTracker />
                  <Navbar />
                  <main className="flex-grow">
                    <PathnameKeyed>{children}</PathnameKeyed>
                  </main>
                  <FooterWrapper />
                  <MobileTabbar />
                  </RouteTransitionProvider>
                </PromotionsProvider>
                </FeatureFlagsProvider>
              </ToastProvider>
            </AlertProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
