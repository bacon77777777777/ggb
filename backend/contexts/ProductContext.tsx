'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface ProductContextType {
  highlightedProductId: number | null
  setHighlightedProductId: (productId: number | null) => void
}

const ProductContext = createContext<ProductContextType | undefined>(undefined)

export function ProductProvider({ children }: { children: ReactNode }) {
  const [highlightedProductId, setHighlightedProductId] = useState<number | null>(null)

  return (
    <ProductContext.Provider value={{ highlightedProductId, setHighlightedProductId }}>
      {children}
    </ProductContext.Provider>
  )
}

export function useProduct() {
  const context = useContext(ProductContext)
  if (context === undefined) {
    throw new Error('useProduct must be used within a ProductProvider')
  }
  return context
}
