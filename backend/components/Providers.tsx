'use client'

import { AdminProvider } from '@/contexts/AdminContext'
import { ShipmentProvider } from '@/contexts/ShipmentContext'
import { LogProvider } from '@/contexts/LogContext'
import { ProductProvider } from '@/contexts/ProductContext'
import { ToastProvider } from '@/contexts/ToastContext'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AdminProvider>
        <LogProvider>
          <ShipmentProvider>
            <ProductProvider>{children}</ProductProvider>
          </ShipmentProvider>
        </LogProvider>
      </AdminProvider>
    </ToastProvider>
  )
}
