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
    /*
     * 本機開發：`GGB_APP_URL=http://localhost:3000 npx cap sync ios` 把殼指到本地
     * dev server（模擬器跟主機共用 loopback）。Android 的 http 要靠 cleartext 放行；
     * iOS 走 Info.plist 的 NSAllowsLocalNetworking。產生的 ios/App/App/capacitor.config.json
     * 沒被 git 追蹤，測完要記得用預設（正式網址）再 sync 一次。
     */
    cleartext: APP_URL.startsWith('http://'),
    /*
     * 不限制導航（'*'）。
     *
     * 一開始只放行自家網域，結果金流整條斷掉：綠界的付款頁不在白名單 →
     * Capacitor 用 `UIApplication.open()` 把它交給 Safari，**那是 GET，
     * 表單的 POST 參數整包遺失** → 綠界回 MobileErrorHandle 錯誤頁。
     * 3D 驗證還會再跳到各家銀行的網域，那更是列不完。
     * 加到主畫面的偽 app 之所以一直正常，就是因為它沒有這層限制。
     *
     * 放開之後「使用者被困在沒有網址列的 webview 裡」由前台處理 ——
     * `components/native/ExternalLinkHandler.tsx` 在 document 層攔截所有
     * 站外連結，改用 in-app browser（自帶關閉鍵與網址列）開啟。
     * 也就是說控制權在我們手上，而且比白名單更精準：白名單擋的是「網域」，
     * 攔截器擋的是「使用者主動點擊的站外連結」，金流那種程式觸發的導航不受影響。
     */
    allowNavigation: ['*'],
  },
  ios: {
    appendUserAgent: 'GGBApp/1.0 (ios)',
    /*
     * 'never'（全出血）：webview 鋪滿整個螢幕、延伸到動態島底下，彩色頁頭與
     * hero 圖直接畫到螢幕頂邊（老闆 2026-08-21 指定「全站頂邊出血」）。
     * 版面的內縮改由網頁自己用 env(safe-area-inset-top) 處理：
     *   - 共用 Navbar（NavbarLayout）已內建 pt-[env(safe-area-inset-top)]，
     *     走它的頁一次到位。
     *   - 手機自繪頂部的頁（profile／排行／商品／簽到／邀請）逐頁「背景出血＋
     *     內容壓安全區」，見各頁 pt-[calc(... + env(safe-area-inset-top))]。
     * 先前為了不逐頁補而用 'automatic'，全站頂邊需求出現後翻案；這次把自繪頂部
     * 的頁一併補齊，不再裁頂。viewportFit:'cover' 已設（app/layout.tsx），env() 有值。
     */
    contentInset: 'never',
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
    /*
     * 原生 LINE 登入（plugins/line-login）。channelId 是公開值（本來就會出現在
     * 授權網址上），hardcode 無妨；channel secret 只存在後端。
     */
    LineLogin: {
      channelId: '2011007121',
    },
    /*
     * 系統啟動畫面（第一層）。
     *
     * `launchAutoHide: false` 是整套開屏的關鍵 —— 預設行為是「App 一啟動完
     * 就自己收掉」，但那時 webview 還在載網頁，玩家會看到白屏 → 首頁 →
     * 才被開屏廣告蓋住（老闆 2026-08-20 回報的「先顯示首頁，過一兩秒才蓋圖」）。
     *
     * 改成不自動收之後，改由網頁決定什麼時候收：
     *   要放廣告 → 廣告確定畫上去了才 hide()，兩層在同一幀交接，首頁不會露臉
     *   不放廣告 → 立刻 hide()，直接看到首頁
     * 見 frontend/components/native/AppSplashAd.tsx。
     *
     * ⚠️ 沒有人呼叫 hide() 的話它會一直蓋著，所以斷網／網頁掛掉時要有保險 ——
     * 保險寫在 ios/App/App/AppDelegate.swift（最長 8 秒一定收）。
     */
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#ffffff',
      showSpinner: false,
      // 淡出交給網頁那層做，原生這裡直接切掉才不會兩段動畫疊在一起
      launchFadeOutDuration: 0,
    },
    StatusBar: {
      // 全出血：狀態列疊在 webview 上，內容延伸到動態島底下（見 contentInset 註解）
      overlaysWebView: true,
      style: 'DEFAULT',
      backgroundColor: '#ffffff',
    },
  },
};

export default config;
