/**
 * 推薦 feed 的「看過」記憶（sessionStorage）
 *
 * 記最近 3 輪的首屏商品 id：上一輪 ×0.15、上上輪 ×0.5、第三輪 ×0.8 的權重懲罰，
 * 「刷新＝給我沒看過的」才有感。30 分鐘沒動作就清掉 —— 玩家隔天再開，第一眼又是
 * 最強陣容；連續刷的時候才一直換。
 */
const KEY = 'ggb:feed:v2';
const EXPIRE_MS = 30 * 60 * 1000;
const MAX_ROUNDS = 3;

interface Stored { rounds: string[][]; at: number }

export function loadSeenRounds(): string[][] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const s = JSON.parse(raw) as Stored;
    if (!s || !Array.isArray(s.rounds) || Date.now() - (s.at || 0) > EXPIRE_MS) return [];
    return s.rounds.slice(0, MAX_ROUNDS);
  } catch { return []; }
}

/** 這一輪的首屏記下來（放最前面），供下一輪降權 */
export function saveRound(firstScreenIds: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const rounds = [firstScreenIds, ...loadSeenRounds()].slice(0, MAX_ROUNDS);
    sessionStorage.setItem(KEY, JSON.stringify({ rounds, at: Date.now() } satisfies Stored));
  } catch { /* 無痕模式寫不了就沒有降權，無害 */ }
}
