import { Database } from '@/types/database.types'

type Prize = Database['public']['Tables']['prizes']['Row']
type ProductPrize = Database['public']['Tables']['product_prizes']['Row']

const LEVEL_ORDER = ['A賞', 'B賞', 'C賞', 'D賞', 'E賞', 'F賞', 'G賞', 'H賞', 'Last One']

interface SortablePrize {
  grade?: string
  level?: string
  [key: string]: any
}

/**
 * 標準化獎項等級
 * 將獎項重新分配等級，確保按照 A-H 順序，無重複或跳級
 */
export function normalizePrizeLevels<T extends SortablePrize>(prizes: T[]): T[] {
  if (prizes.length === 0) return prizes

  // 按照當前等級排序（如果有的話）
  const sortedPrizes = [...prizes].sort((a, b) => {
    const levelA = a.level || a.grade || ''
    const levelB = b.level || b.grade || ''
    const aIndex = LEVEL_ORDER.indexOf(levelA)
    const bIndex = LEVEL_ORDER.indexOf(levelB)
    if (aIndex === -1 && bIndex === -1) return 0
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  // 重新分配等級
  const normalizedPrizes: T[] = []
  let levelIndex = 0

  for (let i = 0; i < sortedPrizes.length; i++) {
    const prize = sortedPrizes[i]
    const newPrize = { ...prize }
    
    // 如果已經用完所有等級，保持最後一個等級
    const targetLevel = levelIndex >= LEVEL_ORDER.length 
      ? LEVEL_ORDER[LEVEL_ORDER.length - 1] 
      : LEVEL_ORDER[levelIndex]

    if ('level' in newPrize) {
      (newPrize as any).level = targetLevel
    } else if ('grade' in newPrize) {
      (newPrize as any).grade = targetLevel
    }
    
    normalizedPrizes.push(newPrize)
    
    if (levelIndex < LEVEL_ORDER.length) {
      levelIndex++
    }
  }

  return normalizedPrizes
}
