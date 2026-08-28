# brand/ —— 全站 logo 素材的唯一來源

換 logo 只要做兩件事：

```bash
# 1. 換掉 masters/ 底下的兩張母檔（保持透明背景、比例照舊）
# 2. 跑一次
npm run brand:sync
```

其餘 17 張全部自動重產並複製到 `frontend/`、`backend/`、`mobile/` 各自的位置。
產完打開 `OVERVIEW.png` 就能一眼確認有沒有哪張漏掉。

> **為什麼要有這個資料夾**
> 帶 logo 的檔案散在三個獨立部署的 app 底下（前台 / 後台 / 原生殼），路徑沒辦法共用。
> 2026-06 那次換 logo 就漏了幾處：`images/20260629/` 這個「改版暫存資料夾」被當成正式路徑，
> 根目錄同時留了一份同內容的死檔，兩份並存兩個月沒人發現。改成單一來源後不會再有這問題。

---

## masters/ —— 你要換的就這裡

### 必要（三張）

| 檔 | 尺寸 | 說明 |
|----|------|------|
| `horizontal.png` | 1554×500 | 橫式（撕卡包 + 吉吉比橫排），**透明背景** |
| `vertical.png` | 723×646 | 直式（撕卡包在上、吉吉比在下），**透明背景** |
| `horizontal.svg` | 向量 | 橫式的向量版。PNG 產不出 SVG，這張要另外給 |

換的時候尺寸可以不同，但**長寬比要接近**，不然衍生圖的留白會跑掉。

### App 圖示（兩張，已產出佔位版，之後照著改）

「加到主畫面 / PWA / App 桌面」那顆圖示通常是**另外設計的** —— 滿版方塊、自帶底色、
常常只放圖標不放字，跟導覽列那顆橫式 logo 不是同一件事。所以拉成獨立母檔。

| 檔 | 尺寸 | 說明 |
|----|------|------|
| `appicon.png` | 1024×1024 | **滿版**方形，四邊要出血到底（不要自己留白邊）。放了就直接當圖示用 |
| `appicon-maskable.png` | 1024×1024 | 同上，但**重要內容要縮在中央 62% 的圓內** —— Android 會把圖示裁成圓形或 squircle，超出的部分不保證看得到 |

現在放的是**佔位版**（直式 logo 貼白底），跟沒放時的產出長得一樣。
之後把設計稿照同尺寸換上去，跑一次 sync 就換掉了，不用改程式。
（真的把檔案刪掉也不會壞，會自動退回「直式 logo 貼白底 96%」。）

⚠️ **App 圖示不會跟著 logo 自動變** —— 換了 `vertical.png` 卻忘了換 `appicon.png`，
網頁的 logo 換新、手機桌面那顆還是舊的，而且不會有任何錯誤。所以腳本會比對改檔時間，
`appicon` 比 `vertical` 舊就先喊一聲。

跑的時候第一行會印出實際用了哪張，例如：

```
方形圖示來源：vertical.png（未提供 appicon.png，退回直式 logo 貼白底）
maskable 來源：vertical.png（未提供 appicon-maskable.png，退回 vertical 縮 62%）
```

檔名打錯時特別有用 —— 有 fallback 在，產出來的東西看起來「正常」，只是不是你要的那張。

---

## generated/ —— 自動產出，不要手動改

改這裡的檔案下次 `brand:sync` 就會被蓋掉。要調整請改母檔，或改
[`scripts/brand_sync.mjs`](../scripts/brand_sync.mjs) 的 `SPECS`。

### 方形系（來源：`appicon.png`，沒放就用 `vertical.png`）

| 檔 | 尺寸 | 去處 | 用在哪 |
|----|------|------|--------|
| `favicon.png` | 1024² | `frontend/public/images/favicon.png` | 瀏覽器分頁、情報頁 JSON-LD 出版者標誌 |
| `icon-192.png` | 192² | `frontend/public/icons/` | PWA / 加到主畫面 |
| `icon-512.png` | 512² | `frontend/public/icons/` | PWA / 加到主畫面 |
| `apple-touch-icon.png` | 180² | `frontend/public/icons/` | iOS 加到主畫面 |
| `backend-favicon.png` | 1024² | `backend/public/images/favicon.png` | 後台分頁 |

