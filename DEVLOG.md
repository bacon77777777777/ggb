# 開發日誌

---

## 2026-07-01（後台持續開發）

### 本次目標
- 儀表板整合用戶行為數據、優化卡片與圖表 UI
- 物流明細報表 + 運費設定
- 報表側欄結構重組、命名優化
- 修復部署重複觸發問題

### 後台（Next.js / backend）

**物流明細 & 運費設定**
- Migration `218`：建立 `platform_settings` 表（key-value），預設 `shipping_fee_home/cvs = 60`
- 新增 `GET/PUT /api/admin/reports/logistics`：查詢出貨訂單（含用戶/獎品/廠商）
- 新增 `GET/PUT /api/admin/settings`：讀寫平台設定（運費）
- `/reports/logistics`：物流明細報表頁，支援日期篩選、狀態篩選、搜尋、CSV 匯出
- `/settings/shipping`：宅配 / 超商取貨運費設定頁

**儀表板整合用戶行為**
- 儀表板新增三張行為統計卡：點擊商品數（去重）、點擊後成功抽獎、點擊→抽轉化率
- DAU 折線圖獨立一排放在統計卡下方
- 排名列表從兩欄改為三欄：最多點擊系列 TOP 15、熱門商品 TOP 15、熱門搜尋字 TOP 15
- `RankingList` 元件新增 `limit` prop（原本硬寫 10）
- 移除側欄「用戶行為」頁，數據整合至儀表板

**儀表板卡片 UI 優化**
- 新增 `InfoTooltip` 元件（藍色 `!` 圖標，懸浮顯示中文說明），套用至所有統計卡、圖表、排名列表
- 統一所有圖表/排名標題 CSS（`text-lg → text-sm`）
- `StatCard` 不論有無圖表都保留高度佔位，三張行為卡與上方卡片等高
- 商品排名名稱改為 `text-xs + line-clamp-2`，允許兩行顯示

**統計卡數據優化**
- `期間轉化率`（顯示 100%，意義不大）→ **平均客單價(TWD)**（總儲值 ÷ 付費人數，即 ARPU）
- `ABC賞已出數量` → **付費用戶數**（期間付費不重複用戶，更具策略價值）

**商品消費報表**
- 分類欄位從 `category`（常顯示「未分類」）改為 `type`，顯示中文種類（轉蛋/一番賞/盒玩）
- 篩選器同步改用 `type` 欄位過濾

**側欄結構重組**
- 「主頁」群組 → **營運總覽**
- 「營運總覽」頁 → **轉換分析**（只保留轉換漏斗、付費行為分析、每日明細；移除與儀表板重複的資金流動/會員大卡）
- 物流明細移到儲值明細正下方
- 儲值明細、物流明細預設日期為本月 1 日至今（同商品消費）

**本機開發體驗**
- Migration `217`：補建 `track_mission_event` RPC（舊 DB 沒有此函式，前台點轉蛋會報錯 `{}`）
- 管理後台開發環境自動登入（不需手動輸入帳密）
- 修正後台 port 3001 啟動位置錯誤（要在 `backend/` 目錄啟動）
- `backend/.env.local` 補入 `ADMIN_SESSION_SECRET`

**部署**
- 移除 `.github/workflows/deploy.yml`（Vercel GitHub 整合已自動部署，deploy webhook 造成每次 push 觸發兩倍次數）

### DB Migrations
| Migration | 說明 |
|---|---|
| 217 | 補建 `track_mission_event` RPC（新 Supabase 專案缺少） |
| 218 | `platform_settings` 表 + 運費預設值 |

---

## 2026-07-01（前台開發）

### 本次目標
- 完成個人化演算法全流程串接（series tab 排序、精選排序、行為追蹤）
- 排行榜與跑馬燈假數據兜底（平台初期無資料時顯示示範數據）
- 後台功能補強：用戶行為報表、廠商統編、CSV 批量匯入選廠商、series 欄位
- 各項 UI/邏輯 bug 修復

### 前台（Next.js / frontend）

**演算法 / 個人化**
- `get_user_series_preferences` RPC：依抽轉紀錄計算 series 偏好分數（draw×5, follow×3, event 0.5~2）
- `get_popular_series` RPC：全平台熱門 series，draw_records < 20 筆時以 is_hot 代理熱門度
- 首頁 `seriesTabs` 排序：個人偏好 → 全平台熱門 → 商品數量三層降級
- 精選排序：有個人偏好用個人偏好，無則用全平台熱門，都沒有才用 is_hot + 最新

**UI 修復**
- 首頁只有一個主 tab（`hidePrimaryTabs=true`）時，左右滑動改為切換二級 tab（series）
- 恭喜獲得彈窗圖片載入失敗 fallback 到 `item_defaulet.png`；切換獎項時重置錯誤狀態
- 移除會員個人頁頂部私訊圖標

### 後台（Next.js / backend）

**用戶行為報表**
- 新增 `/reports/behavior` 頁面：熱門搜尋字 TOP15、最多點擊 series TOP15、點擊→抽轉化率、DAU 表
- API：`GET /api/admin/reports?tab=behavior`，查詢 `user_events` 資料

**廠商統編**
- 上架表單加入廠商下拉 + 統編顯示
- CSV 批量匯入加入廠商下拉選擇
- `detectSeries` 工具：存檔時若 series 空白，自動偵測填入

**儀表板修正**
- 分類抽獎次數圓餅圖改用 `type` 欄位，不再顯示「未分類」

