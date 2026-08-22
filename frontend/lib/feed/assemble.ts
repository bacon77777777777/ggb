/**
 * 首頁「綜合 → 推薦」的 feed 組裝（老闆 2026-08-22：要像 IG／短影音，刷新每次不一樣、
 * 所有商品都有機會、照個人習慣與話題）。純函數，不碰 DOM。
 *
 * 不是一條排序公式，是「分桶配額＋加權抽籤」：每 6 格一個畫面，每格從不同的桶抽 ——
 *   登入：forYou ×2（個人系列偏好／關注）、topic（話題）、hot（熱賣）、fresh（新上架／快完售）、explore（純隨機）
 *   訪客：hot、explore、topic、hot、fresh、explore
 * 抽到的不放回；桶空了讓給 hot → explore。
 *
 * 每個候選的權重 = 桶內基礎分 × Thompson 抽樣係數 × 看過懲罰：
 *   - Thompson：用近 14 天曝光／點擊的 Beta 後驗抽一個點擊率，除以全站平均 → 點擊率高的自動多推、
 *     沒資料的靠先驗（全站平均、假樣本 20）+ 變異數自然探索。權重是學出來的，不是人定的。
 *   - 看過懲罰：上一輪首屏 ×0.15、上上輪 ×0.5、第三輪 ×0.8（lib/feed/memory.ts）。
 * 硬規則：首屏最多 2 件跟上一輪首屏重複；首 12 件同系列不連 3、同類型不連 4。
 * 售完／結束沉底由呼叫端處理（首頁本來就有那段），這裡只管順序與桶別。
 */
export type FeedBucket = 'forYou' | 'topic' | 'hot' | 'fresh' | 'explore';

export interface FeedProduct {
  id: number | string;
  series?: string | null;
  type?: string | null;
  name?: string | null;
  tags?: string[] | null;
  created_at?: string | null;
  remaining?: number | null;
  total_count?: number | null;
}

export interface FeedSignals {
  /** 個人系列偏好（沒有就用全站系列熱門）；空 Map = 訪客或沒資料 */
  seriesPref: Map<string, number>;
  /** 商品熱度（近期抽數） */
  heat: Map<number, number>;
  /** 關注的商品 id */
  follows: Set<number>;
  /** 話題關鍵字與權重（get_feed_topics） */
  topics: { keyword: string; weight: number }[];
  /** 近期曝光／點擊（get_feed_weights）；mean = 全站平均點擊率 */
  ctr: { mean: number; items: Map<number, { impressions: number; clicks: number }> };
  isGuest: boolean;
}

export interface FeedItem<P extends FeedProduct> {
  product: P;
  bucket: FeedBucket;
  /** 0-based 在 feed 裡的位置 */
  position: number;
}

const SCREEN = 6;
const SLOTS_USER: FeedBucket[] = ['forYou', 'forYou', 'topic', 'hot', 'fresh', 'explore'];
const SLOTS_GUEST: FeedBucket[] = ['hot', 'explore', 'topic', 'hot', 'fresh', 'explore'];
const SEEN_PENALTY = [0.15, 0.5, 0.8];
const MAX_REPEAT_FIRST_SCREEN = 2;
const NEW_WINDOW_MS = 7 * 24 * 3600 * 1000;
const URGENT_RATIO = 0.2;
const PRIOR_PSEUDO = 20;

