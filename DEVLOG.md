# Dev Log

## 2026-07-01

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
- 恭喜獲得彈窗（`GachaResultModal` / `TicketSelectionFlow`）圖片載入失敗 fallback 到 `item_defaulet.png`；切換獎項時重置錯誤狀態
- 移除會員個人頁頂部私訊圖標（MessageCircle）

### 後台（Next.js / backend）

**用戶行為報表**
- 新增 `/reports/behavior` 頁面：熱門搜尋字 TOP15、最多點擊 series TOP15、點擊→抽轉化率、DAU 表
- API：`GET /api/admin/reports?tab=behavior`，查詢 `user_events` 資料

**廠商統編**
- 上架表單（`/products/new`、`/products/[id]`）加入廠商下拉 + 統編顯示
- CSV 批量匯入（`CsvImportWizard`）加入廠商下拉選擇
- `detectSeries` 工具：存檔時若 series 空白，自動用 `series_keywords` ILIKE 偵測填入

**儀表板修正**
- 分類抽獎次數圓餅圖改用 `type` 欄位（轉蛋/一番賞等），不再顯示「未分類」

**其他 UI 修復**
- CSV Wizard 遮罩用 `createPortal` 掛到 `document.body`，修復 `transition-all` stacking context 問題

### DB / Supabase

**Migrations**
- `211`：排行榜與跑馬燈假數據兜底（draw_records < 20 時回傳示範數據）
- `212`：自動偵測並填入現有商品 series 欄位
- `213`：`get_popular_series` RPC（全平台熱門 series）
- `214`：清除 series 欄位中的商品形式類別（盒玩/雜貨/模型/一番賞），只保留 IP 名稱
- `215`：排行榜 RPC 改從 `public.users.avatar_url` 讀取個人頭像（原本錯讀 auth.users meta）
- `216`：排行榜假數據頭像改為 `/images/avatar/01~08.png` 輪流分配

**Series 正確性**
- `series` 欄位只放 IP 名稱（鬼滅之刃、初音未來等），偵測不到 IP 則留 NULL
- 補充 `series_keywords`：葬送的芙莉蓮、小小兵、轉生史萊姆、搖曳露營、米飛兔、防風少年等
- 移除格式類別 keyword（一番賞、cassette）

### 部署狀態
- 今日 commit 最高達到 `9ec7cbb`，Vercel Hobby 方案每日 100 次部署上限已達，frontend 停在 `aef7e84`
- 明日重置後自動觸發，或手動 Redeploy

### 本機環境問題排查（當日補記）

**問題：本機前台顯示舊 GachaGo 資料**
- 根因：`frontend/.env.local` 和 `backend/.env.local` 一直指向舊 GachaGo Supabase 專案（`qgziszozkdskdstexsvw`），Vercel 生產環境則設有正確的新專案（`akdqleelvqvjhjnfkpfq`），兩邊從未同步
- 解法：更新兩個 `.env.local` 的 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 指向正確專案

**問題：首頁一級 tabs 閃爍跳動**
- 根因：`FeatureFlagsContext.tsx` 的 `DEFAULT_FLAGS` 全部預設 `true`，頁面初始渲染顯示所有 tab，等 DB 回傳後才縮回正確值（只有 gacha: true）
- 解法：`DEFAULT_FLAGS` 全部改為 `false`，初始不顯示 tab，DB 載入後才渲染正確狀態

**注意事項**
- `.env.local` 不進 git，換電腦需重新設定
- Supabase anon key 和 service role key 從 Supabase Dashboard → Project Settings → API 取得
- 正確 Supabase 專案：`akdqleelvqvjhjnfkpfq`

### 本機開發
- 前台：3000
- 後台：3001

---

## 2026-05-30
11
### 本次目標
- 完成「販售」的可上線版本：平台不碰金流，只提供下單→付款確認→出貨→收貨的流程與留痕/管理。
- UI 盡量比照既有一番賞商品呈現，不自創風格。
- 交換與販售共用同一套私聊頁面與私訊列表。
 
### 前台（Next.js / frontend）
- 新增販售上架頁（蝦皮式）：
  - 路徑：`/sell/new`
  - 規格編輯改為獨立頁：`/sell/new/specs`（不使用彈窗抽屜）
  - 草稿使用 sessionStorage：`sell:new:draft:v1`
  - 圖片支援相簿上傳與拍照，上傳至 Supabase Storage bucket：`marketplace`
- 新增販售賣家收款/私下交易設定：
  - 路徑：`/sell/settings`
  - 以 `marketplace_seller_profiles` upsert 保存轉帳資訊與私下交易說明（下單後才會顯示，避免公開被爬）
- 新增販售訂單流程頁（非金流）：
  - 路徑：`/sell-orders/[id]`
  - 支援 step 流程與付款證明圖片上傳，並提供「私聊」入口
- 販售詳情下單調整：
  - 不扣代幣、不走金流，改呼叫 RPC 建立訂單並保留庫存
  - 下單成功導向：`/sell-orders/{orderId}`
  - 私聊入口統一路徑：`/messages/sell:<listingId>--<sellerId>`
- 私聊統一（交換 + 販售共用同一 UI）：
  - 列表：`/messages` 同時整合 exchange 與 marketplace threads
  - 對話：`/messages/[id]` 依 threadId 前綴分流讀寫資料表
  - 舊路徑相容：`/sell-messages/[id]` 保留，但只做 redirect 到統一私聊路徑
- Navbar：
  - 新增標題對應：`/sell/new` →「上架商品」、`/sell/new/specs` →「新增規格」
  - 「全部已讀」同時涵蓋 `exchange_message` + `marketplace_message`
 
### 後台（Next.js / backend）
- 新增市集假資料 seed：
  - API：`/api/admin/marketplace/seed`
  - 後台頁面加入 seed 入口：`/marketplace`
 
### DB / Supabase（僅針對販售新增，不動既有一番賞/抽獎）
- migrations（backend/db/migrations）：
  - 171：listing 額外欄位（note/images 等）
  - 174：Storage bucket `marketplace` 與權限
  - 175：非金流訂單、賣家收款資訊、販售私聊表、建立/取消訂單 RPC
  - 176：補齊訂單 step 流程 RPC（mark paid / confirm / shipped / received）並寫入 system message + notifications
  - 177：修正 marketplace_message 通知 link，改指向統一私聊 `/messages/sell:<listing_id>--<sender_id>`
 
### 部署狀態
- 已推送至 GitHub main：
  - `1bf32f5`：feat: 販售非金流訂單流程與上架UI
  - `f1e6465`：fix: Next.js 15 params typing for sell-messages redirect
- 修正 Vercel build 失敗：
  - 問題：Next.js 15 App Router `params` 型別需為 `Promise<...>`，`/sell-messages/[id]` 之 props 型別不符造成 type error
  - 修正：將 page 改為 `async` 並 `await params`
 
### 已知警告（不會阻斷 build）
- 多個 lockfile 導致 Next.js 推斷 workspace root 警告：repo root 與 `frontend/` 都有 `package-lock.json`
- ESLint hooks deps / no-unused-vars / no-img-element 等 warnings（目前不影響編譯）
 
### 本機開發
- 前台：3000
- 後台：3001
