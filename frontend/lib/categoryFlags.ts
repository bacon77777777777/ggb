import type { FeatureKey, FeatureFlags } from '@/contexts/FeatureFlagsContext';

/**
 * 商品類別 ←→ 功能開關
 *
 * products.type 跟 feature_flags.key 是同名的（gacha / ichiban / blindbox / card / custom），
 * 所以這裡只需要一份白名單，不需要對照表。
 *
 * 機台（slot）沒有對應的開關，永遠開著 —— 它不在下面這個集合裡。
 */
const CATEGORY_KEYS = ['ichiban', 'blindbox', 'gacha', 'card', 'custom'] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  ichiban: '一番賞',
  blindbox: '盒玩',
  gacha: '轉蛋',
  card: '抽卡',
  custom: '自製賞',
};

/** 這個商品類別對應到哪個開關；沒有對應（例如機台）就回 null */
export function categoryFlagKey(type?: string | null): CategoryKey | null {
  return CATEGORY_KEYS.includes(type as CategoryKey) ? (type as CategoryKey) : null;
}

/**
 * 這個商品的類別現在關著嗎
 *
 * 旗標還在載入時一律回 false —— 寧可讓玩家多看半秒商品頁，
 * 也不要在頁面剛開的瞬間閃一下「已關閉」再跳回正常。
 */
export function isCategoryClosed(
  type: string | null | undefined,
  flags: FeatureFlags,
  isLoading: boolean,
): boolean {
  if (isLoading) return false;
  const key = categoryFlagKey(type);
  return key ? !flags[key as FeatureKey] : false;
}

/** 濾掉類別關著的商品。旗標載入中一律回原本的清單，避免畫面先閃一次空的 */
export function filterEnabledCategories<T extends { type?: string | null }>(
  items: T[],
  flags: FeatureFlags,
  isLoading: boolean,
): T[] {
  if (isLoading) return items;
  return items.filter(item => !isCategoryClosed(item.type, flags, false));
}