### DB Migrations
| Migration | 說明 |
|---|---|
| 211 | 排行榜假數據兜底（draw_records < 20 時回傳示範數據） |
| 212 | 自動偵測並填入現有商品 series 欄位 |
| 213 | `get_popular_series` RPC |
| 214 | 清除 series 欄位中的商品形式類別，只保留 IP 名稱 |
| 215 | 排行榜 RPC 從 `public.users.avatar_url` 讀取頭像 |
| 216 | 排行榜假數據頭像改為 `/images/avatar/01~08.png` 輪流分配 |

### 部署狀態
- Vercel Hobby 方案每日 100 次部署上限已達，frontend 停在 `aef7e84`，次日重置後自動觸發

### 本機環境問題排查

**問題：本機前台顯示舊 GachaGo 資料**
- 根因：`.env.local` 指向舊 Supabase 專案（`qgziszozkdskdstexsvw`），正確專案為 `akdqleelvqvjhjnfkpfq`
- 解法：更新兩個 `.env.local` 的三個 Supabase 環境變數

**問題：首頁一級 tabs 閃爍**
- 根因：`DEFAULT_FLAGS` 全部預設 `true`，DB 載入前就渲染所有 tab
- 解法：`DEFAULT_FLAGS` 全部改為 `false`

---

## 2026-06-30（主要開發 — 報表、廠商、儀表板）

### 1. 報表頁面（`/admin/reports`）

新增路由 `app/reports/page.tsx` + API `app/api/admin/reports/route.ts`。

**3 個 Tab：**
- **儲值明細**：列出 recharge_records，含日期/訂單/用戶/金額/贈點/付款方式/狀態
- **消費明細**：列出 draw_records，含日期/用戶/商品/消耗代幣/獎品等級/名稱/狀態
- **期間摘要**：KPI 卡片（總儲值/總消費代幣/新用戶/平均客單價）+ 每日明細表

**功能：** 預設當月日期範圍，支援 DateRangePicker，各 Tab 右上角「匯出 CSV」（帶 BOM）

### 2. 廠商管理（`/admin/suppliers`）

- Migration `187`：`suppliers` 表 + `products.supplier_id` FK，預設插入「靈感文創」
- API：`GET/POST /api/admin/suppliers`、`PATCH/DELETE /api/admin/suppliers/[id]`
- 頁面：廠商列表 + 新增/編輯 Modal + 刪除確認
- 商品編輯頁加入「供應廠商」下拉選單

### 3. 儀表板圖表

結構完整（儲值趨勢、儲值/消耗對比、抽獎次數柱狀圖、分類圓餅圖、TOP10 排名），待真實資料累積後驗證數值。

---

## 2026-06-30（DB 補齊、GitHub CI/CD、藍新金流）

### DB 補遷移（Supabase）

**根因**：新站 DB 原只有 9 張表，002～183 核心 migrations 未完整執行，前後台大量頁面 500 或資料空白。

**修復**：兩支安全 bootstrap migration（全程 `CREATE TABLE IF NOT EXISTS`）：

- `185_safe_primary_bootstrap.sql`：核心表（categories、products、product_prizes、orders、draw_records、recharge_records、banners、news、notifications 等）+ RLS + Storage
- `186_safe_secondary_bootstrap.sql`：相依表（coupons、tasks、marketplace、exchange 等）

**結果**：DB 從 23 張表擴展至 **46 張表**

### GitHub Actions 自動化

- 新增 `.github/workflows/migrate.yml`：push 到 main 且有 `.sql` 變動時自動觸發
- 以 `_migration_log` 表追蹤已套用 migration，skip 重複執行
- GitHub secret `SUPABASE_DB_URL` 設定完成

### 藍新金流（NewebPay）環境設定

| 變數 | 值 |
|------|---|
| `NEWEBPAY_MERCHANT_ID` | MS159643890 |
| `NEWEBPAY_HASH_KEY` | bSpuxdVoJilYr5BX64K9yqxkOOYEWPSX |
| `NEWEBPAY_HASH_IV` | CkU2Fnebq7yf6HWP |
| `NEWEBPAY_VERSION` | 2.0 |
| `NEWEBPAY_API_URL` | https://ccore.newebpay.com/MPG/mpg_gateway（測試環境）|

**待辦**：至藍新後台填入 NotifyURL / ReturnURL，執行測試交易

---

## 2026-06-29（上線遷移啟動）

### 進度摘要
- GitHub：建立 `bacon77777777777/ggb` 並推送 `main`
- Backend：強化 `backend/scripts/manual_migrate.js`，可依序套用 `backend/db/migrations/*.sql`
- Supabase：建立新專案 `ggb-prod`，取得 API keys

---

## 2026-05-30（販售功能）

### 前台（Next.js / frontend）
- 新增販售上架頁（`/sell/new`）：蝦皮式規格編輯，圖片上傳至 Supabase Storage `marketplace`
- 新增販售賣家收款/私下交易設定（`/sell/settings`）
- 新增販售訂單流程頁（`/sell-orders/[id]`）：step 流程 + 付款證明圖片上傳
- 私聊統一（exchange + marketplace 共用 `/messages`）

### 後台（Next.js / backend）
- 新增市集假資料 seed API：`/api/admin/marketplace/seed`

### DB Migrations
| Migration | 說明 |
|---|---|
| 171 | listing 額外欄位 |
| 174 | Storage bucket `marketplace` 與權限 |
| 175 | 非金流訂單、賣家收款資訊、販售私聊表、建立/取消訂單 RPC |
| 176 | 訂單 step 流程 RPC + system message + notifications |
| 177 | marketplace_message 通知 link 修正 |

---

## 本機開發環境

| 服務 | Port |
|---|---|
| 前台 | 3000 |
| 後台 | 3001 |

**注意**：`.env.local` 不進 git，換電腦需重新設定。正確 Supabase 專案：`akdqleelvqvjhjnfkpfq`
