'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { native } from '@/lib/native/bridge';
import { closeInAppBrowser, openPayment } from '@/lib/native/browser';

/**
 * 社群登入
 *
 * LINE：走 LINE Login 的 OAuth 授權碼流程，依環境分兩條路 ——
 *
 * **一般瀏覽器**：整頁導去 LINE 授權（會跳 LINE app 一鍵允許），
 * 回程落在同一個瀏覽器，/auth/line/callback 當場完成登入。
 *
 * **原生 App（Capacitor）**：授權頁開在 **in-app browser**（SFSafariViewController）。
 * 曾改成系統 Safari（那邊會自動觸發 Universal Link 開 LINE App），但整個人被
 * 丟出 App 的體感太差（老闆 2026-08-20：「怎麼又跑去 safari 了」）——
 * 改回內彈窗的代價是：SFSafariViewController 不會**自動**開 LINE App，
 * 裝了 LINE 的玩家要在頁面上多按一下「使用LINE應用程式登入」（使用者手勢的
 * Universal Link 是通的）；沒裝 LINE 的玩家直接在內彈窗輸入帳密，不會離開 App。
 * 真正的零跳轉要等原生 LINE SDK（見 DEVLOG v2026.08.20l 的限制表）。
 *
 * 回程落在 Safari（LINE App 授權完把 https 回呼交給系統瀏覽器開），所以：
 *   1. state 加 `app.` 前綴，讓回呼頁知道這趟是從 App 出發的
 *   2. 回呼頁存完票之後導向 `ggbapp://`（Info.plist 註冊的自訂 scheme），
 *      iOS 就會把玩家帶回吉吉比
 *   3. 回到前景時 visibilitychange 觸發取票，登入完成
 * iOS 會先問一句「要打開吉吉比嗎」，所以是一鍵跳回而非零操作；
 * 要完全免確認得用 Universal Links，那需要付費開發者帳號的 Associated Domains。
 *
 * **偽 app（加入主畫面的 PWA）**：iOS 不讓任何 app 把網址開回偽 app，
 * 跳出去就回不來。所以主視窗不離開 —— 用 window.open 開覆蓋視窗去授權
 * （照樣跳 LINE app 一鍵允許），回程無論落在哪裡，callback 都會把
 * 登入票存進資料庫；這裡每 2 秒輪詢取票，票一到就在偽 app 自己的
 * 情境裡完成登入。玩家唯一要做的是切回來。
 * 門市選擇（cvs-pending）已用同一招，實測可行。
 *
 * Google：按鈕先上（老闆要看介面感覺），點了顯示「即將開放」——
 * 串接卡在公司統編（開 Google Workspace 要統編），下來就接。
 */

const LINE_CHANNEL_ID = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID;

/** 輪詢多久放棄（毫秒）。LINE 授權一般十幾秒內結束，3 分鐘算很寬 */
const POLL_TIMEOUT_MS = 3 * 60_000;
const POLL_INTERVAL_MS = 2_000;

