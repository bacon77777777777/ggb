# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

GGB（吉吉比）是台灣線上轉蛋平台。廠商供貨、平台出貨。兩個獨立 Next.js 15 App Router 應用共用同一個 Supabase 資料庫：

- **`frontend/`** — 前台玩家介面（轉蛋機、倉庫、儲值、排行榜）
- **`backend/`** — 後台管理系統（商品/訂單/廠商/財務/AI 組織）

資料庫：Supabase（PostgreSQL）。直連字串：`postgresql://postgres.akdqleelvqvjhjnfkpfq:...@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres`

## Commands

```bash
# Backend（後台）
cd backend
npm run dev        # 啟動開發伺服器（port 3000，-H 0.0.0.0）
npm run build      # 建置
npm run lint       # ESLint

# Frontend（前台）
cd frontend
npm run dev        # 啟動開發伺服器
npm run build
npm run lint
npm run test:e2e          # Playwright E2E
npm run test:e2e:ui       # Playwright UI 模式

# 資料庫 migration（直接在 psql 執行，不需手動跑）
psql <SUPABASE_DB_URL> -f backend/db/migrations/<n>_name.sql
```

## Architecture

### 兩個獨立 Next.js 應用

**Frontend** (`frontend/`) 是玩家端 PWA，以 Supabase Auth 做身份驗證（`@supabase/ssr`）。玩家登入後 cookie 由 middleware 管理。

**Backend** (`backend/`) 是管理後台，**不使用** Supabase Auth，改用自製 JWT-like token（`backend/lib/adminSession.ts`）：HMAC-SHA256 簽章存在 `admin_session` cookie，每日午夜台灣時間到期。所有後台 API route 都呼叫 `requireAdminSession()` 驗證。

### Backend 關鍵 lib

| 檔案 | 用途 |
|------|------|
| `lib/supabaseAdmin.ts` | `getSupabaseAdmin()` — service role client，繞過 RLS，後台所有寫入都用這個 |
| `lib/adminSession.ts` | 管理員 session 簽章與驗證 |
| `lib/requireAdmin.ts` | API route 驗證 helper |
| `lib/logAdminAction.ts` | 寫 `action_logs` 稽核軌跡 + 取 client IP |
| `lib/gbBro.ts` | GB哥 LINE AI 助手（Claude Haiku + tool loop，27 個工具） |
| `lib/ecpay.ts` | 綠界 AIO 金流 CheckMacValue 計算 |
| `lib/ecpay_logistics.ts` | 綠界物流（CVS/宅配） |
| `lib/webhookIdempotency.ts` | ECPay callback 冪等性防護（`webhook_events` 表） |
| `lib/csAgent.ts` | 客服 AI agent（LINE 前台玩家訊息） |

### 資料庫重要設計

**token_ledger** 是 VIEW，不是實體表，UNION ALL 以下四個來源：
- `recharge_records` → type `recharge`（ECPay 真實付款）/ `marketing`（promotion/compensation）/ `test`
- `draw_records` → type `draw`（抽獎消耗）、`dismantle`（拆解退還）
- `token_adjustments` → type `manual`（GB哥或管理員手動調整）

**重要**：手動補幣必須寫 `token_adjustments`，不可寫 `recharge_records`（後者是 ECPay 對帳基礎）。

**機器人排除**：所有財務/分析 query 必須加 `WHERE (is_bot IS NULL OR is_bot = false)` 或使用 `getRealUserIds()`。

**execute_readonly_sql RPC**：GB哥和 cron agent 查詢用此函數，僅允許 SELECT/WITH，由 service_role 呼叫。

### Migrations

編號遞增：`backend/db/migrations/<n>_name.sql`。每次 DB 變更都建新 migration 檔，直接用 psql 執行，**不需請使用者手動跑**。

**雙環境同步原則（PROD / STG）：**

| 環境 | DB | Supabase project |
|------|-----|-----------------|
| PROD | `akdqleelvqvjhjnfkpfq`（ap-northeast-2） | admin.ggb.com.tw |
| STG  | `zqxxmdbvtwuiocebaxvk`（ap-southeast-1） | staging.ggb.com.tw |