/** mulberry32：同一次掛載內重算要得到同一副牌，所以 rng 由呼叫端帶種子建 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Beta(α, β) 抽樣（Marsaglia–Tsang gamma），α β 都 ≥ 1 時夠準 */
function sampleBeta(alpha: number, beta: number, rng: () => number): number {
  const g = (k: number) => {
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number, v: number;
      do {
        // Box–Muller 取一個常態
        const u1 = Math.max(rng(), 1e-12);
        const u2 = rng();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = rng();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const a = g(Math.max(alpha, 1));
  const b = g(Math.max(beta, 1));
  return a / (a + b);
}

function weightedPick<T>(pool: T[], weightOf: (t: T) => number, rng: () => number): T | null {
  let total = 0;
  const ws: number[] = new Array(pool.length);
  for (let i = 0; i < pool.length; i++) { ws[i] = Math.max(weightOf(pool[i]), 0); total += ws[i]; }
  if (total <= 0) return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

export function assembleFeed<P extends FeedProduct>(
  products: P[],
  signals: FeedSignals,
  seenRounds: string[][],
  rng: () => number = Math.random,
): FeedItem<P>[] {
  if (products.length === 0) return [];
  const now = Date.now();

  // 看過懲罰
  const penalty = new Map<string, number>();
  seenRounds.forEach((round, i) => {
    const p = SEEN_PENALTY[i] ?? 1;
    for (const id of round) penalty.set(id, Math.min(penalty.get(id) ?? 1, p));
  });
  const seenMul = (p: P) => penalty.get(String(p.id)) ?? 1;

  // Thompson：每個商品抽一次點擊率，除以全站平均；這一輪固定
  const mean = Math.min(Math.max(signals.ctr.mean || 0.03, 0.005), 0.5);
  const ctrMul = new Map<string, number>();
  for (const p of products) {
    const s = signals.ctr.items.get(Number(p.id));
    const alpha = (s?.clicks ?? 0) + PRIOR_PSEUDO * mean;
    const beta = ((s?.impressions ?? 0) - (s?.clicks ?? 0)) + PRIOR_PSEUDO * (1 - mean);
    const sample = sampleBeta(alpha, beta, rng);
    ctrMul.set(String(p.id), Math.min(Math.max(sample / mean, 0.3), 3));
  }
  const ctr = (p: P) => ctrMul.get(String(p.id)) ?? 1;

  // 個人分：系列偏好（新品 7 天保底到中位數）+ 關注
  const pref = signals.seriesPref;
  const scored = Array.from(pref.values()).filter(v => v > 0).sort((x, y) => x - y);
  const newcomerFloor = scored.length ? scored[Math.floor(scored.length / 2)] : 0;
  const ageOf = (p: P) => (p.created_at ? now - new Date(p.created_at).getTime() : Infinity);
  const personal = (p: P) => {
    const base = pref.get(p.series || '') || 0;
    const boosted = ageOf(p) <= NEW_WINDOW_MS ? Math.max(base, newcomerFloor) : base;
    return boosted + (signals.follows.has(Number(p.id)) ? 2 * Math.max(newcomerFloor, 1) : 0);
  };
  const heat = (p: P) => signals.heat.get(Number(p.id)) || 0;
  const topicScore = (p: P) => {
    if (!signals.topics.length) return 0;
    const hay = `${p.name ?? ''} ${p.series ?? ''} ${(p.tags ?? []).join(' ')}`.toLowerCase();
    let s = 0;
    for (const t of signals.topics) if (t.keyword && hay.includes(t.keyword.toLowerCase())) s += t.weight;
    return s;
  };
  const isFresh = (p: P) => {
    if (ageOf(p) <= NEW_WINDOW_MS) return true;
    const total = Number(p.total_count ?? 0), rem = Number(p.remaining ?? 0);
    return total > 0 && rem > 0 && rem / total < URGENT_RATIO;
  };

  const buckets: Record<FeedBucket, { filter: (p: P) => boolean; weight: (p: P) => number }> = {
    forYou: { filter: p => !signals.isGuest && personal(p) > 0, weight: p => personal(p) * ctr(p) * seenMul(p) },
    topic: { filter: p => topicScore(p) > 0, weight: p => topicScore(p) * ctr(p) * seenMul(p) },
    hot: { filter: () => true, weight: p => (heat(p) + 1) * ctr(p) * seenMul(p) },
    fresh: { filter: p => isFresh(p), weight: p => (heat(p) + 1) * ctr(p) * seenMul(p) },
    explore: { filter: () => true, weight: p => seenMul(p) },
  };
  const FALLBACK: FeedBucket[] = ['hot', 'explore'];
  const slots = signals.isGuest ? SLOTS_GUEST : SLOTS_USER;

  const remaining = new Set<P>(products);
  const out: FeedItem<P>[] = [];
  const lastFirst = new Set(seenRounds[0] ?? []);
  let repeats = 0;

  const violatesDiversity = (p: P) => {
    if (out.length >= 12) return false;
    const last2 = out.slice(-2).map(i => i.product);
    if (p.series && last2.length === 2 && last2.every(q => q.series === p.series)) return true;
    const last3 = out.slice(-3).map(i => i.product);
    if (p.type && last3.length === 3 && last3.every(q => q.type === p.type)) return true;
    return false;
  };

  let slot = 0;
  while (remaining.size > 0) {
    const want = slots[slot % SCREEN];
    slot++;
    const order: FeedBucket[] = [want, ...FALLBACK.filter(b => b !== want)];
    let picked: P | null = null;
    let bucketUsed: FeedBucket = want;
    for (const b of order) {
      let pool = Array.from(remaining).filter(buckets[b].filter);
      // 首屏：跟上一輪重複的最多 2 件
      if (out.length < SCREEN && repeats >= MAX_REPEAT_FIRST_SCREEN) {
        const unseen = pool.filter(p => !lastFirst.has(String(p.id)));
        if (unseen.length) pool = unseen;
      }
      if (!pool.length) continue;
      // 多樣性：最多試 6 次避開連續同系列／同類型，避不開就接受
      let cand: P | null = null;
      for (let tries = 0; tries < 6; tries++) {
        const c = weightedPick(pool, buckets[b].weight, rng);
        if (!c) break;
        cand = c;
        if (!violatesDiversity(c)) break;
      }
      if (cand) { picked = cand; bucketUsed = b; break; }
    }
    if (!picked) { // 理論上到不了（explore 收所有商品），保險
      picked = remaining.values().next().value as P;
      bucketUsed = 'explore';
    }
    remaining.delete(picked);
    if (out.length < SCREEN && lastFirst.has(String(picked.id))) repeats++;
    out.push({ product: picked, bucket: bucketUsed, position: out.length });
  }
  return out;
}
