/**
 * token_adjustments.category 的中文標籤（migration 582）。
 * API、報表頁、GB哥回報共用；順序＝報表小計卡的顯示順序。
 */
export const TOKEN_ADJUSTMENT_CATEGORIES: Record<string, string> = {
  marketing:    '行銷／補償',
  correction:   '帳務更正',
  internal:     '內部測試',
  shipping_fee: '出貨運費',
  sell:         '商城',
  marketplace:  '交易所',
  slot:         '挑戰機台',
  real_payment: '實收（已停用）',
  other:        '其他（未分類）',
}

export const TOKEN_ADJUSTMENT_CATEGORY_KEYS = Object.keys(TOKEN_ADJUSTMENT_CATEGORIES)
