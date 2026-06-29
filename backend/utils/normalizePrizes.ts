/**
 * 標準化獎項等級，確保按照 A-H 順序，無重複或跳級
 */

import { Prize } from '@/types/product'

const LEVEL_ORDER = ['A賞', 'B賞', 'C賞', 'D賞', 'E賞', 'F賞', 'G賞', 'H賞', 'I賞', 'J賞']

/**
 * 標準化獎項等級
 * 將獎項重新分配等級，確保按照 A-H 順序，無重複或跳級
 */
export function normalizePrizeLevels(prizes: Prize[]): Prize[] {
  if (prizes.length === 0) return prizes

  // 按照當前等級排序（如果有的話）
  const sortedPrizes = [...prizes].sort((a, b) => {
    const aIndex = LEVEL_ORDER.indexOf(a.level)
    const bIndex = LEVEL_ORDER.indexOf(b.level)
    if (aIndex === -1 && bIndex === -1) return 0
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  // 重新分配等級
  const normalizedPrizes: Prize[] = []
  let levelIndex = 0

  for (let i = 0; i < sortedPrizes.length; i++) {
    const prize = sortedPrizes[i]
    
    // 如果已經用完所有等級，保持最後一個等級
    if (levelIndex >= LEVEL_ORDER.length) {
      normalizedPrizes.push({
        ...prize,
        level: LEVEL_ORDER[LEVEL_ORDER.length - 1]
      })
    } else {
      normalizedPrizes.push({
        ...prize,
        level: LEVEL_ORDER[levelIndex]
      })
      levelIndex++
    }
  }

  return normalizedPrizes
}
