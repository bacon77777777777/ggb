/**
 * 運費優惠券的折抵公式 —— 跟 DB `create_delivery_order`（migration 696）一字不差。
 *
 * 送單時 DB 會自己重算折抵，再拿前端送的「折後運費」比對，不一致就 FEE_MISMATCH 擋下。
 * 所以這裡不能有自己的想法：免運＝整筆運費；百分比＝運費 × N% 四捨五入；固定金額＝折抵 G 上限。
 */
export type ShippingDiscountType = 'fixed' | 'percentage' | 'free_shipping';

export function calcShippingDiscount(type: ShippingDiscountType, value: number, fee: number): number {
  if (!(fee > 0)) return 0;
  const v = Number.isFinite(value) ? value : 0;
  if (type === 'free_shipping') return fee;
  if (type === 'percentage') return Math.min(fee, Math.round(fee * v / 100));
  return Math.min(fee, Math.max(0, Math.floor(v)));
}

/** 券本身的說明字（不帶當次運費）：免運費／運費 N% 折抵／折抵運費 N G */
export function shippingCouponLabel(type: ShippingDiscountType, value: number): string {
  if (type === 'free_shipping') return '免運費';
  if (type === 'percentage') return `運費 ${value}% 折抵`;
  return `折抵運費 ${value.toLocaleString()} G`;
}
