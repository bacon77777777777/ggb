'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface ShipmentItem {
  product: string
  prize: string
  imageUrl: string
  /** 商品類別（gacha/blindbox/ichiban/card/custom），展開明細顯示類別標籤用 */
  productType?: string
  /** 賞等（可能已含「賞」字，如 E賞；轉蛋盒玩為 普通） */
  level?: string
  /** 品項名稱（不含賞等） */
  prizeName?: string
}

export interface Shipment {
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
  shippingFee: number
  logisticsType: string
  /** 物流子代號（UNIMART/FAMI/HILIFE/OKMART/TCAT/POST），列表要分辨走哪家通路 */
  logisticsSubtype?: string
  storeName?: string
  storeId?: string
  /** 會員編號（給人看的短號）。userId 那串 uuid 只在會員詳情頁露出 */
  memberNo?: number | null
  /** 含一番賞／自製賞的大件：要拿大箱、只能走宅配，備貨前就得知道 */
  hasLarge?: boolean
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
