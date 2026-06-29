/**
 * 合併 Tailwind CSS 類名的工具函數
 * 簡化版本，不依賴外部庫
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes
    .filter(Boolean)
    .join(' ')
    .split(' ')
    .filter((cls, index, arr) => {
      // 簡單的去重邏輯：保留最後出現的類名
      const baseClass = cls.split('-')[0]
      const lastIndex = arr.lastIndexOf(cls)
      return index === lastIndex
    })
    .join(' ')
}
