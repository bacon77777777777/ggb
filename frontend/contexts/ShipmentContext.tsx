'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface ShipmentItem {
  product: string
  prize: string
  imageUrl: string
}

interface Shipment {
  id: number
  orderId: string
  userId: string
  user: string
  userName: string
  recipientName: string
  recipientPhone: string
  date: string
  submittedAt: string
  shippedAt: string | null
  days: number
  status: 'submitted' | 'processing' | 'picked_up' | 'shipping' | 'delivered' | 'cancelled'
  address: string
  trackingNumber: string
  items: ShipmentItem[]
}

interface ShipmentContextType {
  shipments: Shipment[]
  setShipments: (shipments: Shipment[]) => void
  highlightedOrderId: string | null
  setHighlightedOrderId: (orderId: string | null) => void
}

const ShipmentContext = createContext<ShipmentContextType | undefined>(undefined)

export function ShipmentProvider({ children }: { children: ReactNode }) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null)

  return (
    <ShipmentContext.Provider value={{ shipments, setShipments, highlightedOrderId, setHighlightedOrderId }}>
      {children}
    </ShipmentContext.Provider>
  )
}

export function useShipment() {
  const context = useContext(ShipmentContext)
  if (context === undefined) {
    throw new Error('useShipment must be used within a ShipmentProvider')
  }
  return context
}
