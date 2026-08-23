/**
 * 首頁「綜合 → 推薦」的 feed 組裝（老闆 2026-08-22：要像 IG／短影音，刷新每次不一樣、
 * 所有商品都有機會、照個人習慣與話題）。純函數，不碰 DOM。
 *
 * 不是一條排序公式，是「分桶配額＋加權抽籤」：每 6 格一個畫面，每格從不同的桶抽 ——
 *   登入：forYou ×2（個人系列偏好／關注／這一趟的意圖／看了 A 推同系列 B）、topic（話題）、
 *         hot（熱賣）、fresh（新上架／快完售）、explore（純隨機）
 *   訪客：hot、forYou（有 session 意圖或 item-to-item 才有）、topic、hot、fresh、explore
 * 抽到的不放回；桶空了讓給 hot → explore。
 *
 * 每個候選的權重 = 桶內基礎分 × Thompson 抽樣係數 × 看過懲罰 × 後台加權：
 *   - Thompson：用近 14 天曝光／點擊的 Beta 後驗抽一個點擊率，除以全站平均 → 點擊率高的自動多推、
 *     沒資料的靠先驗自然探索。**階層式先驗**：新商品的先驗用同系列 → 同類型 → 全站的平均點擊率
 *     （冷啟動優化）；**歷史暖身**：每一筆真人抽獎當作「1 次點擊／20 次曝光」的證據（上限 10 筆），
 *     有實績的商品一開始就不是白紙。
 *   - 看過懲罰：上一輪首屏 ×0.15、上上輪 ×0.5、第三輪 ×0.8（lib/feed/memory.ts）。
 *   - 後台加權：products.feed_boost 0~3 → ×1／1.5／2／3；沒設時 is_hot 算 ×1.5。資料長出來後被
 *     Thompson 係數自然稀釋（係數上限 ×3、下限 ×0.3）。
 *   - Session 意圖（lib/feed/session.ts）：這一趟點過／看過的系列 ×2、類型 ×1.5，馬上生效。
 * 硬規則：首屏最多 2 件跟上一輪首屏重複；首 12 件同系列不連 3、同類型不連 4。
 * 售完／結束沉底由呼叫端處理（首頁本來就有那段），這裡只管順序與桶別。
 */
import type { SessionIntent } from './session';

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
  price?: number | null;
  is_hot?: boolean | null;
  feed_boost?: number | null;
}

export interface FeedCtrItem { impressions: number; clicks: number; series?: string | null; type?: string | null; draws?: number }

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
  ctr: { mean: number; items: Map<number, FeedCtrItem> };
  /** 這一趟的意圖（lib/feed/session.ts）；可省略 */
  session?: SessionIntent;
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
const SLOTS_GUEST: FeedBucket[] = ['hot', 'forYou', 'topic', 'hot', 'fresh', 'explore'];
const SEEN_PENALTY = [0.15, 0.5, 0.8];
const MAX_REPEAT_FIRST_SCREEN = 2;
const NEW_WINDOW_MS = 7 * 24 * 3600 * 1000;
const URGENT_RATIO = 0.2;
/** 先驗假樣本數（越小學越快；流量小的時候 10 比 20 有感） */
const PRIOR_PSEUDO = 10;
/** 歷史暖身：每筆真人抽獎當 1 次點擊／20 次曝光，最多算 10 筆 */
const WARM_DRAWS_CAP = 10;
const WARM_IMP_PER_DRAW = 20;
const BOOST_MUL = [1, 1.5, 2, 3];

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

