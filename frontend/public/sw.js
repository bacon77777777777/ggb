/* 吉吉比 PWA service worker
 *
 * 目的有二：
 *   1. 讓網站符合「可安裝的 PWA」，Android TWA（Bubblewrap）才打得起來
 *   2. 斷線時給一個像樣的畫面，而不是瀏覽器的恐龍頁
 *
 * 刻意保守：
 *   - 只碰 GET、只碰同源
 *   - /api/ 與 Supabase 一律不快取（會員資料、代幣餘額、抽獎結果都不能是舊的）
 *   - 頁面走 network-first，離線才回快取；靜態資源（/_next/static 有 hash）才 cache-first
 *   這樣「改版後看到舊頁面」不會發生 —— 有網路時永遠拿線上的。
 */

const VERSION = 'ggb-v2';
const PAGE_CACHE = `${VERSION}-pages`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// 前台推新版時可以叫 SW 立刻換手，不用等使用者關掉所有分頁
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/*
 * 帶內容版本（?v=<hash>）的靜態資源：lib/asset.ts 產的網址，檔案一改 hash 就變，
 * 所以可以放心 cache-first，永遠不會拿到舊圖。
 * ⚠️ 沒帶 ?v= 的 /images、/loading、/icons **不再** cache-first（v1 對 /icons、/loading
 * 是整個目錄 cache-first，檔案換了 SW 會一直回舊的 —— 老闆 2026-08-22 不要舊圖）。
 */
const VERSIONED_PREFIX = /^\/(?:images|loading|icons|audio|videos)\//;
const isVersionedAsset = (url) => url.searchParams.has('v') && VERSIONED_PREFIX.test(url.pathname);
const isImmutableAsset = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  /\.(?:woff2?|ttf|otf)$/.test(url.pathname) ||
  isVersionedAsset(url);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // R2／Supabase 圖片交給瀏覽器自己的快取
  if (url.pathname.startsWith('/api/')) return;          // 動態資料一律不碰
  if (url.pathname === '/sw.js') return;

  // 頁面：network-first，離線才退快取／離線頁
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL)))
    );
    return;
  }

  // 帶 hash 的靜態資源：cache-first
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (!res.ok) return res;
            const copy = res.clone();
            caches.open(ASSET_CACHE).then(async (c) => {
              // 同一個路徑的舊版本（不同 ?v=）一律清掉：快取不會無限長，也絕不會留舊圖
              if (isVersionedAsset(url)) {
                const keys = await c.keys();
                for (const k of keys) {
                  const ku = new URL(k.url);
                  if (ku.pathname === url.pathname && ku.search !== url.search) await c.delete(k);
                }
              }
              await c.put(request, copy);
            });
            return res;
          })
      )
    );
  }
});
