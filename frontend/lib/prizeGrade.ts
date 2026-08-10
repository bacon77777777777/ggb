/**
 * 賞等膠囊配色 —— 中獎結果彈窗共用（轉蛋／盒玩／一番賞／抽卡／自製賞）
 *
 * 越大的賞越暖越搶眼，一眼看得出輕重。抽在這裡而不是各彈窗自己一份，
 * 是因為玩家在不同機台看到同一個賞等時，顏色必須一致。
 */
export function gradeStyle(grade?: string | null): { bg: string; text: string } {
  const g = String(grade ?? '').trim();
  if (!g) return { bg: 'bg-neutral-100', text: 'text-neutral-500' };
  if (/最後賞|last\s*one/i.test(g)) return { bg: 'bg-yellow-100', text: 'text-yellow-700' };
  if (/隱藏/.test(g)) return { bg: 'bg-violet-100', text: 'text-violet-700' };
  if (/^A|SSR|SP/i.test(g)) return { bg: 'bg-red-100', text: 'text-red-700' };
  if (/^B|SR/i.test(g)) return { bg: 'bg-orange-100', text: 'text-orange-700' };
  if (/^C/i.test(g)) return { bg: 'bg-amber-100', text: 'text-amber-700' };
  if (/^D/i.test(g)) return { bg: 'bg-green-100', text: 'text-green-700' };
  if (/^E/i.test(g)) return { bg: 'bg-sky-100', text: 'text-sky-700' };
  return { bg: 'bg-neutral-100', text: 'text-neutral-500' };
}