/** 同系列／同類型的平均點擊率（階層式先驗用） */
function groupMeans(items: Map<number, FeedCtrItem>) {
  const bySeries = new Map<string, { i: number; c: number }>();
  const byType = new Map<string, { i: number; c: number }>();
  for (const it of items.values()) {
    if (it.series) { const g = bySeries.get(it.series) ?? { i: 0, c: 0 }; g.i += it.impressions; g.c += it.clicks; bySeries.set(it.series, g); }
    if (it.type) { const g = byType.get(it.type) ?? { i: 0, c: 0 }; g.i += it.impressions; g.c += it.clicks; byType.set(it.type, g); }
  }
  // 至少 50 次曝光才算得準
  const pick = (g?: { i: number; c: number }) => (g && g.i >= 50 ? g.c / g.i : null);
  return { series: (s?: string | null) => pick(s ? bySeries.get(s) : undefined), type: (t?: string | null) => pick(t ? byType.get(t) : undefined) };
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
  const globalMean = Math.min(Math.max(signals.ctr.mean || 0.03, 0.005), 0.5);
  const means = groupMeans(signals.ctr.items);
  const ctrMul = new Map<string, number>();
  for (const p of products) {
    const s = signals.ctr.items.get(Number(p.id));
    const prior = means.series(p.series) ?? means.type(p.type) ?? globalMean;
    const warmDraws = Math.min(s?.draws ?? 0, WARM_DRAWS_CAP);
    const alpha = (s?.clicks ?? 0) + warmDraws + PRIOR_PSEUDO * prior;
    const beta = ((s?.impressions ?? 0) - (s?.clicks ?? 0)) + warmDraws * (WARM_IMP_PER_DRAW - 1) + PRIOR_PSEUDO * (1 - prior);
    const sample = sampleBeta(alpha, beta, rng);
    ctrMul.set(String(p.id), Math.min(Math.max(sample / globalMean, 0.3), 3));
  }
  const ctr = (p: P) => ctrMul.get(String(p.id)) ?? 1;
  const boost = (p: P) => {
    const b = Number(p.feed_boost ?? 0);
    if (b > 0) return BOOST_MUL[Math.min(b, 3)];
    return p.is_hot ? 1.5 : 1;
  };

  // 個人分：系列偏好（新品 7 天保底到中位數）+ 關注 + session 意圖
  const pref = signals.seriesPref;
  const scored = Array.from(pref.values()).filter(v => v > 0).sort((x, y) => x - y);
  const newcomerFloor = scored.length ? scored[Math.floor(scored.length / 2)] : 0;
  const unit = Math.max(newcomerFloor, 1);
  const ageOf = (p: P) => (p.created_at ? now - new Date(p.created_at).getTime() : Infinity);
  const sess = signals.session;
  const sessionMul = (p: P) => {
    if (!sess) return 1;
    const sSeries = p.series ? sess.series.get(p.series) ?? 0 : 0;
    const sType = p.type ? sess.types.get(p.type) ?? 0 : 0;
    return (sSeries > 0 ? 2 : 1) * (sType > 0 ? 1.5 : 1);
  };
  /** item-to-item：看了 A 推同系列／同類型／同價位帶的 B（不需要任何歷史資料） */
  const similarity = (p: P) => {
    if (!sess || !sess.recent.length) return 0;
    let s = 0;
    for (const r of sess.recent) {
      if (r.id === Number(p.id)) continue;
      if (r.series && p.series && r.series === p.series) s += 3;
      if (r.type && p.type && r.type === p.type) s += 1;
      if (r.price && p.price && Math.abs(Number(p.price) - r.price) / r.price <= 0.3) s += 0.5;
    }
    return s;
  };
  const personal = (p: P) => {
    const base = pref.get(p.series || '') || 0;
    const boosted = ageOf(p) <= NEW_WINDOW_MS ? Math.max(base, newcomerFloor) : base;
    const follow = signals.follows.has(Number(p.id)) ? 2 * unit : 0;
    const sim = similarity(p) * unit;
    return (boosted + follow + sim) * sessionMul(p);
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

  const common = (p: P) => ctr(p) * seenMul(p) * boost(p);
  const buckets: Record<FeedBucket, { filter: (p: P) => boolean; weight: (p: P) => number }> = {
    forYou: { filter: p => personal(p) > 0, weight: p => personal(p) * common(p) },
    topic: { filter: p => topicScore(p) > 0, weight: p => topicScore(p) * common(p) * sessionMul(p) },
    hot: { filter: () => true, weight: p => (heat(p) + 1) * common(p) * sessionMul(p) },
    fresh: { filter: p => isFresh(p), weight: p => (heat(p) + 1) * common(p) * sessionMul(p) },
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
      if (out.length < SCREEN && repeats >= MAX_REPEAT_FIRST_SCREEN) {
        const unseen = pool.filter(p => !lastFirst.has(String(p.id)));
        if (unseen.length) pool = unseen;
      }
      if (!pool.length) continue;
      let cand: P | null = null;
      for (let tries = 0; tries < 6; tries++) {
        const c = weightedPick(pool, buckets[b].weight, rng);
        if (!c) break;
        cand = c;
        if (!violatesDiversity(c)) break;
      }
      if (cand) { picked = cand; bucketUsed = b; break; }
    }
    if (!picked) {
      picked = remaining.values().next().value as P;
      bucketUsed = 'explore';
    }
    remaining.delete(picked);
    if (out.length < SCREEN && lastFirst.has(String(picked.id))) repeats++;
    out.push({ product: picked, bucket: bucketUsed, position: out.length });
  }
  return out;
}
