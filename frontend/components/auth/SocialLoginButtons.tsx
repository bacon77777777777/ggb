'use client';

import { Button } from '@/components/ui';
import Image from 'next/image';

/**
 * 社群登入
 *
 * LINE：走 LINE Login 的 OAuth 授權碼流程。Supabase 沒有 LINE provider，
 * 回程由 /auth/line/callback 接手，把授權碼交給後端換成正常的 Supabase
 * session（細節在 /api/auth/line）。
 *
 * Google 暫時不顯示：開 Google OAuth 需要 Google Workspace，而那需要
 * 公司統編 —— 登記還沒下來。之前這顆按鈕掛在畫面上但按了沒反應，
 * 比沒有更糟。統編下來接好後再打開。
 */

const LINE_CHANNEL_ID = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID;

function startLineLogin() {
  // state 擋 CSRF：回程頁會比對，不一樣就拒收。
  // 存 localStorage 而不是 sessionStorage —— sessionStorage 是「每個分頁一份」，
  // 而 LINE app 授權完把人送回來時常常是開新分頁，state 就找不到了
  const state = crypto.randomUUID();
  localStorage.setItem('line_login_state', state);

  /*
   * 加到主畫面的 PWA（偽 app）要整段留在原地，不跳 LINE app。
   *
   * 實測的災情：從偽 app 按登入 → 跳 LINE app 授權 → LINE app 把人
   * 送回網站時 iOS 只會用 Safari 開，回不到偽 app —— 而兩邊的儲存空間
   * 是隔離的，state 對不上，就算對上了登入態也建在 Safari 而不是偽 app。
   * disable_auto_login=true 讓 LINE 的授權頁直接用網頁登入
   *（有 SSO 就一鍵、沒有就輸帳密），全程不離開偽 app 的視窗。
   * 一般瀏覽器維持跳 app 的一鍵授權，體驗不變。
   */
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_CHANNEL_ID ?? '',
    redirect_uri: `${window.location.origin}/auth/line/callback`,
    state,
    // openid 才拿得到 id_token；profile 讓 id_token 帶暱稱與頭像
    scope: 'profile openid',
  });
  if (standalone) params.set('disable_auto_login', 'true');
  window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params}`;
}

export function SocialLoginButtons() {
  if (!LINE_CHANNEL_ID) return null;
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
