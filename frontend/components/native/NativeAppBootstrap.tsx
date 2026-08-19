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
import { createClient } from '@/lib/supabase/client';
import { useTheme } from '@/contexts/ThemeContext';
import { native } from '@/lib/native/bridge';
import { attachPushListeners, registerPush } from '@/lib/native/push';

export default function NativeAppBootstrap() {
  const { user, refreshProfile } = useAuth();
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
   * 狀態列。
   *
   * `setOverlaysWebView(false)` 一定要在執行階段再呼叫一次 ——
   * 只寫在 capacitor.config.ts 的 plugins.StatusBar 底下沒有生效（老闆回報
   * 「我的」頁與所有內頁的頂部被時間蓋住），外掛的預設是 overlaysWebView = true。
   * 設成 false 之後 webview 會從狀態列底下開始，網頁完全不必處理瀏海內縮。
   *
   * 樣式跟著深淺色模式走：深色底配深色圖示會整片看不見。
   */
  useEffect(() => {
    if (!native.isNativePlatform()) return;
    void native.call('StatusBar', 'setOverlaysWebView', { overlay: false });
    const dark = theme === 'dark';
    void native.call('StatusBar', 'setStyle', { style: dark ? 'DARK' : 'LIGHT' });
    // Android 才需要設背景色；iOS 的狀態列背景是由底下的 view 決定
    if (native.nativePlatform() === 'android') {
      void native.call('StatusBar', 'setBackgroundColor', { color: dark ? '#0a0a0a' : '#ffffff' });
    }
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
