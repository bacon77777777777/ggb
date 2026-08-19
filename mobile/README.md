# 吉吉比原生殼（iOS / Android）

前台是 Next.js SSR + API routes，不能靜態匯出，所以 App 走 **remote URL 模式** ——
webview 直接載入 `https://www.ggb.com.tw`。

好處：改版不用重新送審，網頁推上去 App 使用者下次開就是新的。
代價：Apple Guideline 4.2（Minimum Functionality）審得比較嚴，純包網頁會被當
repackaged website 退件。所以推播、Face ID、原生分享、相機掃碼**不是加分項，是過審條件**。

## 目錄

| 路徑 | 用途 |
|------|------|
| `capacitor.config.ts` | 唯一的設定來源（`cap sync` 會寫進兩個原生專案） |
| `ios/` | Xcode 專案（`cap add ios` 產生） |
| `android/` | Android Studio 專案（`cap add android` 產生） |
| `twa/twa-manifest.json` | Android TWA（Bubblewrap）設定，跟 Capacitor 二選一 |
| `assets/` | 圖示與啟動畫面來源圖，改圖後跑 `npx @capacitor/assets generate` |

## 環境需求

- **Node ≥ 22**（Capacitor 8 CLI 的硬性要求）。本機預設是 20，用 `nvm use 22`。
- **Xcode**（iOS）。CocoaPods **用不到** —— Capacitor 8 的 iOS 專案走 SPM，
  沒有 Podfile。（裝了也不礙事，之後若遇到只支援 Pods 的外掛會需要。）
- **Android Studio**（Android）＋ JDK 17

iOS 端已實際 build 並在模擬器執行成功（2026-08-19）。Android 尚未 build，缺 JDK。

⚠️ **外掛必須支援 SPM**：Capacitor 8 的 iOS 專案預設是 SPM，沒有 `Package.swift`
的外掛會被 `cap sync` **靜默排除** —— CLI 仍會說「Found N plugins」，但 iOS 端沒編進去。
裝新外掛後請確認它有出現在 `ios/App/CapApp-SPM/Package.swift` 的 dependencies 裡。

## 前台的搭配設定

App 的 User-Agent 會被接上 `GGBApp/1.0 (ios|android)`。
前台靠這段字串判斷「跑在 App 裡」，用來關掉玩家商城（`frontend/lib/nativeApp.ts`）。
**改 `appendUserAgent` 前台會跟著失效，兩邊要一起改。**

## 常用指令

```bash
nvm use 22
npm install
npx cap sync              # 設定與外掛同步到原生專案
npx cap open ios          # 開 Xcode
npx cap open android      # 開 Android Studio
npx @capacitor/assets generate   # 重產圖示／啟動畫面
```

## 送審前還要做的事

依賴外部帳號，目前都還拿不到：

### 1. 推播（Firebase Cloud Messaging）

⚠️ **`@capacitor-firebase/messaging` 目前已從專案移除。**
它在初始化就呼叫 `FIRApp.configure()`，找不到 `GoogleService-Info.plist` 會拋
NSException，**App 開機即 crash**。等下面的設定檔備妥後再裝回來：

```bash
npm install @capacitor-firebase/messaging@^8.4.0 firebase@^12.6.0
npx cap sync
```

前台的推播程式碼（`frontend/lib/native/push.ts`、`/api/user/device-token`、
`backend/lib/push.ts`）都保留著，橋接層找不到外掛會回 `null`，不會出錯。

兩個平台都走 FCM（iOS 由 Firebase 代發 APNs），後端只有一條發送路徑
（`backend/lib/push.ts`）。

1. 建 Firebase 專案，加入 iOS 與 Android App（bundle id 都是 `tw.com.ggb.app`）
2. 下載 `GoogleService-Info.plist` → `ios/App/App/`（要在 Xcode 裡加入專案，不是只丟進資料夾）
3. 下載 `google-services.json` → `android/app/`
4. Apple Developer → Keys → 產 APNs Auth Key（`.p8`）→ 上傳到 Firebase Cloud Messaging 設定
5. Firebase → 專案設定 → 服務帳戶 → 產生新的私密金鑰，整包 JSON 塞進後台環境變數：
   ```
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
   ```

### 2. iOS 推播能力

Xcode → 選 App target → Signing & Capabilities → **+ Capability → Push Notifications**。
`App.entitlements` 已經先建好（`aps-environment: development`），
但**還沒接進 pbxproj** —— 用 Xcode 加 capability 它會自動接上，不要手改專案檔。

### 3. Android TWA（如果走 Bubblewrap 而不是 Capacitor）

```bash
npm i -g @bubblewrap/cli
cd twa && bubblewrap init --manifest https://www.ggb.com.tw/manifest.json
bubblewrap build
```

拿到 Play App Signing 的 SHA-256 憑證指紋後，設進前台環境變數，
`/.well-known/assetlinks.json` 會自動產出正確內容（不用改程式）：

```
TWA_PACKAGE_NAME=tw.com.ggb.twa
TWA_SHA256_FINGERPRINTS=AA:BB:CC:...
```

⚠️ 指紋要用 **Play App Signing 頁面上的那把**，不是本機 keystore 的 ——
上架後 Google 會用自己的金鑰重簽。

### 4. 商店素材

App 圖示已由 `assets/icon.png` 產出全尺寸，但那只是把現有 logo 置中，
**上架前建議請設計重做**。另外還要截圖、隱私權標籤（App Privacy）、分級問卷。

## 已知限制

- `ios/` 與 `android/` 是 `cap add` 產生的，可以隨時刪掉重生；
  但 Info.plist 的權限說明、AndroidManifest 的權限宣告是**手動加的**，重生會不見。
  重生後對照 git diff 補回來。
