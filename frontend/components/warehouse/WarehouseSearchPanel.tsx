import React from 'react';
import { cn } from '@/lib/utils';

/**
 * 倉庫搜尋展開後的「推薦」面板（老闆 2026-08-24，照 Pokémon GO 的寶可夢倉庫）。
 *
 * 為什麼類別不再是頁籤：頁籤列一排只塞得下六個，「自製賞」在 iPhone 上還被右邊的
 * 篩選圖標切掉。改成點搜尋才展開的推薦按鈕之後，數量不再受一排寬度限制，
 * 而且每個都能帶數字 —— 玩家在點下去之前就知道自己有幾件。
 *
 * 關鍵是**不打字也要有東西可點**：點一下搜尋框就直接看到這些按鈕，
 * 這樣休閒玩家的瀏覽路徑才不會因為類別藏起來而斷掉。
 */
export interface WarehouseChip {
  key: string;
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}

export interface WarehouseChipGroup {
  title: string;
  chips: WarehouseChip[];
}

export default function WarehouseSearchPanel({
  groups,
  recentTerms,
  onPickTerm,
}: {
  groups: WarehouseChipGroup[];
  /** 倉庫裡出現最多的幾個系列名，當成現成的關鍵字 */
  recentTerms?: string[];
  onPickTerm?: (term: string) => void;
}) {
  return (
    <div className="space-y-5 p-4">
      {groups.map(group => (
        <div key={group.title}>
          <p className="mb-2 px-0.5 text-[11px] font-black uppercase tracking-widest text-neutral-400">
            {group.title}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.chips.map(chip => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onSelect}
                /* 數量 0 的照樣列出來但點不下去 —— 直接消失的話，玩家會以為
                   「這個類別不見了」而不是「我沒有這一類的獎品」 */
                disabled={chip.count === 0}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-black transition-all active:scale-95',
                  chip.count === 0 && 'opacity-35',
                  chip.active
                    ? 'border-primary bg-primary text-white'
                    : 'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200',
                )}
              >
                <span className="cjk-optical-center">{chip.label}</span>
                <span
                  className={cn(
                    'text-[12px] font-black tabular-nums',
                    chip.active ? 'text-white/75' : 'text-neutral-400',
                  )}
                >
                  {chip.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {recentTerms && recentTerms.length > 0 && (
        <div>
          <p className="mb-2 px-0.5 text-[11px] font-black uppercase tracking-widest text-neutral-400">
            倉庫裡的系列
          </p>
          <div className="flex flex-wrap gap-2">
            {recentTerms.map(term => (
              <button
                key={term}
                type="button"
                onClick={() => onPickTerm?.(term)}
                className="max-w-full truncate rounded-full border border-neutral-200 bg-white px-3 py-2 text-[13px] font-bold text-neutral-600 transition-all active:scale-95 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
              >
                <span className="cjk-optical-center">{term}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
