import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 吉吉比原生殼設定（remote URL 模式）
 *
 * 為什麼是 remote URL 而不是把網站打包進去：
 * 前台是 Next.js SSR + API routes（`output: 'standalone'`），不能靜態匯出，
 * 所以 App 只能指向線上的網站。好處是改版不用重新送審 —— 網頁推上去，
 * App 使用者下次開就是新的。
 *
 * ⚠️ 代價是 Apple Guideline 4.2（Minimum Functionality）會審得比較嚴：
 * 純粹包一個網頁會被當成 repackaged website 退件。所以推播、Face ID、
 * 原生分享、相機掃碼這些不是加分項，是過審的必要條件。
 *
 * User-Agent：前台靠這段標記判斷「現在跑在 App 裡」，用來關掉商城
 * （見 frontend/lib/nativeApp.ts）。改這個字串前台會跟著失效，兩邊要一起改。
 */

const APP_URL = process.env.GGB_APP_URL || 'https://www.ggb.com.tw';

const config: CapacitorConfig = {
  appId: 'tw.com.ggb.app',
  appName: '吉吉比',
  // remote URL 模式下這個目錄的內容不會被使用，但 Capacitor 要求它存在
  webDir: 'www',
  server: {
    url: APP_URL,
    cleartext: false,
    // 只允許自家網域在 webview 內開啟；其他（綠界金流頁、外部連結）
    // 走系統瀏覽器，避免把使用者困在 webview 裡
    allowNavigation: ['www.ggb.com.tw', 'ggb.com.tw', 'staging.ggb.com.tw'],
  },
  ios: {
    appendUserAgent: 'GGBApp/1.0 (ios)',
    /*
     * 'automatic' 而不是 'never'：讓 webview 從安全區底下開始，
     * env(safe-area-inset-top) 就會是 0，網頁的版面完全不用動。
     *
     * 'never' 可以做出滿版視覺，但代價是站上所有 sticky 子欄的
     * top-[57px] 偏移都要跟著改（有八處以上），沒有實機很難驗。
     * 抽獎機台本來就在畫面中段，滿版沒有實質收益。
     */
    contentInset: 'automatic',
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#ffffff',
  },
  android: {
    appendUserAgent: 'GGBApp/1.0 (android)',
    backgroundColor: '#ffffff',
  },
  plugins: {
    /*
     * 推播走 Firebase Cloud Messaging（兩個平台都回 FCM token）。
     * 用 @capacitor/push-notifications 的話 iOS 回的是 APNs token，
     * 後端就得同時實作 APNs（JWT + HTTP/2）與 FCM 兩條發送路徑；
     * 走 FCM 則 iOS 端由 Firebase 代發 APNs，後端只要一條。
     *
     * 前置作業（拿到開發者帳號之後）：
     *   1. Firebase 專案 → 加入 iOS／Android App
     *   2. 下載 GoogleService-Info.plist → ios/App/App/
     *   3. 下載 google-services.json  → android/app/
     *   4. Apple Developer → 產 APNs Auth Key（.p8）→ 上傳到 Firebase
     */
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      // 狀態列不覆蓋 webview —— 配合上面的 contentInset，
      // 網頁不必處理瀏海／動態島的內縮
      overlaysWebView: false,
      style: 'DEFAULT',
      backgroundColor: '#ffffff',
    },
  },
};

export default config;
