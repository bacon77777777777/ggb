/**
 * 物流通路的中文名（後台顯示與出貨明細單共用）
 *
 * 出貨明細單那支 route 原本自己存了一份，配送管理列表要顯示通路時差點又複製第三份。
 * 收在這裡。
 */
export const LOGISTICS_LABEL: Record<string, string> = {
  UNIMART: '7-11',
  FAMI:    '全家',
  HILIFE:  '萊爾富',
  OKMART:  'OK超商',
  TCAT:    '黑貓宅急便',
  POST:    '郵局',
}

export function logisticsLabel(subtype?: string | null): string {
  if (!subtype) return ''
  return LOGISTICS_LABEL[subtype] ?? subtype
}

/** 通路 + 門市／地址，一行講完 */
export function logisticsSummary(o: {
  logisticsType?: string | null
  logisticsSubtype?: string | null
  storeName?: string | null
  address?: string | null
}): { channel: string; detail: string; isCvs: boolean } {
  const isCvs = o.logisticsType === 'CVS'
  const brand = logisticsLabel(o.logisticsSubtype)
  return {
    channel: isCvs ? (brand || '超商') : (brand ? `宅配・${brand}` : '宅配'),
    detail:  isCvs ? (o.storeName || '') : (o.address || ''),
    isCvs,
  }
}

/**
 * 配送方式的完整講法（老闆 2026-08-26 指定）：
 *   超商取貨[7-11] ／ 宅配到府
 * 原本只印品牌名，看不出是「去門市拿」還是「送到家」。
 */
export function deliveryMethodLabel(o: {
  logisticsType?: string | null
  logisticsSubtype?: string | null
}): string {
  if (o.logisticsType !== 'CVS') return '宅配到府'
  const brand = logisticsLabel(o.logisticsSubtype)
  return brand ? `超商取貨[${brand}]` : '超商取貨'
}

/**
 * 收件地址那一行。
 *
 * 超商單的 `orders.address` 存的**就是門市地址**（建單時 p_address 帶的是 storeAddress），
 * 所以這裡把門市名括在前面：`[經貿]台北市南港區三重路19號1樓`。
 * 不硬加「門市」二字 —— 有些門市名本身就含（例如「建盛門市」），加了會變成「建盛門市門市」。
 */
export function recipientAddressLine(o: {
  logisticsType?: string | null
  storeName?: string | null
  address?: string | null
}): string {
  const addr = o.address || ''
  if (o.logisticsType === 'CVS' && o.storeName) {
    return addr ? `[${o.storeName}]${addr}` : `[${o.storeName}]`
  }
  return addr || '—'
}
