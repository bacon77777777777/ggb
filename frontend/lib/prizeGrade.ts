/**
 * 賞等的單一事實來源 —— 配色與排序
 *
 * 全站共用（中獎彈窗／品項總覽／配率表／品項詳情）。抽在這裡而不是各畫面
 * 自己一份，是因為玩家在不同地方看到同一個賞等時，顏色必須一模一樣；
 * 之前 PrizeDetailSheet 自己留了一份純文字色，同一個 B賞 在兩個畫面長不一樣。
 *
 * ── 配色的規則：**醒目程度必須隨賞等單調遞減**
 *
 * 舊版全部用 `bg-*-100` 的淺色底，只換色相 —— 結果 B賞（橘）看起來比
 * D賞（綠）還不明顯，因為淺橘的對比本來就比淺綠低，玩家一眼分不出輕重。
 *
 * 改成三段式：
 *   最高階（最後賞／隱藏／A／B）實心底＋白字 —— 一眼就跳出來
 *   中段（C／D／E）淺色底＋深色字 —— 看得到但不搶戲
 *   其餘（F 以下／一般版／未知）灰底 —— 純標示
 *
 * 這樣不管色相怎麼變，對比度是階梯式下降的，順序不會再被色相錯覺翻盤。
 */

export interface GradeStyle {
  /** 底色（含深色模式） */
  bg: string;
  /** 文字色（含深色模式） */
  text: string;
}

/** 實心底：留給最高階，白字最搶眼 */
const solid = (bg: string): GradeStyle => ({ bg, text: 'text-white' });

export function gradeStyle(grade?: string | null): GradeStyle {
  const g = String(grade ?? '').trim();
  if (!g) return { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-500 dark:text-neutral-400' };

  // 最後賞與隱藏款是整檔最稀有的，給最強的視覺
  if (/最後賞|last\s*one/i.test(g)) return solid('bg-amber-400 dark:bg-amber-500');
  if (/隱藏|secret/i.test(g)) return solid('bg-violet-600 dark:bg-violet-500');

  if (/^A|SSR|SP/i.test(g)) return solid('bg-red-600 dark:bg-red-500');
  if (/^B|SR/i.test(g)) return solid('bg-orange-500 dark:bg-orange-400');

  if (/^C/i.test(g)) return { bg: 'bg-amber-200 dark:bg-amber-900/50', text: 'text-amber-900 dark:text-amber-200' };
  if (/^D/i.test(g)) return { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-300' };
  if (/^E/i.test(g)) return { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-800 dark:text-sky-300' };

  return { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-400' };
}

/**
 * 賞等排名，數字越小越大獎。用在兩個地方：
 *   1. 中獎號角吹幾聲（0 → 六音＋亮片、1 → 四音、其餘兩音）
 *   2. 中獎彈窗由好到爛排序
 *
 * 最後賞排在 A賞前面 —— 它是完抽才發的加碼獎，比 A賞更難拿到。
 * 轉蛋／盒玩多半只有「一般版」，落到最後一階。
 */
export function gradeRank(grade?: string | null): number {
  const g = String(grade ?? '').trim();
  if (!g) return 99;
  if (/最後賞|last\s*one/i.test(g)) return 0;
  if (/隱藏|secret/i.test(g)) return 1;
  if (/^A|SSR|SP/i.test(g)) return 2;
  if (/^B|SR/i.test(g)) return 3;
  if (/^C/i.test(g)) return 4;
  if (/^D/i.test(g)) return 5;
  if (/^E/i.test(g)) return 6;
  // F 以後照字母順序接在後面，不然 F~M 會全部並列、排序失去意義
  const m = g.match(/^([F-Z])/i);
  if (m) return 6 + (m[1].toUpperCase().charCodeAt(0) - 'E'.charCodeAt(0));
  return 99;
}
