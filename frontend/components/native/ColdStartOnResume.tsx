'use client';

/**
 * 太久沒回來就從頭開始（老闆 2026-08-31）
 *
 *   App  → 蓋回啟動畫面，再整個重載到首頁（看起來就是冷啟動）
 *   PWA  → 重載到首頁
 *   一般瀏覽器分頁 → **不做任何事**
 *
 * 為什麼只針對這兩種殼：它們沒有網址列、沒有重新整理鍵。玩家隔天打開看到的是
 * 昨天停的那一頁，餘額、庫存、檔期全是舊的，而他沒有辦法自己刷新。
 * 一般瀏覽器把分頁開著一整天是常態，自己跳回首頁只會把人家正在看的東西弄丟。
 *
 * 兩邊各聽各的訊號，因為它們的可靠度不一樣：
 *
 *   App  `appStateChange`（@capacitor/app）—— webview 進背景時 `visibilitychange`
 *        在 iOS **不保證**會發，只有這個外掛事件是準的。
 *   PWA  `visibilitychange` + `pagehide` —— iOS Safari 把分頁凍結／回收時只發
 *        `pagehide`，少了它「被系統殺掉再回來」那條路就記不到離開時間。
 *
 * 兩種訊號可能同時發（App 裡兩個都聽），所以 `shouldColdStart()` 是讀完即清，
 * 一次離開只會判斷一次，不會重載兩遍。
 */

import { useEffect } from 'react';
import { native } from '@/lib/native/bridge';
import { markAway, shouldColdStart } from '@/lib/coldStart';

/** PWA：從主畫面開的獨立視窗。Capacitor 的 webview 不吃這個判斷，所以另外走 native */
function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export default function ColdStartOnResume() {
  useEffect(() => {
    const isApp = native.isNativePlatform();
    const isPwa = isStandalonePwa();
    if (!isApp && !isPwa) return;          // 一般瀏覽器分頁：不參與

    let restarting = false;

    const restart = () => {
      if (restarting) return;
      restarting = true;
      /*
       * App 先把啟動畫面蓋回去再重載，玩家看到的才是「重新開了一次 App」，
       * 而不是首頁自己閃一下。蓋上去之後由 AppSplashAd 負責 hide()
       * （它每一條分支都會呼叫，原生端另有 8 秒保險）。
       */
      if (isApp) void native.call('SplashScreen', 'show', { autoHide: false });
      // replace 不留歷史：重啟後按返回不該回到「上一輩子」那一頁
      window.location.replace('/');
    };

    const onHidden = () => { if (document.visibilityState === 'hidden') markAway(); };
    const onVisible = () => { if (document.visibilityState === 'visible' && shouldColdStart()) restart(); };

    document.addEventListener('visibilitychange', onHidden);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', markAway);

    /* App 專用：外掛的生命週期事件才是 iOS 上唯一可靠的 */
    let removeApp: (() => void) | undefined;
    if (isApp) {
      const p = native.plugin('App');
      if (p && typeof p.addListener === 'function') {
        const add = p.addListener as unknown as (
          event: string,
          cb: (data: { isActive?: boolean }) => void,
        ) => { remove?: () => void };
        const handle = add('appStateChange', ({ isActive }) => {
          if (isActive === false) markAway();
          else if (isActive === true && shouldColdStart()) restart();
        });
        removeApp = () => handle.remove?.();
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', markAway);
      removeApp?.();
    };
  }, []);

  return null;
}
