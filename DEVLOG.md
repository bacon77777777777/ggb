# Dev Log
 
## 2026-05-30
 
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
