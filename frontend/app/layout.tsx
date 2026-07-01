
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
import AnalyticsTracker from '@/components/AnalyticsTracker';
import { getSiteUrl } from '@/lib/site';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: {
    template: '%s | 吉吉比',
    default: '在線轉蛋 吉吉比',
  },
  description: '隨時隨地，享受抽獎樂趣',
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
    description: '隨時隨地，享受抽獎樂趣',
    images: ['/images/20260629/favicon.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '在線轉蛋 吉吉比',
    description: '隨時隨地，享受抽獎樂趣',
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
    title: '吉吉比扭蛋',
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
      <body className="min-h-screen flex flex-col font-sans text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50 transition-colors duration-300">
        <AuthProvider>
          <ThemeProvider>
            <AlertProvider>
              <ToastProvider>
                <FeatureFlagsProvider>
                  <PwaInputFocusFix />
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
