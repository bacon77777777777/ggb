'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';

/**
 * 社群登入
 *
 * LINE：走 LINE Login 的 OAuth 授權碼流程，依環境分兩條路 ——
 *
 * **一般瀏覽器**：整頁導去 LINE 授權（會跳 LINE app 一鍵允許），
 * 回程落在同一個瀏覽器，/auth/line/callback 當場完成登入。
 *
 * **偽 app（加入主畫面的 PWA）**：iOS 不讓任何 app 把網址開回偽 app，
 * 跳出去就回不來。所以主視窗不離開 —— 用 window.open 開覆蓋視窗去授權
 * （照樣跳 LINE app 一鍵允許），回程無論落在哪裡，callback 都會把
 * 登入票存進資料庫；這裡每 2 秒輪詢取票，票一到就在偽 app 自己的
 * 情境裡完成登入。玩家唯一要做的是切回來。
 * 門市選擇（cvs-pending）已用同一招，實測可行。
 *
 * Google 暫時不顯示：開 Google OAuth 需要 Google Workspace，而那需要
 * 公司統編 —— 登記還沒下來。之前這顆按鈕掛在畫面上但按了沒反應，
 * 比沒有更糟。統編下來接好後再打開。
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
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: json.tokenHash, type: 'email' });
      // 登入完成直接帶去會員中心 —— 玩家切回來就該看到「已登入的自己」，
      // 首頁看不出登入前後的差別
      if (!error) router.replace('/profile');
    } catch { /* 授權期間網路切換是常態，下一輪再問 */ }
  };

  const startLineLogin = () => {
    const state = crypto.randomUUID();

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    if (!standalone) {
      // 同瀏覽器回程要比對的 state。存 localStorage 而非 sessionStorage ——
      // LINE app 送人回來常開新分頁，sessionStorage 每個分頁一份會找不到
      localStorage.setItem('line_login_state', state);
      window.location.href = authorizeUrl(state);
      return;
    }

    // 偽 app：主視窗留在這裡輪詢，授權開在覆蓋視窗
    stateRef.current = state;
    deadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
    setWaiting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => void claimTicket(), POLL_INTERVAL_MS);
    popupRef.current = window.open(authorizeUrl(state), '_blank');
  };

  if (!LINE_CHANNEL_ID) return null;

  if (waiting) {
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
      <Button
        type="button"
        variant="outline"
        className="w-full relative h-10 border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-medium text-sm rounded-lg"
        onClick={startLineLogin}
      >
        <div className="absolute left-4 w-5 h-5 flex items-center justify-center">
          <Image src="/images/line.png" alt="LINE" width={20} height={20} unoptimized />
        </div>
        使用 LINE 帳號登入
      </Button>
    </div>
  );
}