- **所有 migration 執行後必須同時套兩個環境**（除非 STG 明確不需要某功能）
- STG 不需要：GB哥 AI 基礎建設（line_conversations / gb_pending_actions / capability_gaps）
- PROD psql 連線：`PGPASSWORD="..." psql -h aws-1-ap-northeast-2.pooler.supabase.com -p 5432 -U "postgres.akdqleelvqvjhjnfkpfq" -d postgres`
- STG psql 連線：`PGPASSWORD="..." psql -h aws-1-ap-southeast-1.pooler.supabase.com -p 5432 -U "postgres.zqxxmdbvtwuiocebaxvk" -d postgres`（port 5432 若失敗改 6543）
- **RLS 注意**：新建 table 若有 `ENABLE ROW LEVEL SECURITY` 必須同步建 policy，不然前台讀不到（會靜默返回空陣列）
- 定期 diff 指令（確認兩環境 table 一致）：
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;
  SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY 1;
  ```

### AI 組織架構（Cron Agents）

所有 AI 單位為 `backend/app/api/cron/` 下的 API routes，由 pg_cron 定時呼叫：

| Agent | 排程（台灣時間） | 職責 |
|-------|----------------|------|
| `news-agent` | **每 20 分鐘** | 爬蟲三語 RSS → Claude 改寫 → 寫入 `news` 表，最多 12 篇/次 |
| `daily-report` | 08:00 | 每日早報（待處理事項） |
| `cfo-agent` | 08:30 | 代幣對帳、收入趨勢、廠商月結 |
| `cmo-agent` | 09:00 | 行銷日報 + 跨部門行動建議 |
| `supply-chain` | 10:30、22:30 | 超時出貨、零庫存警示 |
| `health-check` | 每 10 分鐘 | DB 連線、ECPay 錯誤率、尖峰零交易 |
| `market-intel` | 週一 11:00 | 競品爬取分析（8 家） |
| `generate-content` | 09:00 | AI 文案草稿生成 |
| `risk-scan` | 定時 | 風控掃描 |

所有 cron route 驗證 `x-cron-secret` header（對應 `CRON_SECRET` env）。

**pg_cron secret 注意**：Supabase pg_cron 執行環境無法使用 `current_setting('app.cron_secret')`，所有 cron job SQL 必須把 secret 字串 hardcode 在 SQL 內，不可用動態讀取。

**agent_events 事件匯流排**：任何 AI 單位偵測到跨部門信號 → INSERT `agent_events` + 推 LINE → 後台「事件中心」（`/agent-events`）顯示待處理。

### 情報系統（News）

- **資料表**：`news`（id, title, summary, content, image_url, source_url, category, tags, is_active, view_count）
- **後台管理**：`backend/app/news/page.tsx` — 顯示全部文章（含 news-agent 自動生成），可批量上架/下架/刪除
- **前台**：`frontend/app/news/` — 列表 + 內頁留言/讚
- **前台 API**（`frontend/app/api/news/[id]/like|comments`）需要 `SUPABASE_SERVICE_ROLE_KEY` 在前台 env
- **bot 互動**：每篇新文章寫入後呼叫 `seed_bot_engagement_for_article(id)` DB function，種 2~5 則留言、3~12 個讚
- **圖片 fallback**：og:image 抓不到時用 `NEXT_PUBLIC_FRONTEND_URL/images/banner_defaulet.png`（注意檔名 typo）

### GB哥（LINE AI 助手）

- 入口：`backend/app/api/line/webhook/route.ts`
- 核心：`backend/lib/gbBro.ts`，`askGbBro(question, lineUserId)` 函數
- 群組訊息需含「gb哥」觸發；個人訊息由 `ADMIN_LINE_IDS` 管控
- 對話記憶：`line_conversations` 表，30 分鐘 TTL，12 則上下文
- Tool loop：最多 5 輪，`stop_reason === 'end_turn'` 才回覆
- **執行原則**：收到指令立即執行回報，絕不把問題丟回給老闆

### 金流（ECPay）

- 付款：`backend/app/api/payment/ecpay/` — 建立訂單 → callback 驗簽 → 補 tokens
- 物流：`backend/app/api/logistics/` — CVS 地圖選取 → 物流單建立 → callback 更新追蹤號
- Callback 冪等性：`webhookIdempotency.ts` 在 `webhook_events` 表檢查重複，防止重複入帳

### Frontend Auth

- `frontend/lib/supabase/` — `createClient()` 使用 `@supabase/ssr` browser client
- `frontend/middleware.ts` — 攔截 auth code → 轉 `/auth/callback`
- `AuthContext` 封裝 session 狀態，`FeatureFlagsContext` 控制功能開關

## Environment Variables

後台（`backend/.env.local`）關鍵變數：

```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY    # 後台所有寫入操作
ADMIN_SESSION_SECRET         # 管理員 session HMAC key
ECPAY_MERCHANT_ID / HASH_KEY / HASH_IV
ECPAY_LOGISTICS_MERCHANT_ID / HASH_KEY / HASH_IV
LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN
NOTIFY_TARGET_ID / NOTIFY_TARGET_TYPE   # LINE 推播目標
CRON_SECRET                  # pg_cron 呼叫 API 的驗證密碼
ANTHROPIC_API_KEY            # GB哥 + Cron Agent Claude 呼叫
ADMIN_LINE_IDS               # 允許私訊 GB哥 的 LINE user IDs（逗號分隔）
NEXT_PUBLIC_FRONTEND_URL     # 前台域名（https://www.ggb.com.tw），用於 news-agent 圖片 fallback URL
```

前台（`frontend/.env.local`）同樣需要：
```
SUPABASE_SERVICE_ROLE_KEY    # 前台 API routes（留言/讚）讀寫需要 service role 繞過 RLS
```

## 清全站資料（重置腳本）

腳本位置：`backend/db/migrations/288_cleanup_before_launch.sql`

**觸發條件**：老闆明確說「清全站資料」才執行，不可主動執行。執行前必須列出清單讓老闆確認。

### 清除（TRUNCATE / DELETE）
- 商品/廠商/輪播圖：`products`、`product_prizes`、`suppliers`、`banners`
- 所有真實用戶的交易記錄：`draw_records`、`recharge_records`、`orders`、`order_items`、`token_adjustments`
- 用戶行為：`user_event_logs`、`user_events`、`visit_logs`、`search_logs`、`notifications` 等
- 用戶進度：`user_badges`、`user_coupons`、`user_titles`、`referrals`、`daily_check_ins` 等
- 市場：`sell_*`、`exchange_*`、`marketplace_*`
- `webhook_events`（ECPay 冪等記錄）、`leaderboard_bot_daily_stats`（機器人排行榜分數，重上線後自動補回）
- 所有真實用戶帳號（`is_bot IS NULL OR is_bot = false`），只保留機器人帳號

### 永不清除（保留）
- `admins`（管理員清單與權限）
- `dev_logs`（開發日誌，永久保存）
- `feature_flags`、`platform_settings`（設定）
- `users WHERE is_bot = true`（機器人帳號本身保留，排行榜用）
- ⚠️ `draw_records`（機器人抽獎記錄**會被清除**，因 products CASCADE）
- **AI 記憶與經驗（全部保留，養 AI 的資產）**：
  - `line_conversations`（GB哥對話記憶）、`agent_events`（事件歷史）
  - `action_logs`（稽核軌跡）、`content_drafts`（AI 文案）
  - `gb_pending_actions`、`capability_gaps`（GB哥 能力缺口）
  - `settlement_snapshots`（月結快照）
  - `market_intel_analysis`、`competitor_*`（競品分析）
  - `tag_daily_stats`、`meeting_logs`、`tasks`

### Storage 清除（Supabase 圖片）

**所有「預設圖片/頭像」都是前台本機靜態檔（`frontend/public/images/`），不在 Supabase storage，清除時無需保留任何東西。**

清除兩個 bucket（呼叫後台 API，需 super_admin 身份）：
```bash
# products bucket（商品圖、品項圖）
curl -X POST https://admin.ggb.com.tw/api/admin/storage/clear-products \
  -H "Content-Type: application/json" \
  -b "admin_session=<session>" \
  -d '{"bucket":"products"}'

