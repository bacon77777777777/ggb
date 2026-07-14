import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/Providers'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import '@ant-design/v5-patch-for-react-19'

export const metadata: Metadata = {
  title: {
    template: '%s | GachaGo Admin',
    default: 'GachaGo 後台管理系統',
  },
  description: '一番賞線上抽獎平台後台管理系統',
  icons: {
    icon: '/images/favicon.png',
    apple: '/images/favicon.png',
  },
  appleWebApp: {
    title: 'Gacha Admin',
    capable: true,
    statusBarStyle: 'default',
  },
  manifest: '/manifest.json',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  )
}
