import { Database } from '@/types/database.types'

type DbProduct = Database['public']['Tables']['products']['Row']
type DbPrize = Database['public']['Tables']['prizes']['Row']
type DbProductPrize = Database['public']['Tables']['product_prizes']['Row']

type Product = DbProduct & {
  prizes: (DbPrize | DbProductPrize)[]
}

/**
 * 從實際抽獎記錄計算商品的獎項統計
 */
export function calculateProductStatsFromDraws(
  productId: number,
  draws: any[] // Should be DrawHistory type
): { [prizeLevel: string]: number } {
  // If draws are for this product already, we don't need to filter by product_id if not present
  // But safer to check if product_id is present
  const productDraws = draws.filter(d => 
    d.product_id === productId || d.productId === productId
  )
  
  const drawnStats: { [prizeLevel: string]: number } = {}
  productDraws.forEach(draw => {
    // Check if draw has prize info
    let prizeLevel = ''
    if (draw.prizes && draw.prizes.grade) {
      prizeLevel = draw.prizes.grade
    } else if (draw.product_prizes && draw.product_prizes.level) {
      prizeLevel = draw.product_prizes.level
    } else if (draw.prize_level) {
      prizeLevel = draw.prize_level
    } else if (draw.prize) {
      prizeLevel = draw.prize
    }
    
    if (prizeLevel) {
      // 如果包含空格，取第一部分
      if (prizeLevel.includes(' ')) {
        prizeLevel = prizeLevel.split(' ')[0]
      }
      const normalizedLevel = prizeLevel.trim()
      drawnStats[normalizedLevel] = (drawnStats[normalizedLevel] || 0) + 1
    }
  })
  
  return drawnStats
}

export function getProductPrizeStats(
  product: Product,
  draws: any[]
): {
  [prizeLevel: string]: {
    total: number
    drawn: number
    remaining: number
  }
} {
  const drawnStats = calculateProductStatsFromDraws(product.id, draws)
  
  const stats: { [prizeLevel: string]: { total: number; drawn: number; remaining: number } } = {}
  
  if (product.prizes) {
    product.prizes.forEach(prize => {
      const prizeLevel = (prize as any).grade || (prize as any).level
      const total = (prize as any).quantity || (prize as any).total || 0
      const drawn = drawnStats[prizeLevel] || 0
      const remaining = Math.max(0, total - drawn)
      
      stats[prizeLevel] = {
        total,
        drawn,
        remaining
      }
    })
  }
  
  return stats
}

export function calculateTotalSalesFromDraws(productId: number, draws: any[]): number {
  return draws.filter(d => d.product_id === productId || d.productId === productId).length
}