# banners bucket（輪播圖）
curl -X POST https://admin.ggb.com.tw/api/admin/storage/clear-products \
  -H "Content-Type: application/json" \
  -b "admin_session=<session>" \
  -d '{"bucket":"banners"}'
```

`exchange-receipts` bucket：**永遠不清**（對帳憑證保留）。
`avatars`、`marketplace` bucket：目前為空，有需要時可清。

### 執行後
腳本自動寫入一筆 `dev_logs`（type=improvement, title=全站資料清除）記錄此次操作。

**執行後必做**：新增商品後，在本 repo 執行補回腳本：
```bash
cd backend && npx tsx scripts/seed_bot_draws.ts
```
補回機器人假抽獎記錄（約 8,000 筆）。機器人帳號本身保留，只有 draw_records 需要重建。排行榜分數隔天 cron 自動補回，不需手動處理。

---

## 重要慣例

- 所有 migration 執行後 commit 並 push（不需詢問）
- **推版前必須更新 `DEVLOG.md`**：在對應日期下記錄本次變更的功能、修正、migration，再 commit + push
- **推版節奏**：完成功能後不自動推版，等老闆本地測試完、明確說「推版」再推
- 後台 API 統一用 `getSupabaseAdmin()`，前台用 `createClient()`（anon key）
- 財務對帳公式：`expected = recharge_total + manual_total - draw_total - refund_deducted`
- 稽核軌跡：所有管理員操作都呼叫 `logAdminAction()`
- `is_bot` 排除：所有統計/報表都過濾機器人帳號

## 機器人帳號說明

系統內有兩套機器人，**都不是真實玩家，不可用於財務對帳或行銷分析**：

### 排行榜靜態 bot（migration 236）
- 純 hardcode 在 `get_leaderboard_whales` / `get_leaderboard_draws` 等 RPC 內
- 排行榜不足 20 名時自動補位，DB 裡無對應 user record，純顯示用

### 虛擬玩家帳號（`ggb_bot_XXX_TIMESTAMP@ggb-internal.io`）
- 共約 100+ 個真實 user 帳號，全部標記 `is_bot = true`
- email 格式：`ggb_bot_NNN_毫秒時間戳@ggb-internal.io`
- **用途**：讓排行榜、活躍人數等公開數據在平台初期看起來有人氣
- **由另一台電腦的 Claude Code 自動建立**（外部腳本，非本 repo 程式碼）
- `ensure_bot_daily_stats()` DB 函數每天計算它們的假排行榜分數
- 有真實的 `draw_records`（共 8000+ 筆），是腳本模擬抽獎寫入的
- **絕對不能刪除**：會破壞排行榜人氣數據；若要下架請改 `is_bot = false`（但這樣會污染統計）
