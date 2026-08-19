'use client';

/**
 * 付款回程橋
 *
 * 綠界付款完成後會把瀏覽器導回 `/profile?tab=topup-history&status=success`。
 * 在 App 裡那條流程是開在 in-app browser 的，所以玩家會停在瀏覽器浮層 ——
 * 畫面是對的、錢也入帳了，但人沒有回到 App（老闆回報「卡在這頁面」）。
 *
 * 這支負責把他帶回去：看到付款回程的參數、而且身上有交接頁種的
 * `ggb_pay_app` cookie，就導向自訂 scheme。條件兩個都要，才不會誤傷
 * 一般網頁付款的玩家（他們沒有那張 cookie）。
 *
 * 自動導向可能被 Safari 擋（沒有使用者手勢），所以同時浮一顆按鈕當出路。
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { native } from '@/lib/native/bridge';

const APP_SCHEME_URL = 'ggbapp://payment-return';
const COOKIE = 'ggb_pay_app';

function hasPayCookie() {
  return typeof document !== 'undefined' && document.cookie.includes(`${COOKIE}=1`);
}

function clearPayCookie() {
  document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export default function PaymentReturnBridge() {
  const searchParams = useSearchParams();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // 已經在 App 裡就不用彈回去（webview 直接走完的情況）
    if (native.isNativePlatform()) return;
    const status = searchParams?.get('status');
    if (status !== 'success' && status !== 'error') return;
    if (!hasPayCookie()) return;

    clearPayCookie();
    setShow(true);
    // 延遲一拍讓「儲值成功」的畫面先出現，導向被擋掉時玩家也看得到結果
    const t = setTimeout(() => { window.location.href = APP_SCHEME_URL; }, 700);
    return () => clearTimeout(t);
  }, [searchParams]);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <a
        href={APP_SCHEME_URL}
        className="flex h-12 w-full max-w-md mx-auto items-center justify-center rounded-xl bg-primary text-[15px] font-black text-white shadow-lg shadow-primary/30 active:scale-[0.98] transition-all"
      >
        回到吉吉比
      </a>
      <p className="mt-2 text-center text-[12.5px] text-neutral-400">
        沒有自動跳回的話，按上面這顆
      </p>
    </div>
  );
}
