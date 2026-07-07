
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

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '吉吉比',
  url: siteUrl,
  description: '吉吉比是台灣線上轉蛋平台，提供日本一番賞、盲盒、轉蛋、卡包等多種商品。',
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/search?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
}

export const metadata: Metadata = {
  title: {
    template: '%s | 吉吉比',
    default: '在線轉蛋 吉吉比',
  },
  description: '吉吉比是台灣線上轉蛋平台，提供日本一番賞、盲盒、轉蛋、卡包等多種商品，隨時隨地輕鬆抽！公正透明、即抽即看、安全出貨。',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: '吉吉比',
    locale: 'zh_TW',
    title: '在線轉蛋 吉吉比',
    description: '吉吉比是台灣線上轉蛋平台，提供日本一番賞、盲盒、轉蛋、卡包等多種商品，隨時隨地輕鬆抽！公正透明、即抽即看、安全出貨。',
    images: ['/images/20260629/favicon.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '在線轉蛋 吉吉比',
    description: '吉吉比是台灣線上轉蛋平台，提供日本一番賞、盲盒、轉蛋、卡包等多種商品，隨時隨地輕鬆抽！公正透明、即抽即看、安全出貨。',
    images: ['/images/20260629/favicon.png'],
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
