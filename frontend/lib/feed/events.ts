/**
 * 推薦 feed 的曝光／點擊埋點（階段二的學習資料）。
 *
 * 曝光：ProductCard 進入視口（≥50%）記一筆，同一個 session 同一張卡只記一次；
 * 先排進佇列，每 2 秒或頁面離開（sendBeacon）時批次送到 /api/feed/events。
 * 點擊：立刻送（也走 sendBeacon，換頁不會掉）。
 * 變體（v1 舊排序／v2 新 feed）由 lib/feed/variant.ts 決定、一個 session 固定。
 */
import type { FeedBucket } from './assemble';

interface Ev { kind: 'impression' | 'click'; product_id: number; bucket?: FeedBucket; position?: number }

const ENDPOINT = '/api/feed/events';
const FLUSH_MS = 2000;
const MAX_BATCH = 60;
const queue: Ev[] = [];
let timer: number | null = null;
const seen = new Set<string>();
let bound = false;

function sessionId(): string {
  try {
    let s = sessionStorage.getItem('_ggb_sid');
    if (!s) { s = crypto.randomUUID(); sessionStorage.setItem('_ggb_sid', s); }
    return s;
  } catch { return 'anon'; }
}

function send(events: Ev[], beacon: boolean) {
  if (!events.length) return;
  const body = JSON.stringify({ session_id: sessionId(), variant: currentVariant(), events });
  if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    // text/plain 是 CORS 安全型別：application/json 的 Blob 在部分瀏覽器會被 sendBeacon 靜默丟掉
    // （2026-08-22 實測點擊沒落庫）。API 端用 req.json() 解，不看 content-type。
    if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
  }
  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

function flush(beacon = false) {
  if (timer) { window.clearTimeout(timer); timer = null; }
  const batch = queue.splice(0, MAX_BATCH);
  send(batch, beacon);
  if (queue.length) schedule();
}

function schedule() {
  if (timer) return;
  timer = window.setTimeout(() => flush(false), FLUSH_MS);
}

function bind() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  window.addEventListener('pagehide', () => flush(true));
}

let variantCache: 'v1' | 'v2' | null = null;
export function setVariant(v: 'v1' | 'v2') { variantCache = v; }
export function currentVariant(): 'v1' | 'v2' { return variantCache ?? 'v2'; }

export function recordImpression(productId: number, bucket?: FeedBucket, position?: number) {
  if (typeof window === 'undefined') return;
  const key = `${sessionId()}:${productId}`;
  if (seen.has(key)) return;
  seen.add(key);
  bind();
  queue.push({ kind: 'impression', product_id: productId, bucket, position });
  if (queue.length >= MAX_BATCH) flush(false); else schedule();
}

export function recordClick(productId: number, bucket?: FeedBucket, position?: number) {
  if (typeof window === 'undefined') return;
  bind();
  // 點擊前把還沒送的曝光一起帶走，順序才對
  queue.push({ kind: 'click', product_id: productId, bucket, position });
  flush(true);
}
