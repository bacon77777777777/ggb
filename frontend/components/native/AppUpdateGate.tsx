'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { native } from '@/lib/native/bridge';

/**
 * App 更新提示 —— 兩種，用途完全不同，所以是兩種彈窗。
 *
 * ┌ A 網頁版更新（可關）
 * │   `frontend/` 推上線就生效。殼是 remote URL 模式，webview 重載就是新版，
 * │   **不必送審、不必上架**。這是 99% 的情況。
 * │   判斷：bundle 裡的 NEXT_PUBLIC_BUILD_ID ≠ /api/app-version 回的 build。
 * └ B 原生殼更新（不給關）
 *     改了 `mobile/`（外掛、原生程式碼、Capacitor 版本）才會發生，網頁再新也沒用，
 *     只能去商店下載。判斷：原生殼回報的版本 < 後台設的 min_native_version。
 *
 * ⚠️ 兩種**不可以共用同一顆彈窗**：A 是順手更新、可以稍後；B 是不更新就不能用。
 * 混在一起玩家分不出哪個是必須的，於是兩個都會按「稍後」。
 *
 * ── 為什麼只在 App 裡跑 ──
 * 一般瀏覽器重新整理就是新版，跳彈窗只是打擾。App 的 webview 沒有網址列也沒有
 * 重新整理鍵，玩家自己沒辦法更新，才需要我們提醒。
 *
 * ── 為什麼在「回前景」才檢查 ──
 * 玩家正在抽獎抽到一半跳更新是最惹人厭的做法。回前景是天然的段落。
 */

/** 檢查間隔下限：回前景很頻繁（切出去回 LINE 再回來也算），不必每次都打 API */
const MIN_INTERVAL_MS = 5 * 60 * 1000;

type VersionInfo = {
  build: string;
  webCheck: boolean;
  minNative: string;
  storeIos: string;
  storeAndroid: string;
};

/** '1.0.2' → [1,0,2]。看不懂的回 null —— 比不出來就當作沒問題，不要擋人 */
function parseVersion(v: string): number[] | null {
  const t = (v ?? '').trim();
  if (!/^\d+(\.\d+){0,3}$/.test(t)) return null;
  return t.split('.').map(Number);
}

/** a < b 嗎 */
function isOlder(a: number[], b: number[]): boolean {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

export default function AppUpdateGate() {
  const [webUpdate, setWebUpdate] = useState(false);
  const [forced, setForced] = useState<{ url: string } | null>(null);
  const lastCheck = useRef(0);
  /*
   * 玩家按過「稍後再說」的那個版本記在這裡，同一次啟動不再問第二次。
   * 用 ref 不用 sessionStorage：App 重開就該重新問，而 webview 的 session
   * 生命週期跟 App 啟動一致，多存一份反而要處理清除時機。
   */
  const dismissed = useRef<string | null>(null);

  const check = useCallback(async () => {
    const now = Date.now();
    if (now - lastCheck.current < MIN_INTERVAL_MS) return;
    lastCheck.current = now;

    let info: VersionInfo;
    try {
      const res = await fetch('/api/app-version', { cache: 'no-store' });
      if (!res.ok) return;
      info = await res.json();
    } catch {
      // 沒網路就算了，下次回前景再問
      return;
    }

    /* ── B 原生殼：先判，因為它是硬性的 ── */
    const min = parseVersion(info.minNative);
    if (min) {
      const appInfo = await native.call<{ version?: string }>('App', 'getInfo');
      const current = parseVersion(appInfo?.version ?? '');
      // 拿不到版本就不擋 —— 寧可放行，也不要把人鎖在打不開的 App 裡
      if (current && isOlder(current, min)) {
        const url = native.nativePlatform() === 'android' ? info.storeAndroid : info.storeIos;
        // 後台已經擋過「設門檻但沒填網址」，這裡是最後一道保險
        if (url) { setForced({ url }); return; }
      }
    }

    /* ── A 網頁版：build id 不同就是推過版了 ── */
    if (!info.webCheck) return;
    const mine = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
    // 'dev' 代表本機或非 Vercel 建置，兩邊都會是 dev，不會誤跳
    if (info.build && info.build !== mine && dismissed.current !== info.build) {
      setWebUpdate(true);
    }
  }, []);

  useEffect(() => {
    if (!native.isNativePlatform()) return;

    // 開站先等一下再問：啟動當下網路與外掛都還沒就緒，而且剛載入的一定是最新的
    const first = setTimeout(() => { lastCheck.current = 0; void check(); }, 8000);

    const plugin = native.plugin('App');
    let handle: { remove?: () => void } | undefined;
    if (plugin && typeof plugin.addListener === 'function') {
      try {
        const add = plugin.addListener as unknown as (
          event: string,
          cb: (e: { isActive?: boolean }) => void,
        ) => { remove?: () => void };
        handle = add('appStateChange', ({ isActive }) => { if (isActive) void check(); });
      } catch (err) {
        console.warn('[update] appStateChange 掛載失敗', err);
      }
    }

    return () => { clearTimeout(first); handle?.remove?.(); };
  }, [check]);

  const reload = () => {
    setWebUpdate(false);
    window.location.reload();
  };

  const openStore = () => {
    if (!forced) return;
    /*
     * 用 in-app browser 而不是直接導航：webview 導去 App Store 網址會停在
     * 一個打不開 App Store 的網頁。Browser 外掛會交給系統開商店 App。
     * 外掛不在就退回一般導航，總比按了沒反應好。
     */
    void native.call('Browser', 'open', { url: forced.url }).then(ok => {
      if (ok === null) window.location.href = forced.url;
    });
  };

  return (
    <>
      {/* A：可關，稍後再說就這次啟動不再問 */}
      <Modal
        isOpen={webUpdate && !forced}
        onClose={() => setWebUpdate(false)}
        compact
        hideClose
        title="有新版本"
      >
        <div className="px-5 pb-5 pt-1 text-center">
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            吉吉比更新了，重新載入就能用新版本，只要幾秒。
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                // 記住這個版本，這次啟動不再問
                fetch('/api/app-version', { cache: 'no-store' })
                  .then(r => r.json())
                  .then((v: VersionInfo) => { dismissed.current = v.build; })
                  .catch(() => {});
                setWebUpdate(false);
              }}
            >
              稍後再說
            </Button>
            <Button className="flex-1" onClick={reload}>立即更新</Button>
          </div>
        </div>
      </Modal>

      {/* B：不給關 —— 原生層不相容時，關掉也沒有能用的畫面 */}
      <Modal isOpen={Boolean(forced)} onClose={() => {}} compact hideClose title="請更新 App">
        <div className="px-5 pb-5 pt-1 text-center">
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            這個版本已經不支援了，請到商店下載最新版本才能繼續使用。
          </p>
          <Button className="mt-5 w-full" onClick={openStore}>前往更新</Button>
        </div>
      </Modal>
    </>
  );
}