### maskable 系（來源：`appicon-maskable.png`，沒放就退回 `appicon` 或 `vertical` 縮 62%）

| 檔 | 尺寸 | 去處 | 用在哪 |
|----|------|------|--------|
| `icon-maskable-192.png` | 192² | `frontend/public/icons/` | Android PWA 可裁切圖示 |
| `icon-maskable-512.png` | 512² | `frontend/public/icons/` | 同上 |

### 直式 logo 直出

| 檔 | 尺寸 | 去處 | 用在哪 |
|----|------|------|--------|
| `logo-stacked.png` | 723×646 | `frontend/public/images/` | 登入頁 |

### 從 `horizontal.png` 產（橫式系）

| 檔 | 尺寸 | 去處 | 用在哪 |
|----|------|------|--------|
| `logo.png` | 1554×500 | `frontend/public/images/` | 導覽列；**後台蓋圖也靠這張**（見下方警告） |
| `logo.svg` | 向量 | `frontend/public/images/` | 導覽列、維護頁、LINE 回跳頁 |
| `banner_defaulet.png` | 1200×400 | `frontend/public/images/` | 輪播破圖 / 情報無封面 / 交易所無圖（檔名 typo 是原本就有的） |
| `item_defaulet.webp` | 1024² | `frontend/public/images/` | 商品 / 品項 / 倉庫 / 商城佔位 |

### App 原生殼（換了要重新送審）

| 檔 | 尺寸 | 去處 | 來源 |
|----|------|------|------|
| `app-icon.png` | 1024² | `mobile/assets/icon.png` | 方形系 |
| `app-icon-foreground.png` | 1024² | `mobile/assets/icon-foreground.png` | maskable 系，**外圍強制透明**（底色由 background 層畫，前景不透明會把它整個蓋掉） |
| `app-icon-background.png` | 1024² | `mobile/assets/icon-background.png` | 純白 |
| `app-splash.png` | 2732² | `mobile/assets/splash.png` | 直式 logo，不吃 appicon（開機畫面要的是品牌字樣，不是圖示） |
| `app-splash-dark.png` | 2732² | `mobile/assets/splash-dark.png` | 同上，深色底 |

換完要 `cd mobile && npx cap sync`、重新編譯、送 App Store / Play 審核才會生效。
只想改網頁端就跑 `node scripts/brand_sync.mjs --no-mobile`。

---

## manual/ —— 整張插畫，logo 換了救不了

這四張不是 logo 衍生，`brand:sync` 只會照原樣複製出去、不會重產。
目前放的是**現況（舊粉藍視覺）**，要換就丟同尺寸的新檔進來再跑一次 sync。

| 檔 | 尺寸 | 去處 | 說明 |
|----|------|------|------|
| `og-share.png` | 1200×630 | `frontend/public/images/line_default.png` | 全站分享預覽圖（LINE / FB） |
| `og-invite.png` | 1200×630 | `frontend/public/images/invite/invite_banner.png` | 邀請頁分享預覽圖 |
| `app-launch.jpg` | 1320×2862 | `mobile/ios/.../Splash.imageset/splash.jpg` | iOS 原生啟動畫面 |
| `avatar-01.png` … `avatar-08.png` | 1000² | `frontend/public/images/avatar/01–08.png` + `.webp` | **預設頭像八款，是輪替用的**：信箱驗證建帳號時隨機配一款（migration 634），機器人帳號也平均分佈在這八款。要換就整組一起換，不然風格會混 |

---

## ⚠️ 已經烙進圖裡的，這支腳本救不回來

情報封面約 700 張、匯入商品主圖 72 張，舊 logo 是**燒進 R2 上的圖片**的。
蓋圖程式（[`newsBranding.ts`](../backend/lib/newsBranding.ts)、[`productBranding.ts`](../backend/lib/productBranding.ts)）
讀的是 `frontend/public/images/logo.png`，所以**之後新蓋的都會是新 logo**；
舊的要另外跑回填腳本才換得掉。

`newsBranding` 是後台程式、部署在 `admin.ggb.com.tw`，讀不到前台的檔案系統，
是**用 HTTP 抓 `https://www.ggb.com.tw/images/logo.png`**。
所以那個公開網址不能拿掉，也不能改路徑 —— 改了情報圖會全部蓋不上 logo（而且不會報錯）。
