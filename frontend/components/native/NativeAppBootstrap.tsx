'use client';

/**
 * 原生殼的啟動掛載：推播註冊 + 通知點擊導頁。
 *
 * 只在 App 裡且已登入時動作。網頁版整支是 no-op，
 * 不會多發任何請求，也不會跳權限詢問。
 *
 * 為什麼要等登入：device_tokens 是掛在 user_id 底下的。
 * 未登入就註冊會拿到一個沒有歸屬的 token，推不出去也清不掉。
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { useTheme } from '@/contexts/ThemeContext';
import { native } from '@/lib/native/bridge';
import { attachPushListeners, registerPush } from '@/lib/native/push';
import { closeInAppBrowser } from '@/lib/native/browser';

export default function NativeAppBootstrap() {
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const router = useRouter();
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!native.isNativePlatform()) return;
    if (!user?.id) return;
    // 同一個帳號在這次 App 生命週期內只註冊一次，避免每次 re-render 都打一輪
    if (registeredFor.current === user.id) return;
    registeredFor.current = user.id;

    void registerPush().then((r) => {
      if (r === 'denied') {
        // 使用者拒絕通知不是錯誤，也不要煩他。之後想開就去系統設定開。
        console.info('[push] 使用者未允許通知');
      }
    });
  }, [user?.id]);

  useEffect(() => {
    if (!native.isNativePlatform()) return;
    return attachPushListeners((path) => router.push(path));
  }, [router]);

  /*
   * 從背景回到前景時重新確認 session。
   *
   * App 不像網頁分頁會被關掉 —— 使用者可能把手機放口袋兩天再打開。
   * 這期間 refresh token 可能已經過期，但畫面上還是登入狀態，
   * 一按抽獎才發現 401，而且那時候動畫都跑一半了。
   * 醒來就先確認一次，過期就安靜地把狀態同步掉。
   */
  useEffect(() => {
    if (!native.isNativePlatform()) return;

    const plugin = native.plugin('App');
    if (!plugin || typeof plugin.addListener !== 'function') return;

    const supabase = createClient();
    let handle: { remove?: () => void } | undefined;

    try {
      const add = plugin.addListener as unknown as (
        event: string,
        cb: (state: { isActive?: boolean }) => void
      ) => { remove?: () => void };

      handle = add('appStateChange', (state) => {
        if (!state?.isActive) return;
        void supabase.auth.getSession().then(({ data, error }) => {
          if (error || !data.session) return; // AuthContext 的 onAuthStateChange 會接手
          void refreshProfile?.();
        });
      });
    } catch (err) {
      console.warn('[native] appStateChange 掛載失敗', err);
    }

    return () => handle?.remove?.();
  }, [refreshProfile]);

  /*
   * 付款回程：`ggbapp://payment-return` 把玩家從 in-app browser 帶回 App。
   *
   * 綠界付款走的是 in-app browser（見 lib/native/browser.ts 的 openPayment），
   * 付完款人還停在那層瀏覽器上 —— 畫面是對的、錢也入帳了，但他沒有回到 App。
   * 前台的 `/payment/return` 會導向這個自訂 scheme，App 收到之後要做三件事：
   * 收掉瀏覽器、重讀餘額、把畫面帶到儲值紀錄。
   *
   * 餘額讀兩次：綠界的入帳是 server-to-server 打回來的，跟玩家被導回來的時間
   * 沒有先後保證。第一次可能還沒入帳，兩秒後再補一次就對得上了。
   */
  useEffect(() => {
    if (!native.isNativePlatform()) return;

    const plugin = native.plugin('App');
    if (!plugin || typeof plugin.addListener !== 'function') return;

    let handle: { remove?: () => void } | undefined;
    let retry: number | undefined;

    try {
      const add = plugin.addListener as unknown as (
        event: string,
        cb: (e: { url?: string }) => void
      ) => { remove?: () => void };

      handle = add('appUrlOpen', ({ url }) => {
        if (!url || !url.startsWith('ggbapp://payment-return')) return;

        void closeInAppBrowser();
        void refreshProfile?.();
        retry = window.setTimeout(() => void refreshProfile?.(), 2200);
        // 瀏覽器收掉後狀態列設定會被 iOS 洗掉，補一次（同上面的說明）
        window.setTimeout(() => {
          void native.call('StatusBar', 'setOverlaysWebView', { overlay: true });
        }, 500);

        // 目的地由落地頁帶過來（儲值是儲值紀錄、商城訂單是訂單頁）
        let to = '/profile?tab=topup-history';
        const m = /[?&]to=([^&]+)/.exec(url);
        if (m) {
          try {
            const decoded = decodeURIComponent(m[1]);
            // 只吃站內相對路徑，帶不回來就用預設值
            if (decoded.startsWith('/') && !decoded.startsWith('//')) to = decoded;
          } catch { /* 解不開就用預設值 */ }
        }

        /*
         * 儲值成功的提示（老闆 2026-08-20：小卡收起 → 儲值紀錄 → 跳
         * 「儲值成功 G+1,000」）。金額是儲值頁送單前記在 sessionStorage 的
         * 本金＋贈點；只在回程帶 status=success 時跳，取號（ATM／超商）與
         * 失敗不跳。實際入帳由綠界的 server callback 決定，這裡的數字
         * 就是那筆訂單會入的數字。
         */
        try {
          const pending = sessionStorage.getItem('ggb_pending_topup');
          sessionStorage.removeItem('ggb_pending_topup');
          if (to.includes('status=success')) {
            showToast(
              pending ? `儲值成功，G幣 +${Number(pending).toLocaleString()}` : '儲值成功！',
              'success',
            );
          } else if (to.includes('status=waiting_payment')) {
            showToast('已取得繳費資訊，完成繳費後入帳', 'info');
          }
        } catch { /* sessionStorage 不可用就不跳，無害 */ }

        /*
         * 導頁前把 status 參數摘掉：會員中心有一個通用的「付款成功！」toast
         * 也在看它，不摘的話玩家會同時看到兩條提示（老闆 2026-08-20 截圖）。
         * 提示由上面那條負責就好。
         */
        to = to.replace(/([?&])status=[^&]*&?/, '$1').replace(/[?&]$/, '');
        router.push(to);
      });
    } catch (err) {
      console.warn('[native] appUrlOpen 掛載失敗', err);
    }

    return () => {
      handle?.remove?.();
      if (retry) window.clearTimeout(retry);
    };
  }, [router, refreshProfile, showToast]);

  /*
   * 狀態列。
   *
   * `setOverlaysWebView(true)`（滿版，老闆 2026-08-21）一定要在執行階段呼叫 ——
   * 只寫在 capacitor.config.ts 的 plugins.StatusBar 底下不可靠（8/20 實測）。
   * overlay 之後 webview 延伸到動態島底下，內縮由網頁的
   * env(safe-area-inset-top) 處理（Navbar／PageHeader／sticky 子欄都補了）。
   * 舊殼（contentInset automatic）收到 true 也安全：系統自動內縮讓 env 歸 0，
   * 版面不變，只是狀態列背後改畫網頁底色。
   *
   * 樣式跟著深淺色模式走：深色底配深色圖示會整片看不見。
   *
   * ⚠️ 這個設定**會被 in-app browser 洗掉**：SFSafariViewController 關閉時
   * iOS 重新排版，webview 又漲回整個螢幕，所有頁面都頂進時間底下
   * （老闆 2026-08-20 回報「儲值完關閉後幾乎全部頁面都跑到 iPhone 時間下面」）。
   * 所以除了開機套一次，還要在「瀏覽器關閉」與「App 回前景」時各補一次；
   * 補的時機延後一拍（400ms），等 VC 的 dismiss 動畫收完再套才不會又被蓋掉。
   */
  useEffect(() => {
    if (!native.isNativePlatform()) return;

    const apply = () => {
      void native.call('StatusBar', 'setOverlaysWebView', { overlay: true });
      const dark = theme === 'dark';
      void native.call('StatusBar', 'setStyle', { style: dark ? 'DARK' : 'LIGHT' });
      // Android 才需要設背景色；iOS 的狀態列背景是由底下的 view 決定
      if (native.nativePlatform() === 'android') {
        void native.call('StatusBar', 'setBackgroundColor', { color: dark ? '#0a0a0a' : '#ffffff' });
      }
    };
    apply();

    /*
     * 捲動位置矯正：SFSafariViewController 關閉時，WKWebView 的捲動偏移
     * 可能卡在超出範圍的位置 —— 頁面明明不足一屏也被「捲」下去一截，
     * 內容頂進頁頭底下（老闆 2026-08-20 附圖：關閉 LINE 授權後登入鈕被裁切）。
     * 把位置夾回合法範圍再往返 1px 逼原生捲動層同步；
     * 合法範圍內的（玩家自己捲的）一律不動。
     */
    const nudgeScroll = () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.min(window.scrollY, max);
      window.scrollTo(0, y + 1);
      window.scrollTo(0, y);
    };

    const timers: number[] = [];
    const applyLater = () =>
      timers.push(window.setTimeout(() => { apply(); nudgeScroll(); }, 400));
    const handles: { remove?: () => void }[] = [];

    const listen = (pluginName: string, event: string) => {
      const plugin = native.plugin(pluginName);
      if (!plugin || typeof plugin.addListener !== 'function') return;
      try {
        const add = plugin.addListener as unknown as (
          ev: string,
          cb: (e?: { isActive?: boolean }) => void
        ) => { remove?: () => void };
        handles.push(
          add(event, (e) => {
            // appStateChange 只在回前景時補；browserFinished 一律補
            if (event === 'appStateChange' && !e?.isActive) return;
            applyLater();
          }),
        );
      } catch (err) {
        console.warn(`[native] ${pluginName}.${event} 掛載失敗`, err);
      }
    };
    listen('Browser', 'browserFinished');
    listen('App', 'appStateChange');

    return () => {
      handles.forEach((h) => h.remove?.());
      timers.forEach(clearTimeout);
    };
  }, [theme]);

  /*
   * Android 實體返回鍵。
   *
   * Capacitor 預設在沒有歷史時直接關掉 App —— 玩家在商品頁按一下返回
   * 就整個退出，體感很差。改成：能返回就返回，回到首頁才詢問離開。
   */
  useEffect(() => {
    if (!native.isNativePlatform()) return;
    if (native.nativePlatform() !== 'android') return;

    const plugin = native.plugin('App');
    if (!plugin || typeof plugin.addListener !== 'function') return;

    let handle: { remove?: () => void } | undefined;
    try {
      const add = plugin.addListener as unknown as (
        event: string,
        cb: (e: { canGoBack?: boolean }) => void
      ) => { remove?: () => void };

      handle = add('backButton', ({ canGoBack }) => {
        if (canGoBack || window.location.pathname !== '/') {
          router.back();
        } else {
          // 首頁再按一次才離開，避免誤觸關掉 App
          void native.call('App', 'minimizeApp');
        }
      });
    } catch (err) {
      console.warn('[native] backButton 掛載失敗', err);
    }

    return () => handle?.remove?.();
  }, [router]);

  return null;
}
