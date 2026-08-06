import type { FeatureKey, FeatureStates, FlagState } from '@/contexts/FeatureFlagsContext';

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
 * 這個商品的類別現在是什麼狀態。
 *
 * 沒有對應開關的（機台）一律回 'on'。
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
