'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useSettingsStatus } from '@/components/auth/useSettingsStatus';

/**
 * 會員中心「LINE 帳號」那一列 —— 綁定既有帳號的入口
 *
 * 玩家用 Email 註冊過、後來按 LINE 登入會開出全新的空帳號，
 * G 幣和倉庫看起來像不見了。解法：登入原帳號 → 在這裡把 LINE 綁上去，
 * 之後 LINE 登入直接進原帳號。
 *
 * 綁定跟登入共用同一套 OAuth 與回程（/auth/line/callback）：
 * - 一般瀏覽器：整頁導去授權，回來時 session 就在 cookie 裡，當場綁
 * - 偽 app：主視窗留在這裡輪詢，授權開在覆蓋視窗；回程落在 Safari
 *   只存「這個 LINE 是誰」的票，實際綁定發生在這裡帶著 session 取票的
 *   那一刻（跟 LINE 登入同一套取票機制）
 *
 * 狀態來自 useSettingsStatus（含 localStorage 快取），第二次進頁零等待。
 */

const LINE_CHANNEL_ID = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID;
const POLL_TIMEOUT_MS = 3 * 60_000;
const POLL_INTERVAL_MS = 2_000;

function authorizeUrl(state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_CHANNEL_ID ?? '',
    redirect_uri: `${window.location.origin}/auth/line/callback`,
    state,
    scope: 'profile openid',
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params}`;
}

export function LineBindRow() {
  const { showToast } = useToast();
  const { data, refresh } = useSettingsStatus();
  const status = data?.line ?? null;
  const [waiting, setWaiting] = useState(false);
  const stateRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef(0);
  const popupRef = useRef<Window | null>(null);

  const stopPolling = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stateRef.current = null;
    setWaiting(false);
  };

  useEffect(() => stopPolling, []);

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
      try { popupRef.current?.close(); } catch { /* 由系統決定 */ }
      popupRef.current = null;

      if (json.bound) {
        showToast('LINE 綁定成功', 'success');
        void refresh();
      } else {
        showToast(json.error || '綁定失敗，請重試一次', 'error');
      }
    } catch { /* 授權期間網路切換是常態，下一輪再問 */ }
  };

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && stateRef.current) void claimTicket();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startBind = () => {
    // bind. 前綴讓跨情境的回程頁認得這是綁定不是登入 ——
    // Safari 那頭只有 state 可看，意圖必須寫在裡面
    const state = `bind.${crypto.randomUUID()}`;

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    if (!standalone) {
      localStorage.setItem('line_login_state', state);
      localStorage.setItem('line_login_intent', 'bind');
      window.location.href = authorizeUrl(state);
      return;
    }

    stateRef.current = state;
    deadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
    setWaiting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => void claimTicket(), POLL_INTERVAL_MS);
    popupRef.current = window.open(authorizeUrl(state), '_blank');
  };

  const unbind = async () => {
    try {
      const res = await fetch('/api/auth/line/bind', { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || '解除失敗，請重試一次', 'error'); return; }
      showToast('已解除 LINE 綁定', 'success');
      void refresh();
    } catch {
      showToast('解除失敗，請重試一次', 'error');
    }
  };

  if (!LINE_CHANNEL_ID) return null;

  return (
    <div
      className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
      onClick={() => { if (!waiting && status && !status.bound) startBind(); }}
    >
      <label className="text-[15px] text-neutral-800 dark:text-neutral-200">LINE 帳號</label>
      <div className="flex items-center gap-2">
        {status === null ? (
          // 沒有快取的第一次載入：骨架，不要「…」
          <span className="h-3.5 w-14 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        ) : waiting ? (
          <span className="flex items-center gap-1.5 text-[14px] text-neutral-500">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-[#06C755]" />
            等待 LINE 授權…
            <button
              type="button"
              className="text-[12px] text-neutral-400 underline"
              onClick={e => { e.stopPropagation(); stopPolling(); }}
            >
              取消
            </button>
          </span>
        ) : status.bound ? (
          <>
            <span className="text-[14px] font-medium text-neutral-900 dark:text-white">已綁定</span>
            {status.canUnbind && (
              <button
                type="button"
                className="text-[12px] text-neutral-400 underline"
                onClick={e => { e.stopPropagation(); void unbind(); }}
              >
                解除
              </button>
            )}
          </>
        ) : (
          <>
            <span className="text-[14px] text-accent-red">立即綁定</span>
            <ChevronRight className="w-4 h-4 text-neutral-300" />
          </>
        )}
      </div>
    </div>
  );
}
