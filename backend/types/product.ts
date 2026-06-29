export interface Prize {
  name: string
  level: string
  imageUrl: string
  total: number
  remaining: number
  probability: number
}

export interface Product {
  id: number
  productCode: string
  name: string
  category: string
  categoryId?: string // FK to categories table
  type?: 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom'
  categories?: {
    name: string
  }
  tags?: {
    id: string
    name: string
  }[]
  price: number
  remaining: number
  status: string
  sales: number
  isHot: boolean
  createdAt: string
  startedAt?: string
  endedAt?: string
  txidHash?: string
  seed?: string
  imageUrl?: string
  prizes: Prize[]
  totalCount?: number
  releaseYear?: string
  releaseMonth?: string
  distributor?: string
  rarity?: number
  majorPrizes?: string[]
}

export interface SmallItem {
  id: string
  name: string
  imageUrl?: string
  category: string
  level: string
  description?: string
  createdAt: string
}
