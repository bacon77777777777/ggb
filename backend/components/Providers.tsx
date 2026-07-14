'use client'

import { AdminProvider } from '@/contexts/AdminContext'
import { ShipmentProvider } from '@/contexts/ShipmentContext'
import { LogProvider } from '@/contexts/LogContext'
import { ProductProvider } from '@/contexts/ProductContext'
import { ConfigProvider } from 'antd'
import zhTW from 'antd/locale/zh_TW'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhTW}
      theme={{
        token: {
          colorPrimary: '#3B82F6',
          colorSuccess: '#22c55e',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          borderRadius: 8,
          fontFamily: 'Noto Sans TC, Helvetica, Arial, sans-serif',
        },
      }}
    >
      <AdminProvider>
        <LogProvider>
          <ShipmentProvider>
            <ProductProvider>{children}</ProductProvider>
          </ShipmentProvider>
        </LogProvider>
      </AdminProvider>
    </ConfigProvider>
  )
}
