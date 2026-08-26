import type { BadgeVariant } from '@/components/ui/Badge'

/**
 * 商品類別的中文對照
 *
 * 後台好幾頁各自複製一份，加一個新類別就得記得改三處；漏掉的那一頁會直接
 * 把 `gacha`／`blindbox` 這種代號印給人看（老闆 2026-08-26 在推薦 feed 報表上
 * 看到的就是這個）。收成一份。
 *
 * ⚠️ 「類別」不是「類型」：後台的欄位標題統一用**類別**。
 * 商品有幾種賣法（轉蛋／盒玩／一番賞／抽卡／自製賞／機台）是類別；
 * 「類型」在這個系統裡另有所指（事件類型、調整類型…），混用會讓人以為是同一件事。
 */

export const PRODUCT_TYPES = {
  gacha:    { label: '轉蛋',   variant: 'info'    },
  blindbox: { label: '盒玩',   variant: 'primary' },
  ichiban:  { label: '一番賞', variant: 'warning' },
  card:     { label: '抽卡',   variant: 'success' },
  custom:   { label: '自製賞', variant: 'default' },
  slot:     { label: '機台',   variant: 'default' },
} satisfies Record<string, { label: string; variant: BadgeVariant }>

export type ProductType = keyof typeof PRODUCT_TYPES

/**
 * 代號 → 中文。
 * 對不到就原樣回傳 —— 顯示未知代號至少查得出來，顯示空白只會讓人以為資料壞了。
 */
export function productTypeLabel(type: string | null | undefined): string {
  if (!type) return '—'
  return PRODUCT_TYPES[type as ProductType]?.label ?? type
}

export function productTypeVariant(type: string | null | undefined): BadgeVariant {
  return PRODUCT_TYPES[type as ProductType]?.variant ?? 'default'
}

/** 給下拉選單用的選項（含「全部類別」）*/
export const PRODUCT_TYPE_OPTIONS = [
  { value: 'all', label: '全部類別' },
  ...Object.entries(PRODUCT_TYPES).map(([value, { label }]) => ({ value, label })),
]
