import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 商品促銷（migration 491/494/495/510）
 *
 * 資料來源是 public_product_promotions view —— 檔期與優先權在 DB 端已套用，
 * 前台不自己 join promotions，兩邊算法才不會漂移。
 */
export interface ProductPromotion {
  promotionId: number;
  /** 完整方案名（商品資訊列用）：開學買五送一 */
  name: string;
  /** 短標（商品卡角落用）：買5送1 */
  badgeText: string;
  type: string;
  /** bundle 型：買 buy 送 free */
  buy: number;
  free: number;
}

export async function fetchProductPromotion(
  supabase: SupabaseClient,
  productId: number,
): Promise<ProductPromotion | null> {
  const { data } = await supabase
    .from('public_product_promotions')
    .select('promotion_id, name, badge_text, type, config')
    .eq('product_id', productId)
    .maybeSingle();
  if (!data) return null;
  const cfg = (data.config ?? {}) as { buy?: number; free?: number };
  return {
    promotionId: data.promotion_id,
    name: data.name ?? data.badge_text ?? '',
    badgeText: data.badge_text ?? '',
    type: data.type,
    buy: Math.max(1, Number(cfg.buy ?? 0)),
    free: Math.max(0, Number(cfg.free ?? 0)),
  };
}

/**
 * 促銷折抵金額。**必須跟 DB 的 promo_discount_for 同一條公式**：
 * 每湊滿 (buy+free) 抽折 free 抽的錢（抽 6 付 5；抽 10 付 9）。
 * 這裡只做顯示，實際扣款以 DB 為準 —— 公式對不上玩家會覺得被多收。
 */
export function promoDiscount(
  promo: ProductPromotion | null,
  count: number,
  unitPrice: number,
): number {
  if (!promo || promo.type !== 'bundle' || promo.free <= 0) return 0;
  if (count < 1 || unitPrice <= 0) return 0;
  const sets = Math.floor(count / (promo.buy + promo.free));
  return sets * promo.free * unitPrice;
}
