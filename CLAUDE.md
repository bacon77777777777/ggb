# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

GGB（吉吉比）是台灣線上轉蛋平台。廠商供貨、平台出貨。兩個獨立 Next.js 15 App Router 應用共用同一個 Supabase 資料庫：

- **`frontend/`** — 前台玩家介面（轉蛋機、倉庫、儲值、排行榜）
- **`backend/`** — 後台管理系統（商品/訂單/廠商/財務/AI 組織）

資料庫：Supabase（PostgreSQL）。直連字串：`postgresql://postgres.akdqleelvqvjhjnfkpfq:...@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres`

## ⚠️ 工作目錄只有一個：`/Users/bacon/ggb`

**一律直接在 `/Users/bacon/ggb` 作業。不要另外 clone 到別的目錄。**
（老闆的每一台電腦都適用，不是只有其中一台。）

老闆說「clone dev 最新版本下來，並保留本地 env」時，要做的是**把現有目錄拉到最新**，
不是 `git clone` 到新資料夾：

```bash
cd /Users/bacon/ggb
git fetch origin && git reset --hard origin/dev
```

`.env.local` 沒有被 git 追蹤，這樣拉更新**不會碰到它**，所以「保留本地 env」自然成立
（不放心就先備份再比對，但不需要為了它另開目錄）。未追蹤的本地素材（切圖、zip 等）
也會原地保留 —— 但**不要跑 `git clean`**，那會把它們清掉。

**為什麼寫這條**：2026-08-12 我把那句話照字面做成 `git clone` 到 `/Users/bacon/ggb-dev`，
整天的工作與 dev server 都跑在那邊，結果變成兩份要同步的複本，老闆打開 VSCode
看到的還是舊的那份。多開目錄沒有任何好處，只會製造「改到一半發現改錯地方」。
該目錄已於 2026-08-13 刪除。

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
`token_adjustments.category` 是會計分類（migration 582）：`marketing` 行銷／補償｜`correction` 帳務更正｜
`internal` 內部測試｜`shipping_fee` 運費｜`sell` 商城｜`marketplace` 交易所｜`slot` 機台｜`other`。
程式寫入時**明確帶 category**；沒帶的由 BEFORE INSERT trigger 照 `created_by`／`reason` 前綴判
（`classify_token_adjustment()`）。後台「對帳報表 → 手動調整明細」（`/reports/adjustments`）依此分類列出、可匯出。
銀行轉帳／現金／LINE Pay 手動入帳已停用（用戶儲值一律走綠界），會員頁「手動補幣」只剩行銷贈點／補償／測試／帳務更正。

**機器人排除**：所有財務/分析 query 必須加 `WHERE (is_bot IS NULL OR is_bot = false)` 或使用 `getRealUserIds()`。

**execute_readonly_sql RPC**：GB哥和 cron agent 查詢用此函數，僅允許 SELECT/WITH，由 service_role 呼叫。

### Migrations

編號遞增：`backend/db/migrations/<n>_name.sql`。每次 DB 變更都建新 migration 檔，**由 Claude 直接用 psql 執行，不需使用者手動跑**。

**Claude 負責執行所有 migration**：每次建完 migration 檔，Claude 必須主動在 STG 和 PROD 兩個環境都執行，不可只跑其中一個，也不可請使用者自行執行。

**雙環境同步原則（PROD / STG）：**

| 環境 | DB | Supabase project |
|------|-----|-----------------|
| PROD | `akdqleelvqvjhjnfkpfq`（ap-northeast-2） | admin.ggb.com.tw |
| STG  | `zqxxmdbvtwuiocebaxvk`（ap-northeast-1） | staging.ggb.com.tw |

