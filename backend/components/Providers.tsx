'use client'

import { AdminProvider } from '@/contexts/AdminContext'
import { ShipmentProvider } from '@/contexts/ShipmentContext'
import { LogProvider } from '@/contexts/LogContext'
import { ProductProvider } from '@/contexts/ProductContext'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <LogProvider>
        <ShipmentProvider>
          <ProductProvider>{children}</ProductProvider>
        </ShipmentProvider>
      </LogProvider>
    </AdminProvider>
  )
}
