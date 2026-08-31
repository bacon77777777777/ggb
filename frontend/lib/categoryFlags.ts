import type { FeatureKey, FeatureStates, FlagState } from '@/contexts/FeatureFlagsContext';

/**
 * 商品類別 ←→ 功能開關
 *
 * products.type 跟 feature_flags.key 是同名的（gacha / ichiban / blindbox / card / custom / slot），
 * 所以這裡只需要一份白名單，不需要對照表。
 *
 * 機台（slot）原本刻意不受開關管轄，migration 496 起也納入 —— 其他五個都能
 * 開放／維護／關閉，只有機台不行的話，後台看起來像漏了一個。
 *
 * ⚠️ `lottery`（抽籤販售，migration 656）**不是** products.type ——
 * 抽籤商品沿用既有的 type（一番賞、抽卡…），檔期掛在 lottery_events。
 * 它進這份清單純粹是為了共用「開放／維護／關閉」那套 UI 與判斷函數，
 * 判斷時要自己傳 'lottery' 進來，不會有商品的 type 是它。
 */
/*
 * 兩份清單刻意分開：
 *
 *   PRODUCT_CATEGORY_KEYS  真的會出現在 products.type 上的值。
 *                          `categoryFlagKey()` 只認這一份 —— 它是拿商品的 type
 *                          去查開關，回傳值會被當成商品標籤（ProductBadge）用。
 *   CATEGORY_KEYS          功能開關頁上「類別」那一區要列出來的東西，多一個 lottery。
 *
 * 合成一份的話，`categoryFlagKey()` 的回傳型別就會包含 'lottery'，而任何商品都不可能
 * 是那個值 —— 於是每個把它拿去當商品標籤的地方都要多寫一次不可能發生的判斷。
 */
const PRODUCT_CATEGORY_KEYS = ['ichiban', 'blindbox', 'gacha', 'card', 'custom', 'slot'] as const;
const CATEGORY_KEYS = [...PRODUCT_CATEGORY_KEYS, 'lottery'] as const;

export type ProductCategoryKey = (typeof PRODUCT_CATEGORY_KEYS)[number];
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  ichiban: '一番賞',
  blindbox: '盒玩',
  gacha: '轉蛋',
  card: '抽卡',
  custom: '自製賞',
  slot: '機台',
  lottery: '抽籤販售',
};

/** 這個商品類別對應到哪個開關；沒有對應就回 null */
export function categoryFlagKey(type?: string | null): ProductCategoryKey | null {
  return PRODUCT_CATEGORY_KEYS.includes(type as ProductCategoryKey)
    ? (type as ProductCategoryKey)
    : null;
}

/**
 * 這個商品的類別現在是什麼狀態。
 *
 * 沒有對應開關的一律回 'on'。
 * 旗標還在載入時也回 'on' —— 寧可讓玩家多看半秒商品頁，
 * 也不要在頁面剛開的瞬間閃一下「維護中」再跳回正常。
 */
export function categoryState(
  type: string | null | undefined,
  states: FeatureStates,
  isLoading: boolean,
): FlagState {
  if (isLoading) return 'on';
  const key = categoryFlagKey(type);
  return key ? (states[key as FeatureKey] ?? 'on') : 'on';
}

/** 關閉：從前台完全消失。維護中不算 —— 那個要照常列出、只是抽不了 */
export function isCategoryHidden(
  type: string | null | undefined,
  states: FeatureStates,
  isLoading: boolean,
): boolean {
  return categoryState(type, states, isLoading) === 'off';
}

/** 維護中：照常顯示，但抽不了 */
export function isCategoryUnderMaintenance(
  type: string | null | undefined,
  states: FeatureStates,
  isLoading: boolean,
): boolean {
  return categoryState(type, states, isLoading) === 'maintenance';
}

/**
 * 濾掉「關閉」的商品。維護中的會留著 —— 玩家該看得到它還在、只是暫時停一下。
 * 旗標載入中一律回原本的清單，避免畫面先閃一次空的。
 */
export function filterEnabledCategories<T extends { type?: string | null }>(
  items: T[],
  states: FeatureStates,
  isLoading: boolean,
): T[] {
  if (isLoading) return items;
  return items.filter(item => !isCategoryHidden(item.type, states, false));
}