- **所有 migration 執行後必須同時套兩個環境**（除非 STG 明確不需要某功能）
- STG 不需要：GB哥 AI 基礎建設（line_conversations / gb_pending_actions / capability_gaps）
- PROD psql 連線：`PGPASSWORD="OhpiiPc5OshSrtHt" psql -h aws-1-ap-northeast-2.pooler.supabase.com -p 5432 -U "postgres.akdqleelvqvjhjnfkpfq" -d postgres`
- STG psql 連線：`PGPASSWORD="pdsCNbpWjJb4ikpR" psql -h aws-1-ap-northeast-1.pooler.supabase.com -p 5432 -U "postgres.zqxxmdbvtwuiocebaxvk" -d postgres`
- **RLS 注意**：新建 table 若有 `ENABLE ROW LEVEL SECURITY` 必須同步建 policy，不然前台讀不到（會靜默返回空陣列）
- 定期 diff 指令（確認兩環境 table 一致）：
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;
  SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY 1;
  ```

### AI 組織架構（Cron Agents）

所有 AI 單位為 `backend/app/api/cron/` 下的 API routes，由 pg_cron 定時呼叫：

> ⚠️ **排程以資料庫為準，不要照本表複誦**。本表為 2026-08-03 對 PROD `cron.job` 的核對結果；
> 排程改過而文件沒跟上是常態（此表先前寫 news-agent「每 20 分鐘、12 篇/次」，實際是 6 小時 3 篇）。
> 查詢：`SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`
> pg_cron 存的是 **UTC**，下表已換算為台灣時間（+8）。

| Agent（jobname） | 排程（台灣時間） | 職責 |
|-------|----------------|------|
| `news-agent-6h` | 02:00 / 08:00 / 14:00 / 20:00（每 6 小時） | 爬 RSS 與網頁 → Claude 改寫 → 寫入 `news` 表，**最多 3 篇/次**（一天 12 篇） |
| `daily-line-report` | 08:00 | 每日早報（待處理事項） |
| `cfo-agent-daily` | 08:30 | 代幣對帳、收入趨勢、廠商月結 |
| `cmo-agent-daily` | 09:00 | 行銷日報 + 跨部門行動建議 |
| `risk-scan-morning` / `risk-scan-evening` | 09:00、21:00 | 風控掃描 |
| `ai-cto-morning` / `ai-cto-evening` | 10:00、22:00 | 技術面巡檢 |
| `supply-chain-morning` / `-evening` | 10:30、22:30 | 超時出貨、零庫存警示 |
| `auto-deliver` | 11:00 | 自動出貨 |
| `platform-monitor` | 02:00 / 08:00 / 14:00 / 20:00 | 平台狀態監測 |
| `ecpay-reconcile` | 每 3 小時 | 金流對帳 |
| `health-check` | 每 10 分鐘 | DB 連線、ECPay 錯誤率、尖峰零交易 |
| `flag-pending-recharge` | 每 15 分鐘 | 標記待處理儲值 |
| `risk-check` / `hourly-risk-check` | 每小時 :00 / :30 | 風控即時檢查 |
| `market-intel-weekly` | 週日 11:30 | 競品爬取分析 |
| `competitive-intel` / `dormant-wakeup` | 週一 10:00 | 競品情報 / 沉睡用戶喚醒 |
| `market-discovery-monthly` / `monthly-settlement-snapshot` | 每月 1 日 10:00 | 市場探索 / 月結快照 |

**`generate-content` 目前沒有排程**（route 存在但無對應 cron job），需要時才手動觸發。

所有 cron route 驗證 `x-cron-secret` header（對應 `CRON_SECRET` env）。

**pg_cron secret 注意**：Supabase pg_cron 執行環境無法使用 `current_setting('app.cron_secret')`，所有 cron job SQL 必須把 secret 字串 hardcode 在 SQL 內，不可用動態讀取。

**agent_events 事件匯流排**：任何 AI 單位偵測到跨部門信號 → INSERT `agent_events` + 推 LINE → 後台「事件中心」（`/agent-events`）顯示待處理。

### 抽獎模組（Machine Theme）

抽獎模組主題在**兩個地方**定義，新增模組時兩個都要改：

1. **全站預設**：`backend/app/settings/modules/page.tsx` → `PRODUCT_TYPES[].themes[]`
2. **各別商品覆蓋**：`backend/app/products/[id]/page.tsx` → `MODULE_OPTIONS`

前台渲染：
- `frontend/components/shop/GachaProductDetail.tsx` → `MACHINE_COMPONENTS`（轉蛋用）
- `frontend/components/gacha-themes/index.tsx` → `MachineTheme` type + `THEME_MAP`（其他類型用）

現有轉蛋模組：
- `gacha_classic`：物理蛋球掉落（GachaMachineVisual）
- `gacha_mode2`：旋鈕式轉蛋機（GachaMachineMode2，圖素在 `gacha/mode2/`）
- `gacha_mode3`：金光閃閃機台（GachaMachineMode3，圖素在 `gacha/mode3/`，同 mode2 邏輯換主圖）
- `gacha_mode4`：狗狗蛋箱（GachaMachineMode4，圖素在 `gacha/mode4/`，無旋鈕/switch，有自訂 box.svg + hole.svg 遮罩）
- `gacha_mode5`：紫金旋鈕機台（GachaMachineMode5，圖素在 `gacha/mode5/`，同 mode3 邏輯換主圖；**機台上不畫按鈕**，推一下／立即轉蛋／試試看在 `GachaProductDetail` 的固定底部操作欄，照盒玩 blindbox_mode5 的做法）

### 情報系統（News）

**news-agent 與前台情報頁是同一批資料**：agent 是唯一的內容產生者，
前台 `/news` 與後台文章管理都只是讀 `news` 表，沒有其他來源。

- **產出節奏**：每 6 小時一次、每次最多 3 篇 → 一天 12 篇
- **來源**：RSS（電ホビ／PRTimes／Animate Times／巴哈 GNN）+ HTML 解析（玩具人 toy-people.com，站上宣告的 RSS 實際 404）+ Google News 查詢
- **分類**：`figure` 公仔景品｜`gacha` 轉蛋｜`toy` 盒玩周邊｜`ichiban` 一番賞｜`tcg` 卡牌（分不出類時預設 `toy`；舊值 `general`/`blindbox` 已併入 `toy`）
- **改寫規則**：標題與內文一律由 Claude 原創重寫，**繁中來源尤須重組句型**（照抄即侵權）；改寫前先用來源標題擋重複，避免重複文章浪費呼叫
- **浮水印**：四角模板比對（`lib/dengekiWm.ts`），偵測到才在該角落蓋 GGB logo（`lib/newsBranding.ts`，agent 與回填腳本共用）。**不可用會退回固定角落的 `detectWatermarkCorner()`** —— 蓋錯角等於浮水印照樣露出
- **資料表**：`news`（id, title, summary, content, image_url, source_url, category, tags, is_active, view_count）
- **後台管理**：`backend/app/news/page.tsx` — 顯示全部文章（含 news-agent 自動生成），可批量上架/下架/刪除
- **前台**：`frontend/app/news/` — 列表 + 內頁留言/讚
- **前台 API**（`frontend/app/api/news/[id]/like|comments`）需要 `SUPABASE_SERVICE_ROLE_KEY` 在前台 env
- **bot 互動**：每篇新文章寫入後呼叫 `seed_bot_engagement_for_article(id)` DB function，種 2~5 則留言、3~12 個讚
- **圖片 fallback**：og:image 抓不到時用 `NEXT_PUBLIC_FRONTEND_URL/images/banner_defaulet.png`（注意檔名 typo）

**⚠️ 取材成本原則：不得引入新的付費服務**

情報系統的所有取材與圖片處理，一律只能用「已經在付的東西」完成：

| 允許 | 不允許 |
|------|--------|
| 公開 RSS / 公開網頁 HTML 解析 | 付費爬蟲 API、付費資料源 |
| 既有的 Claude Haiku 改寫（已在預算內） | 圖片生成 API（DALL·E / Midjourney 等） |
| 本地 sharp 影像處理（去浮水印、蓋 logo、壓縮） | 付費影像處理服務 |
| R2 儲存（既有 bucket） | CAPTCHA 破解服務 |
| 官方免費 API（申請 key 即可用者） | 任何需要月費／用量計費的新服務 |

**同時不繞過站方的存取控制**：Cloudflare Turnstile、CAPTCHA 等是站方刻意部署的防護，
不做繞過（例：130point.com、cardrush-sports.jp 皆為 Turnstile 保護，一律放棄該來源）。

浮水印處理走本地模板比對（`backend/lib/dengekiWm.ts`），偵測到才蓋 GGB logo，零成本。

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

### 匯入外站商品（基礎資料）

老闆常指定「去某站抓 N 件商品進來當基礎資料」。**一律走以下四步，不要每次重寫一套。**

**前提**：只讀公開頁面、以一般訪客身分取材，**不繞過任何存取控制**
（Cloudflare Turnstile／CAPTCHA／需登入的頁面一律放棄該來源），
不引入任何付費服務（同情報系統的取材成本原則）。

**① 取材** — 先判斷站型，用最省的方式：

| 站型 | 作法 | 實例 |
|------|------|------|
| SSR / HTML | `curl` 抓 HTML，正則解析 og:title／og:image／賞等區塊 | fortune-cookie.tokyo（`.rarity-section` + `data-name` / `data-image-url`） |
| Next.js SSR | 解析 `__NEXT_DATA__` 的 `pageProps` | clove（oripa.clove.jp） |
| SPA + 同源 API | Playwright 開站 → 攔訪客本來就會拿到的 token → `page.evaluate` 打同源 API | 潮玩家（`/api/products?type=0\|1\|2`） |

Playwright 走 `frontend/node_modules/playwright`（後台沒裝）。
**暫存檔一律放 `backend/.tmp/`**（腳本要能 resolve `backend/node_modules`，
放系統 tmp 會找不到 sharp／pg），做完刪掉。

**② 產 selection.json** — 統一格式，後面兩支腳本都吃這個：

```jsonc
{ "src": "slimetoy:839",           // <站名>:<對方商品 id>，可追溯
  "type": "ichiban|custom|blindbox|card",
  "category": "一番賞|自製賞|盒玩|抽卡",
  "name": "...", "price": 350, "image": "<外站主圖網址>",
  "total_count": 70,               // 不含最後賞
  "prizes": [{ "level": "A賞", "is_last": false, "name": "...", "image": "...", "qty": 2 }] }
