
import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import MobileTabbar from '@/components/MobileTabbar';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { AlertProvider } from '@/components/ui/AlertDialog';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { FeatureFlagsProvider } from '@/contexts/FeatureFlagsContext';
import PathnameKeyed from '@/components/PathnameKeyed';
import PwaInputFocusFix from '@/components/PwaInputFocusFix';
import PwaPullToRefresh from '@/components/PwaPullToRefresh';
import AnalyticsTracker from '@/components/AnalyticsTracker';
import { getSiteUrl } from '@/lib/site';

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

const OG_IMAGE = `${siteUrl}/images/banner.png`

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50 transition-colors duration-300">
        <AuthProvider>
          <ThemeProvider>
            <AlertProvider>
              <ToastProvider>
                <FeatureFlagsProvider>
                  <PwaInputFocusFix />
                  <PwaPullToRefresh />
                  <AnalyticsTracker />
                  <Navbar />
                  <main className="flex-grow">
                    <PathnameKeyed>{children}</PathnameKeyed>
                  </main>
                  <div className="hidden md:block">
                    <Footer />
                  </div>
                  <MobileTabbar />
                </FeatureFlagsProvider>
              </ToastProvider>
            </AlertProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
