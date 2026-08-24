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
  /** 折扣型（first_n／first_per_user，migration 608）：折幾 %、first_n 的總配額 */
  offPct: number;
  n: number;
}

/** 這一次購買實際會折多少（伺服器算，前端只顯示）——  DB 的 promo_discount_quote */
export interface PromoQuote {
  /** 折抵的 G 幣總額 */
  discount: number;
  /** 這次有幾抽吃到折扣（first_n 配額只剩 3 時，抽 5 抽只有 3 抽有折） */
  discountedCount: number;
  offPct: number;
  type: string;
  badgeText: string;
}

/**
 * 折扣試算。**只做顯示**：實際扣款由 play_ichiban／play_gacha 在同一筆交易內重算
 * （前端傳什麼都不影響收費）。查不到或出錯一律當沒折扣，寧可少顯示也不要顯示了卻沒折到。
 */
export async function fetchPromoQuote(
  supabase: SupabaseClient,
  productId: number,
  count: number,
): Promise<PromoQuote | null> {
  if (!(count >= 1)) return null;
  const { data, error } = await supabase.rpc('promo_discount_quote', {
    p_product_id: productId,
    p_count: count,
  });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  const discount = Number(d.discount) || 0;
  if (discount <= 0) return null;
  return {
    discount,
    discountedCount: Number(d.discounted_count) || 0,
    offPct: Number(d.off_pct) || 0,
    type: String(d.type ?? ''),
    badgeText: String(d.badge_text ?? ''),
  };
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
  const cfg = (data.config ?? {}) as { buy?: number; free?: number; off_pct?: number; n?: number };
  return {
    promotionId: data.promotion_id,
    name: data.name ?? data.badge_text ?? '',
    badgeText: data.badge_text ?? '',
    type: data.type,
    buy: Math.max(1, Number(cfg.buy ?? 0)),
    free: Math.max(0, Number(cfg.free ?? 0)),
    offPct: Math.max(0, Number(cfg.off_pct ?? 0)),
    n: Math.max(0, Number(cfg.n ?? 0)),
  };
}

/**
 * 促銷加贈抽數。**必須跟 DB 的 promo_bonus_for 同一條公式**（migration 517）：
 * 每滿 buy 抽送 free 抽 —— 買5送1＝選 5 顆、付 5 顆的錢、拿 6 顆（老闆定義）。
 * 5 抽送 1；10 抽送 2；4 抽以下不送。收入不打折，多送的是庫存。
 * 這裡只做顯示，實際送幾抽以 DB 為準 —— 公式對不上玩家會覺得被少送。
 */
export function promoBonusDraws(
  promo: ProductPromotion | null,
  count: number,
): number {
  if (!promo || promo.type !== 'bundle' || promo.free <= 0) return 0;
  if (count < 1) return 0;
  return Math.floor(count / promo.buy) * promo.free;
}