```

**③ 搬圖 + 蓋 logo** — `npx tsx scripts/import_competitor_products.ts <selection.json> <out.json>`

- **絕不留外站網址**：對方換檔名或擋 referer 我們就整批破圖，且玩家每次開商品頁都會把 referer 送過去
- R2 是 STG／PROD 共用，圖只上傳一次、兩邊寫同一個網址
- 主圖走 `lib/productBranding.ts` 的 `coverSourceLogo()`：左上角壓白墊 + GGB logo
  （白墊 36.1% × 13.2%、logo 33.4% 寬貼在 2.68%/1.07%，比例量自老闆手修的成品，
  換來源尺寸也蓋得一樣）。**只有主圖蓋，品項圖不處理**
- 品項圖原檔上傳，超過 400KB 才轉 WebP

**④ 寫入兩環境** — `npx tsx scripts/insert_competitor_products.ts <out.json> [--apply]`
（不加 `--apply` 是乾跑；注意 identity 序號乾跑也會被吃掉，實際 id 會往後跳）

- **一律 `status='pending'`（待上架）+ `is_active=false`**。
  ⚠️ 不可寫 `active`：`trg_auto_seal_on_publish` 看到 active 會立刻排籤封存，
  之後 `guard_sealed_product` 擋掉所有賞項異動，老闆連數量都改不了
- `supplier_id = 3`（吉吉比，兩環境都有）
- 機率依 migration 516：品項數量 ÷ `total_count` × 100
- 最後賞：`level='最後賞'`、`is_last_one=true`、`probability=0`、**不進 `total_count`**
  （前台配率表跳過它，另走 LastOne 獨立卡片與演出）

**⑤ 驗收 SQL**（兩環境都跑）：缺主圖／缺品項圖數、機率加總是否 100、
`total_count` 是否等於非最後賞的 `sum(total)`、`product_ticket_seals` 應為 0（沒被誤封存）。

**分類無法從 API 判斷時看主圖**：潮玩家一番賞與自製賞混在同一個 `type=0`、
卡片全掛「一番賞」標籤。判準是主圖上的品牌 —— 官方くじ品牌
（一番くじ／タイトーくじ／Happyくじ／FuRyu賞／トミカ賞／三麗鷗賞）算一番賞，
店家自組（潮玩賞／GK大合集／公仔大亂鬥／PSA卡／3C 抽獎）算自製賞。
用 sharp 拼 4×3 聯絡表逐張看，比一張張開快得多。

**日圓價格換算**：`コイン／pt × 0.22` 再取 5 的倍數（clove 2000pt → 440G）。
外文品名與換算價都要在 DEVLOG 標「上架前必須改名／覆核」。

已匯入批次的資料留在 `backend/scripts/*_import_data*.json`，可回溯每件商品的來源 id。

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

**執行後不需要補機器人抽獎紀錄**（`seed_bot_draws.ts` 已於 2026-08-05 移除）。

機器人在前台六個展示點全部走獨立資料來源，都不依賴 `draw_records`：

| 展示點 | 資料來源 |
|--------|----------|
| 排行榜（抽獎／課金） | `leaderboard_bot_daily_stats`，隔天 cron 自動補 |
| 玩家資訊小卡 | `user_titles` / `user_badges` |
| 情報頁留言／按讚 | `news_comments` / `news_likes` |
| 機台彈幕 | `slot_danmaku_bots` |
| 中獎跑馬燈 | `get_winning_records` 即時從上架商品組合（migration 460） |

**不要再往 `draw_records` 塞假抽獎**：那張表同時是庫存扣減、銷量統計
（`sync_product_sales` 沒有濾 `is_bot`）、以及公平性驗證逐籤比對的依據。
假抽獎會佔走真實籤號、灌水後台銷量，並讓玩家在驗證頁看到「與表不符」。

---

## 後台 UI 設計慣例（Design System — 絕對禁止自創畫面）

**動手前先看 `backend/components/` 與 `backend/components/ui/` 有沒有現成元件。**
清單如下（有這個元件就不准用 tailwind 自己組等效的東西）：

| 需求 | 用這個 | 不要寫 |
|------|--------|--------|
| 頁面外框 | `AdminLayout`（傳 `pageTitle`） | 自訂容器 |
| 內容卡片 | `PageCard` | `bg-white rounded-xl border...` |
| 資料表格 | `DataTable` + `type Column`（含排序、載入中、空狀態） | 手刻 `<table><thead>` |
| 列表工具列 | `SearchToolbar`（搜尋＋新增＋篩選＋密度＋欄位開關） | 自組 flex 工具列 |
| 彈窗 | `Modal`（`isOpen`/`onClose`/`title`） | `fixed inset-0` overlay |
| 刪除確認 | `ConfirmDialog` | `window.confirm()` |
| 文字輸入 | `ui/Input` | `<input className="w-full px-3 py-2 border...">` |
| 多行輸入 | `ui/Textarea` | `<textarea className=...>` |
| 下拉選單 | `ui/SelectField`（另有 `compact`） | `<select className=...>` |
| 檔案上傳 | `ui/FileInput` | `<input type="file" className=...>` |
| 按鈕 | `ui/Button`（`variant` / `size` / `isLoading`） | `<button className="px-4 py-2 bg-primary...">` |
| 標籤 | `ui/Badge`（`color`） | 自製小圓角標籤 |
| 開關 | `ui/Switch`（`checked`/`onCheckedChange`） | 自製 toggle |
| 空狀態 | `ui/EmptyState` | 自己寫「尚無資料」 |
| 骨架屏 | `ui/Skeleton`、`ui/TableSkeleton` | 自製灰塊 |
| 檔期設定 | `ScheduleFields`（時區換算正確，另有 `unlimitedToggle`） | 自刻 `datetime-local` |
| 日期 | `DatePicker` / `DateRangePicker` / `DateTimePicker` / `YearMonthPicker` | 生 input |
| 訊息提示 | `useToast()` → `toast('訊息')` / `toast('訊息', 'error')` | 自製浮層 |

其餘現成元件：`StatsCard`、`FilterTags`、`TagSelector`、`CopyableID`、`AlertDialog`、
`SortableTableHeader`、`CsvImportWizard`、`XlsxImportWizard`、`ShippingProgress`。

**⚠ 沒有對應元件時才寫 tailwind**，且必須沿用既有樣式：
主要按鈕 `px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60`、
次要按鈕 `px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors`。
**寫之前先確認上表真的沒有** —— 過去多次「自創畫面」都是因為只看了這幾行配方就動手，
沒去翻 `components/` 目錄。

**寫新頁面前必看參考**：`backend/app/slot/page.tsx`（列表 + 篩選 + modal）、`backend/app/slot/prizes/page.tsx`（同類型 CRUD）。

---

## 前台 UI 設計慣例

- **Loading 動畫**：一律使用 `ProductLoadingScreen`（`frontend/components/ui/ProductLoadingScreen.tsx`）或其相同邏輯（cycling IP character SVGs at `frontend/public/loading/1-8.svg` + framer-motion float）。**禁止自創 spinner、骨架屏或其他 loading 動畫**。
- **商品卡片**：猜你喜歡、相關商品、LP 底部等任何商品列表，一律使用 `ProductCard`（`frontend/components/ProductCard.tsx`）。不要自製商品卡。

---

## 前台文案原則：不要把技術術語丟給玩家

**任何會被玩家看到的字串，都不可出現路徑、欄位名、狀態碼、內部代號。**
玩家看到 `/events/slam-dunk` 不知道那是什麼，也點不了。

| 不可以 | 應該寫成 |
|--------|----------|
| `前往查看：/events/zetcho-rush` | `[前往查看活動資訊頁](/events/zetcho-rush)` |
| `玩法說明：/events/slam-dunk` | `[查看玩法說明](/events/slam-dunk)` |
| `前往挑戰：/challenge` | `[前往挑戰機台](/challenge)` |
| 「按下的瞬間由伺服器決定並寫入紀錄」 | 「按下去的那一刻結果就定了，斷線也算你的」 |
| 「購買進入權」 | 「買一張入場券」 |

**公告內文的連結寫法**：`[顯示文字](/path)`。
公告內頁（`frontend/app/announcements/[id]/page.tsx` 的 `linkify`）會渲染成
主題色 + 底線的可點連結；站內走 `next/link`，站外才開新分頁。
裸網址仍相容（舊資料），但新文案一律用有顯示文字的寫法。

同樣原則適用於活動頁、機台頁、錯誤訊息與任何前台提示。

## 重要慣例

- 所有 migration 執行後 commit 並 push（不需詢問）
- **推版前必須更新 `DEVLOG.md` + 同步 `dev_logs` DB 表**：
  - 先更新 `DEVLOG.md`（格式：`## v2026.MM.DDx｜YYYY-MM-DD｜標題`）
  - 再執行 `cd backend && export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/sync_devlog_to_db.ts` 同步至後台「開發紀錄」
  - 後台開發紀錄（`/dev-logs`）讀的是 `dev_logs` DB 表，**不是** DEVLOG.md 本身，兩邊必須同步
  - 再 commit + push
- **推版節奏**：完成功能後不自動推版，等老闆本地測試完、明確說「推版」再推
- **分支規則（嚴格遵守）**：
  - 老闆說「推版」→ **push `dev`**（對應 STG 環境）
  - 老闆說「推正」→ 才從 dev merge/push 到 **`main`**（對應 PROD 環境）
  - 永遠不直接 push main，除非明確說「推正」
- 後台 API 統一用 `getSupabaseAdmin()`，前台用 `createClient()`（anon key）
- 財務對帳公式：`expected = recharge_total + manual_total - draw_total - refund_deducted`
  （出貨運費走 `token_adjustments`、type 為 `manual`，已含在 manual_total 內；
  migration 426 之前的訂單沒有入帳，那段期間的差額即為運費）
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
