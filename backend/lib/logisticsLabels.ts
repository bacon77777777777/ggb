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
