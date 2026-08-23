/**
 * Session 意圖（老闆 2026-08-22 冷啟動優化）：玩家這一趟點了什麼、看了什麼，
 * **立刻**回饋到下一次刷新 —— 同系列 ×2、同類型 ×1.5，像短影音「多看兩秒下一支就變」。
 * 不需要登入、不需要 DB；只存在這個 session（sessionStorage），30 分鐘沒動作清掉。
 *
 * 同時留最近 8 件互動過的商品（系列／類型／價格），給「看了 A 推同系列的 B」
 * 的 item-to-item 用 —— 訪客與新帳號沒有偏好分數時，「為你推薦」桶靠這個。
 */
const KEY = 'ggb:feed:intent';
const EXPIRE_MS = 30 * 60 * 1000;
const MAX_RECENT = 8;

export interface RecentItem { id: number; series?: string | null; type?: string | null; price?: number | null; at: number }
export interface SessionIntent {
  /** 系列 → 互動次數（點擊 1、瀏覽 1.5） */
  series: Map<string, number>;
  /** 類型 → 互動次數 */
  types: Map<string, number>;
  recent: RecentItem[];
}

interface Stored { series: Record<string, number>; types: Record<string, number>; recent: RecentItem[]; at: number }

function load(): Stored {
  const empty: Stored = { series: {}, types: {}, recent: [], at: Date.now() };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return empty;
    const s = JSON.parse(raw) as Stored;
    if (!s || Date.now() - (s.at || 0) > EXPIRE_MS) return empty;
    return { series: s.series || {}, types: s.types || {}, recent: Array.isArray(s.recent) ? s.recent : [], at: s.at };
  } catch { return empty; }
}

function save(s: Stored) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...s, at: Date.now() })); } catch { /* 無痕 */ }
}

/** 點了／看了一件商品：記下來，下一輪 feed 馬上偏向它的系列與類型 */
export function noteInteraction(item: { id: number | string; series?: string | null; type?: string | null; price?: number | null }, kind: 'click' | 'view' = 'click') {
  if (typeof window === 'undefined') return;
  const s = load();
  const w = kind === 'view' ? 1.5 : 1;
  const series = (item.series || '').trim();
  const type = (item.type || '').trim();
  if (series) s.series[series] = (s.series[series] || 0) + w;
  if (type) s.types[type] = (s.types[type] || 0) + w;
  const id = Number(item.id);
  s.recent = [{ id, series: series || null, type: type || null, price: item.price ?? null, at: Date.now() },
    ...s.recent.filter(r => r.id !== id)].slice(0, MAX_RECENT);
  save(s);
}

export function sessionIntent(): SessionIntent {
  const s = load();
  return {
    series: new Map(Object.entries(s.series)),
    types: new Map(Object.entries(s.types)),
    recent: s.recent,
  };
}