function authorizeUrl(state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_CHANNEL_ID ?? '',
    redirect_uri: `${window.location.origin}/auth/line/callback`,
    state,
    // openid 才拿得到 id_token；profile 讓 id_token 帶暱稱與頭像
    scope: 'profile openid',
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params}`;
}

export function SocialLoginButtons() {
  const router = useRouter();
  const { showToast } = useToast();
  const [waiting, setWaiting] = useState(false);
  const stateRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef(0);
  // window.open 的回傳值。授權跳去 LINE app 之後這個覆蓋視窗會停在
  // 空白頁，登入完成時主動把它關掉，玩家就不用自己按叉叉
  const popupRef = useRef<Window | null>(null);

  const stopPolling = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stateRef.current = null;
    setWaiting(false);
  };

  useEffect(() => stopPolling, []);

  // 切回偽 app 的瞬間立刻問一次，不用等下一個 2 秒
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && stateRef.current) void claimTicket();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claimTicket = async () => {
    const state = stateRef.current;
    if (!state) return;
    if (Date.now() > deadlineRef.current) { stopPolling(); return; }
    try {
      const res = await fetch('/api/auth/line/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      const json = await res.json();
      if (!json.found) return;

      stopPolling();
      // 先收掉殘留的授權視窗（iOS 上它會停在空白頁）。close 不一定被
      // 系統允許，失敗就算了，玩家還是可以自己關
      try { popupRef.current?.close(); } catch { /* 由系統決定 */ }
      popupRef.current = null;
      // 原生 App：授權頁開在 in-app browser，主動收掉玩家才會自動回到 App
      void closeInAppBrowser();
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: json.tokenHash, type: 'email' });
      if (!error) {
        // 從邀請連結（?invite=）進來的，登入完自動幫他填。
        // 失敗不擋流程 —— 老帳號或已填過會被後端規則擋，屬正常
        const pending = localStorage.getItem('pending_invite');
        if (pending) {
          localStorage.removeItem('pending_invite');
          void fetch('/api/user/claim-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: pending }),
          }).catch(() => {});
        }
        // 登入完成直接帶去會員中心 —— 玩家切回來就該看到「已登入的自己」，
        // 首頁看不出登入前後的差別
        router.replace('/profile');
      }
    } catch { /* 授權期間網路切換是常態，下一輪再問 */ }
  };

  const startLineLogin = () => {
    const isNativeApp = native.isNativePlatform();
    // app. 前綴：回呼頁靠它判斷要不要導回 ggbapp://（見檔頭說明）
    const state = `${isNativeApp ? 'app.' : ''}${crypto.randomUUID()}`;

    const standalone =
      isNativeApp ||
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    if (!standalone) {
      // 同瀏覽器回程要比對的 state。存 localStorage 而非 sessionStorage ——
      // LINE app 送人回來常開新分頁，sessionStorage 每個分頁一份會找不到
      localStorage.setItem('line_login_state', state);
      window.location.href = authorizeUrl(state);
      return;
    }

    // 偽 app／原生 App：主視窗留在這裡輪詢，授權開在另一個視窗
    stateRef.current = state;
    deadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
    setWaiting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => void claimTicket(), POLL_INTERVAL_MS);

    if (isNativeApp) {
      /*
       * 原生 App：開 in-app browser（全螢幕 SFSafariViewController）。
       * openPayment 的「關閉時回呼」正好拿來收尾 —— 玩家自己把授權視窗關掉
       * 就停止等待；登入成功那條路是 claimTicket 主動 closeInAppBrowser，
       * stopPolling 早跑過了，這裡再跑一次無害。
       */
      void openPayment(authorizeUrl(state), () => stopPolling()).then((opened) => {
        // 外掛不在（不該發生）就退回系統瀏覽器，至少流程走得完
        if (!opened) popupRef.current = window.open(authorizeUrl(state), '_blank');
      });
      return;
    }

    // 偽 app：window.open 開覆蓋視窗去授權，主視窗留在這裡輪詢
    popupRef.current = window.open(authorizeUrl(state), '_blank');
  };

  if (!LINE_CHANNEL_ID) return null;

  /*
   * 「等待授權中…」那塊只給偽 app 看 —— 它的授權開在另一個視窗，玩家要自己
   * 切回來，需要文字說明。原生 App 的授權視窗直接蓋在整個畫面上，這塊字
   * 沒人看得到，登入頁保持原樣即可（老闆 2026-08-20：「不要再多一堆廢話字」）。
   */
  if (waiting && !native.isNativePlatform()) {
    return (
      <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-[#06C755]" />
          等待 LINE 授權中…
        </div>
        <p className="text-xs text-neutral-400">在 LINE 完成授權後切回來，就會自動登入</p>
        <button type="button" onClick={stopPolling} className="text-xs text-neutral-400 underline">
          取消
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <button
        type="button"
        onClick={startLineLogin}
        className="relative h-12 w-full rounded-xl border border-neutral-200 bg-white text-[15px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
      >
        <span className="absolute left-4 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center">
          <Image src="/images/line.png" alt="" width={22} height={22} unoptimized />
        </span>
        使用 LINE 帳號登入
      </button>
      <button
        type="button"
        onClick={() => showToast('Google 登入即將開放', 'info')}
        className="relative h-12 w-full rounded-xl border border-neutral-200 bg-white text-[15px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
      >
        <span className="absolute left-4 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center">
          <Image src="/images/google.png" alt="" width={20} height={20} unoptimized />
        </span>
        使用 Google 帳號登入
      </button>
    </div>
  );
}
