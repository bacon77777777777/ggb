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
npm run dev        # 啟動開發伺服器（port 3001，-H 0.0.0.0）
npm run build      # 建置
npm run lint       # ESLint

# Frontend（前台）
cd frontend
npm run dev        # 啟動開發伺服器（port 3000，-H 0.0.0.0）
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
> 排程改過而文件沒跟上是常態（此表寫過 news-agent「每 20 分鐘、12 篇/次」、又寫過「3 篇/次」，
> 實際都是 6 小時、5 篇/次 —— 已於 2026-08-31 對齊程式碼）。
> 查詢：`SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`
> pg_cron 存的是 **UTC**，下表已換算為台灣時間（+8）。

| Agent（jobname） | 排程（台灣時間） | 職責 |
|-------|----------------|------|
| `news-agent-6h` | 02:00 / 08:00 / 14:00 / 20:00（每 6 小時） | 爬 RSS 與網頁 → Claude 改寫 → 寫入 `news` 表，**最多 5 篇/次**（一天上限 20 篇） |
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

- **目標是一天 20 篇**（老闆 2026-08-31 指定）。每 6 小時一場、一天四場。
  單日各分類配額（`DAILY_QUOTA`）figure 5｜ichiban 5｜gacha 4｜toy 4｜tcg 2 = 20，
  看的是**台灣日界線**不是滾動 24 小時。手動觸發標 `is_manual`，不佔配額、也不被擋。
- **單場上限會依當日缺口浮動**：`MAX_TOTAL = min(8, 20 − 今天已寫)`。
  固定 5 篇不行 —— 四場 × 5 剛好 20、沒有餘裕，**早場少寫的永遠補不回來**，
  而早場常因來源沒更新只寫 2～3 篇。`ROUND_CEILING = 8` 是拿時間預算抓的
  （每篇約 20 秒、8 篇約 160 秒，仍在 `DEADLINE` 240 秒內）。
- **某類真的沒素材時，讓其他類補上 —— 但這是最後手段**（`relaxed`）。
  一場跑兩輪：**第一輪**照分類配額，每組來源都翻到候選見底；跑完還沒滿，
  就代表缺的那幾類**確實沒東西可寫**，不是還沒輪到。**第二輪**才放掉單日分類配額，
  只留「當日總量 20」與「單場單類 `RELAXED_PER_CATEGORY`=4 篇」。
  ⚠️ **第一輪不能用完整個時間預算**（`STRICT_DEADLINE` = `DEADLINE` − 70 秒）。
  2026-09-01 的實例：第一輪把時間花在掃「還沒滿但當下沒素材」的 gacha／toy，
  掃完就超時，第二輪一次都沒跑到 —— 那場停在 5 篇，而 1kuji 當下還有 14 檔沒寫過。
  這樣切不損失任何東西：寬鬆模式本來就比嚴格模式更寬，來源順序也一樣。
  同理，**HTML 來源在第一輪就先擋掉「分類已滿」的整個來源** —— 它們的標題要開頁才知道，
  每則都得先付一次網頁抓取，1kuji 一輪 25 檔全是一番賞，ichiban 滿了照掃就是白花 25 次。
  ⚠️ 不可以一開場就放行：figure 的來源數遠多於其他四類，閘門一開就是它灌滿版面
  —— 那正是當初設分類配額要解決的問題。
  第二輪靠 `attempted`／`htmlCache` 不重抓、不重跑封面體檢（Claude vision 要花錢），
  **被配額擋下的不進 `attempted`**，那正是第二輪要撿回來的東西。
- 來源組照「今天誰的配額用得最少」重新排序 —— 不寫死輪值表，DB 就是進度表
- **回應帶 `roundCap`／`todayBefore`／`todayAfter`／`relaxedPass`**，
  產量不對時一眼看得出是配額擋的還是真的沒素材
- **分類**：`figure` 公仔景品｜`gacha` 轉蛋｜`toy` 盒玩周邊｜`ichiban` 一番賞｜`tcg` 卡牌（分不出類時預設 `toy`；舊值 `general`/`blindbox` 已併入 `toy`）

#### 來源（2026-08-31 更新，這份表是現況）

| 來源 | 取法 | 供得出的分類 |
|------|------|------|
| **oneone 宇宙** `universe.oneone.com.tw/feed` | 專屬 runner `runOneOne`（**同業**，規則見下）。feed 一次給 100 則，掃前 `ONEONE_SCAN`=40 則 | ichiban／gacha／figure／toy |
| **一番くじ倶楽部** `1kuji.com/products` | HTML 列表，**官方**（BANDAI SPIRITS）。og:title 空、og:image 是站台橫幅，兩個都要自訂取法；列表照發售日由舊到新排，程式自己倒序 | ichiban |
| **ホビーウォッチ**（Impress）`hbw/feed.rdf` | RSS 1.0／RDF | figure／ichiban／tcg／toy |
| **inside-games** `rss/index.rdf` | 綜合遊戲媒體，`TCG_TOPIC_RE` 標題過濾，`tcg` 主力 | tcg |
| **Union Arena** `unionarena-tcg.com/jp/news/` | HTML 列表，**官方**。og:image 是站台橫幅要自訂取圖；只收 14 天內（`UNION_ARENA_MAX_AGE_DAYS`） | tcg |
| **CardboardConnection／CardLines** | 歐美球員卡，各自 60 小時節流（`minIntervalHours`） | tcg |
| **PR TIMES** `prtimes.jp/index.rdf` | 全分類消防栓，`TOY_TOPIC_RE` 標題過濾。200 則約過 1 則 | figure |
| **4Gamers** `4gamers.com.tw/rss/latest-news` | 繁中遊戲媒體但真的會報玩具商品，`TOY_TOPIC_RE` + `GAME_NEWS_SKIP_RE` | figure |
| **巴哈 GNN** `gnn.gamer.com.tw/rss.xml` | 同上過濾。它是遊戲新聞台，產出極少 | figure |
| **玩具人** `toy-people.com` ×2 | 解析列表頁抓 `?p=` 連結（站上宣告的 RSS 實際 404） | toy／figure |

**⚠️ 掃描深度（`ONEONE_SCAN`、`runHtmlSources` 的 `.slice`）是產能天花板，不是效能參數。**
2026-08-31 查：原本 oneone 只掃前 12 則，第 13 則之後躺著 18 則沒碰過的新文
（一番賞咒術迴戰、三麗鷗賞布丁狗、寶可夢卡牌新彈…），而 ichiban／gacha 正好在缺。
調小它等於直接砍產能。

**已移除，不要加回去：**
- **電撃ホビー** —— 唯一會在圖上壓自己站標的來源（老闆 2026-08-29 指定拿掉）
- **Google News 查詢** —— ① 抓到的是各家媒體轉載，站標風險不可控
  ② `resolveGoogleLink` 靠 HTTP 轉址，但 Google 是 **JS 轉址**，網址原封不動 ——
  等於一直在抓 Google 的中繼頁：內文圖 0 張、正文 0 字，產出的文章只有 420 字。
  （解得開：用文章頁的 `data-n-a-id/-sg/-ts` 打 Google 自己的 `batchexecute`，
  但那是內部 RPC、會壞的相依，也解決不了①）
- **PRTimes `rss/category/17.rss`／AnimateTimes `rss.xml`** —— 兩條都 404 了

**評估過但沒收的繁中來源（2026-08-31）：**
- **巴哈 GNN 的其他分類** —— 它的分類是遊戲平台（多平台／手機／PC／OLG／Switch），
  不是題材分類。首頁 100 則裡「動漫」只有 13 則，全是動畫開播／劇場版／改編漫畫，
  **玩具商品新聞 0 則**。RSS 也只有全站一條，`?category=` 之類的參數不會過濾。
- **宅宅新聞** `news.gamme.com.tw/feed` —— 題材命中率是繁中裡最好的
  （50 則有 5 則扭蛋／景品／一番賞），但它是**轉貼推特的 matome 站**：抽驗三篇，
  封面有一半是推特網友自己拍的照片（那張玻璃杯就是），版權屬於個人不是廠商。
  要收的話得先能分辨官方宣傳圖與網友照片。

> ⚠️ **球員卡（中華職棒／歐美運動卡）在日系來源幾乎抓不到**，只有那兩家歐美站在報，
> 而它們被 60 小時節流鎖著。日系卡牌（ポケカ／遊戲王／UA）由 inside-games 與官方站供稿。
> ⚠️ **`parseRss` 必須認 `<item rdf:about="…">`**：ホビーウォッチ 與 PRTimes 都是
> RSS 1.0／RDF，舊的 `/<item>/` 正則一則都解不出來、而且不會報錯。RDF 的日期在 `<dc:date>`。

#### oneone 是同業，有四條專屬規則

老闆指定可用它的題材與圖（他們貼的是廠商官方原圖），但內文完全重寫。

1. **內文的商城置入要整段清乾淨**（`oneOneBodyText`）：以 `<p>` 為單位過濾，
   不是逐句 —— 業配句常常沒句號，逐句切會把它跟後面的真內容黏在一起。
   改寫後再用 `ONEONE_AD_RE` 複驗一次，還留著就整篇不發
2. **自家公告要擋掉**：標題含 oneone、或分類掛「線上抽／集團動態」
3. **圖走白名單，不走黑名單**（廣告圖檔名是雜湊，字面看不出是 logo）：
   `upload/featured/` 封面 ✅｜`images/editor/日期/` 內文圖 ✅｜
   `images/<雜湊>.png` **商城廣告版位（紅底 oneone logo）** ❌｜
   `upload/author/` ❌｜`assets/images/` ❌。
   封面只認 og:image 且必須在 `upload/featured/` 底下，**不退回掃 `<img>`**
4. **列在 `NO_SITE_WATERMARK_SOURCES`**：跳過站標偵測與蓋 logo，只蓋自家網址

#### 圖片處理：兩件不同的事，不要混

| | 做什麼 | 何時 | 蓋哪裡 |
|---|---|---|---|
| **網址浮水印** `stampUrlWatermark()` | 蓋**我們自己**的 `www.ggb.com.tw` | **每張都蓋** | 滿版斜向重複 |
| **白墊 + GGB logo** `brandCoverImage()` | 遮掉**別人**壓的站標 | 偵測到才蓋，且來源不在 `NO_SITE_WATERMARK_SOURCES` | 一個角 |

- **浮水印文字是內嵌的 PNG 圖章**（`lib/newsWatermarkStamp.ts`），不是 SVG `<text>` ——
  **Vercel 的 serverless 沒有系統字型，librsvg 找不到字會畫一片空白、不拋錯**，
  第一版就這樣靜靜地什麼都沒蓋。執行期只做縮放→旋轉→補透明邊→`tile` 平鋪
- 順序有兩個坑：**先縮到最終尺寸再蓋**（字級照圖寬算）、
  **一定要在 `verifyBrandedClean()` 之後才蓋**（滿版文字會讓視覺複驗整張判成髒的）
- **內文圖從來不蓋 logo**：偵測到站標就整張丟掉（老闆規則：難蓋的就捨棄，主圖顧好就行）
- **站標偵測只認 `ANSWER=` 那一行**。舊版是「取全文最後一次出現的代碼」+ `max_tokens: 150`，
  說明被截斷、結論沒寫出來，就從說明文字裡的「（BR区域）」把答案撿走 ——
  **老闆回報的「浮水印在右下角卻蓋左下角」就是這樣來的**
- **`RIGHTS_MARK_RE` 否決誤判**：模型會把廠商圓標與版權聲明當成站標
  （實測 `©universe`／`※画像はイメージです…サンライズ`／`BANDAI 食玩`）。
  只做否決、不要求「一定要含站名才算」—— 有些站的浮水印是沒有字的圖樣
- **改寫規則**：標題與內文一律由 Claude 原創重寫，**繁中來源尤須重組句型**（照抄即侵權）；
  改寫前先用來源標題擋重複，避免重複文章浪費呼叫
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

**⚠️ `products.description` 是玩家看得到的欄位 —— 不准寫給自己看的備註。**

2026-09-02 匯入 MERIDA 與 HxH 兩檔時，我把「【素材匯入，上架前必須覆核】獎品資料取自
MERIDA 官方 zh-tw 網站…」寫進 `description`。老闆一上架、把商品網址貼到 LINE，
**那段字就變成分享卡的說明文出現在對話裡**（`description` 同時是商品頁內文與 OG description）。

- 匯入時 `description` 一律寫**成品文案**：這是什麼、有哪些賞、抽到之後怎麼拿。
  照「前台文案原則」那一節寫，不出現路徑、欄位名、內部代號、「匯入」「覆核」「待替換」。
- 要提醒老闆的事（品名待改、價格待覆核、佔位圖要換）**寫在對話與 DEVLOG，不要寫進 DB**。
  真的要留在資料裡就放 `products.metadata`（jsonb，前台不讀）。
- 同一條適用所有玩家看得到的欄位：`products.name`、`product_prizes.name/level`。
  **佔位內容要能直接見人** —— 商品建進去的下一秒就可能被上架。

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

## 上線前準備（試營運）

老闆說「**上線前準備啟動**」時：**先用文字把清單列出來逐項確認，他說 OK 才整批做**
（含不可逆的清資料，不可直接執行）。這包包含三塊：

### 一、卡統編，現在做不了的（先告知，不是能解的）
公司統編還沒下來，以下全部等統編：
- **綠界正式金流（收真錢）** → 要統編換正式商店代號，現在是測試環境
  （`ECPAY_API_URL` 含 `stage`）。**第一版只能「代幣無實際價值／測試金流」試營運**，
  所以**首頁「測試階段公告」要保留**（法律免責）。統編到手換正式金流那天，才是
  「關測試公告＋接發票＋開始收真錢」的切換點。
- **電子發票**（開發票要統編）
- **綠界物流正式**（需公司帳號）
- **Google 登入**（GCP OAuth 憑證要公司驗證，現在按鈕點了只跳「即將開放」）
- **手機簡訊驗證**（簡訊商開商業帳號要統編，`phone_verify` flag 維持關）
- **電子發票**：整合已預留（`backend/lib/ecpayInvoice.ts`，開關式，儲值時開票），
  等統編＋綠界發票金鑰（ECPAY_INVOICE_MERCHANT_ID/HASH_KEY/HASH_IV）填上即啟用
- **廠商結算稅務**：目前結算頁只算未稅貨款/分潤。B2B 是**廠商開進項發票給平台**、
  平台可扣抵 5% 進項稅額（不是平台跟廠商收稅）。統編＋正式營運後，結算頁再加
  「含稅/未稅」顯示或稅額欄，跟電子發票整合同一時間點做（現在沒真實發票資料、
  加了是空的）

### 二、清資料
詳見下方「清全站資料」章節。⚠️不可逆、PROD+STG 都跑、清完＝全新開張
（商品/輪播圖/彈窗要在後台重上）。

### 三、防護檢查（上線前確認四燈全綠）
後台 dashboard 健康度卡底下的「系統設定健康」四燈（`backend/lib/systemHealth.ts`）：
1. **資料權限 RLS** 全開（migration 598 的 `sensitive_tables_rls_status()`）
2. **限流服務 Redis** 可達（確認 Vercel 前台有設 `UPSTASH_*`）
3. **金流環境** stage/production（試營運＝測試環境黃燈，正常）
4. **維護模式** 狀態
RLS 關掉、Redis 掛掉時 GB哥會自動 LINE 推播（health-check cron）。
另確認 Vercel 前台 `NEXT_PUBLIC_API_URL` 已設（沒設儲值會壞）。
資安補強清單見 DEVLOG v2026.08.21e/f。

---

## 清全站資料（重置腳本）

腳本位置：`backend/db/migrations/288_cleanup_before_launch.sql`

**觸發條件**：老闆明確說「清全站資料」才執行，不可主動執行。執行前必須列出清單讓老闆確認。

### 清除（TRUNCATE / DELETE）
- 商品/廠商：`products`、`product_prizes`、`suppliers`
- **輪播圖管理四個 tab**：`banners`（首頁/挑戰/App 開屏三個 tab）＋ `site_promos`（首頁彈窗 tab 的**手動彈窗**，含「測試階段公告」）全清
  - ⚠️ 首頁彈窗的「**最新上架**」不在 `site_promos`——它靠 `platform_settings.promo_new_arrival_enabled` 開關＋當前商品**自動產生**，開關在保留清單，機制**保留**（清完商品後、重新上架商品就會自動再出現）
- **機台（老虎機）全清**：`slot_machines`、`slot_themes`、`slot_theme_prizes`、`slot_prizes`、`slot_pool_items`、`slot_sessions`、`slot_spin_logs`（`slot_danmaku_bots` 是機器人彈幕，**保留**）
- **活動頁**：`DELETE FROM events`（`event_sections` 隨 FK CASCADE 一起刪）—— 全清，沒有例外。**抽獎公平性頁不受影響**，它自 2026-08-28 起是程式碼裡的常駐頁（`frontend/app/events/fairness/`），不在 DB 裡
- 所有真實用戶的交易記錄：`draw_records`、`recharge_records`、`orders`、`order_items`、`token_adjustments`
- 用戶行為：`user_event_logs`、`user_events`、`visit_logs`、`search_logs`、`notifications` 等、`feed_events`（首頁推薦 feed 的曝光／點擊，migration 603）
- 用戶進度：`user_badges`、`user_coupons`、`user_titles`、`referrals`、`daily_check_ins` 等
- 市場：`sell_*`、`exchange_*`、`marketplace_*`
- `webhook_events`（ECPay 冪等記錄）、`leaderboard_bot_daily_stats`（機器人排行榜分數，重上線後自動補回）
- 所有真實用戶帳號（`is_bot IS NULL OR is_bot = false`），只保留機器人帳號

> ⚠️ **首頁「測試階段公告」彈窗也在 `site_promos`，會被一起清掉。** 清資料＝全新開張，
> 清完要在後台重上：免責/開幕彈窗、輪播圖、商品。不是「保留部分內容」。

### 永不清除（保留）
- `admins`（管理員清單與權限）
- `dev_logs`（開發日誌，永久保存）
- `feature_flags`、`platform_settings`（設定；含 `promo_new_arrival_enabled` → **首頁「最新上架」彈窗機制保留**、運費/免責/商城設定等）
- `users WHERE is_bot = true`（機器人帳號本身保留，排行榜用）
- **`news` / `news_comments` / `news_likes`（情報文章＋機器人留言按讚，全部保留）** —— 真人留言隨帳號刪除消失，文章與機器人互動留著
- `slot_danmaku_bots`（機器人彈幕，保留）
- ⚠️ `draw_records`（真人抽獎記錄會被清除；機器人的保留，維持排行榜）
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
| 一句話提示 | `ui/Note`（`tone` info／warn／danger） | 手刻漸層框＋大圖示＋「注意」標題 |
| 列尾動作選單 | `ui/ActionMenu`（主按鈕以外的操作，`danger` 自動排最下面） | 一排五顆同樣大小的字 |
| 勾選後的批次操作 | `ui/BulkActionBar` + `BulkButton` | 把批次藏在工具列下拉裡 |
| 會員識別 | `MemberNo`（顯示 `#100042`） | 表格印 uuid —— **uuid 只在會員詳情頁露出** |
| 骨架屏 | `ui/Skeleton`、`ui/TableSkeleton` | 自製灰塊 |
| 檔期設定 | `ScheduleFields`（時區換算正確，另有 `unlimitedToggle`） | 自刻 `datetime-local` |
| 日期 | `DatePicker` / `DateRangePicker` / `DateTimePicker` / `YearMonthPicker` | 生 input |
| 訊息提示 | `useToast()` → `toast('訊息')` / `toast('訊息', 'error')` | 自製浮層 |

其餘現成元件：`StatsCard`、`FilterTags`、`TagSelector`、`CopyableID`、`AlertDialog`、
`SortableTableHeader`、`CsvImportWizard`、`XlsxImportWizard`、`ShippingProgress`。

### 商品圖與品項圖一律 `object-contain`，不裁切

**後台任何顯示商品圖／品項圖的地方都用 `object-contain`**（老闆 2026-09-01 指定）。
卡包是直式、盒玩是方的、卡片是 63:88 —— 塞進同一個方框裡用 `object-cover`
會把上下或左右切掉，列表上看起來全是碎片，分不出誰是誰。

例外只有三種，那些本來就該裁切填滿：**頭像**（users、leaderboard-bots）、
**輪播圖與彈窗圖**（banners、PopupPanel）、**情報封面**（news）。

⚠️ 改成 contain 之後圖片不會填滿容器，容器要自己有底色（多數已經是
`bg-neutral-100` / `bg-white`），不然會看到後面的列底。

**⚠ 沒有對應元件時才寫 tailwind**，且必須沿用既有樣式：
主要按鈕 `px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60`、
次要按鈕 `px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors`。
**寫之前先確認上表真的沒有** —— 過去多次「自創畫面」都是因為只看了這幾行配方就動手，
沒去翻 `components/` 目錄。

### ⚠️ 新增後台頁面：一律要進權限清單（**四張表**缺一不可）

老闆 2026-08-24 指定。改完**一定要跑 `cd backend && npm run check:permissions`**，
它會交叉比對這幾張表，對不上就報錯（腳本在 `backend/scripts/check_permissions.mjs`）：

1. `backend/app/permissions/page.tsx` —— 權限清單，新增 `{ id: '<權限key>', label: '<選單名>' }`
   放進對應群組。**漏了＝超管看得到、其他角色永遠勾不到。**
2. `backend/components/AdminLayout.tsx` 的 `PATH_PERMISSION_MAP` —— 選單可見性。
   **漏了＝那頁在選單上消失**（`canAccess()` 是「沒有對應權限就不顯示」，不是放行）。
3. `backend/middleware.ts` 的 `PATH_PERMISSIONS` —— **真正的伺服器端把關**。
   漏了會落到 `/reports` 這類父層保底規則。
4. `backend/lib/permissionPaths.ts` 的 `MENU_PATH_ORDER` —— 登入後「導到第一個有權限的頁」的順序。

**第 2 與第 3 張表必須成對，而且是「選單放行的每一個權限，middleware 都要接受」**：
只要有一個權限只被選單認、middleware 不認，持有那個權限的人就會「看得到、點了沒反應」
（實際是被踢回第一個有權限的頁）。2026-08-24 的實例：`/reports/accounting-guide` 在選單表
拿 `reports_settlement` 當備援放行，而**廠商角色就有 `reports_settlement`** ——
廠商左側欄因此出現「會計對接說明」，點了被 middleware 擋回去。**不要用別的角色也有的權限當備援**，
需要看的角色就去權限管理頁勾新權限。同一次稽核還抓到 9 處舊的不一致（會計的待審退款、
管理員的客服工單看得到卻進不去；挑戰機台／機台報表對所有非超管隱形），已一併對齊。

`super_admin` 一律全開，測權限要用一般管理員帳號。

**寫新頁面前必看參考**：`backend/app/slot/page.tsx`（列表 + 篩選 + modal）、`backend/app/slot/prizes/page.tsx`（同類型 CRUD）。

---

## 品牌素材（換 logo）—— 一律走 `brand/`，不要手動改散在各處的圖

**`brand/` 是全站 logo 素材的唯一來源。** 換 logo 只做兩件事：

```bash
# 1. 換掉 brand/masters/ 的母檔（透明背景，長寬比照舊）
# 2. 產出並同步到所有位置
npm run brand:sync            # 等同 node scripts/brand_sync.mjs
                              # --dry 乾跑｜--no-mobile 跳過 App 圖示
```

跑完打開 `brand/OVERVIEW.png`（總覽聯絡表）確認有沒有哪張漏掉。詳細對照表在 `brand/README.md`。

| 資料夾 | 內容 |
|--------|------|
| `brand/masters/` | **要換的就這裡**。`horizontal.png` 橫式、`vertical.png` 直式、`appicon.png` + `appicon-maskable.png` App 圖示（1024² 滿版） |
| `brand/generated/` | 16 張自動產出 → 複製到 35 個位置。**改這裡下次 sync 會被蓋掉** |
| `brand/manual/` | 整張插畫，只複製不重產：OG 分享圖、邀請 OG、iOS 啟動頁、**預設頭像八款**、兩張常駐頁主視覺（抽獎公平性、邀請好友） |

**為什麼要有這層**：帶 logo 的檔案散在 `frontend/public`、`backend/public`、`mobile/assets`
三個獨立部署的 app 底下，路徑沒辦法共用（後台與 App 讀不到前台的檔案系統）。
2026-06 換 logo 時 `images/20260629/` 這個「改版暫存資料夾」被當成正式路徑、根目錄同時留了
一份同內容的死檔，兩份並存兩個月沒人發現；8/27 換新 logo 時又照著「兩邊都有」各塞一份。
收成單一來源後不會再有這問題（2026-08-28）。

### 換素材時必須知道的五件事

1. **`frontend/public/images/logo.png` 的公開網址不能拿掉、不能改路徑。**
   `lib/newsBranding.ts` 是後台程式、部署在 `admin.ggb.com.tw`，讀不到前台檔案系統，
   是用 HTTP 抓 `https://www.ggb.com.tw/images/logo.png`。改了情報圖會全部蓋不上 logo，
   **而且不會報錯**。`lib/productBranding.ts` 則是直接讀本機同一個檔。
2. **不要放 SVG。** 舊的 `logo.svg` 是 PNG 的自動描圖版（漸層變平塗、撕邊變雜點，
   30% 像素對不上），而導覽列用的就是它。2026-08-28 已刪，三處改吃 `logo.png` ——
   next/image 不優化 SVG，換成 PNG 後反而由它自動縮圖轉 WebP，更小也更好看。
3. **App 圖示不會跟著 logo 自動變**。`brand:sync` 只更新 `mobile/assets/icon.png`，
   要進 Xcode 的圖示目錄得再跑 `cd mobile && npx @capacitor/assets generate --ios`
   —— `cap sync` **不會**重產圖示（它只同步設定與外掛），2026-08-28 換 logo 後
   模擬器仍是舊圖示就是漏了這步。⚠️ 那支會順手改寫 `Splash.imageset/Contents.json`、
   塞進它自己產的 `Default@*.png` 把我們的 `splash.jpg` 蓋掉，跑完要
   `git checkout` 那個 Contents.json 並刪掉 `Default@*.png`。之後還要重新編譯、
   送 App Store／Play 審核才生效。腳本會比對改檔時間，`appicon` 比 `vertical` 舊就警告。
4. **預設頭像是八款輪替不是一張**。信箱驗證建帳號時由 `handle_new_user()` 隨機配一款
   （migration 634），機器人帳號也平均分佈在這八款。要換就整組換。
5. **已經烙進 R2 圖片的舊 logo 這支腳本救不回來**（情報封面約 700 張、匯入商品主圖 72 張）。
   蓋圖程式讀的是本機／線上的 `logo.png`，所以**之後新蓋的都會是新 logo**，舊的要另外回填。

## 前台 UI 設計慣例

- **靜態資源一律 `asset()`**：引用 `public/` 底下的圖／音／影（`/images/…`、`/loading/…`、`/icons/…`、
  `/audio/…`、`/videos/…`）一律寫 `asset('/images/x.png')`（`frontend/lib/asset.ts`）。prod 會接上內容雜湊
  `?v=`，只有帶版本的網址才拿得到一年 immutable 快取；沒包的不會壞，只是每次都要重新驗證（慢）。
  DB 存的本站路徑（機器人頭像）在渲染處也包一層，外部網址原樣回傳。**大圖先轉 WebP 再放進來。**
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
| 「【素材匯入，上架前必須覆核】…」 | 寫成品文案；提醒的話寫在對話與 DEVLOG |

**公告內文的連結寫法**：`[顯示文字](/path)`。
公告內頁（`frontend/app/announcements/[id]/page.tsx` 的 `linkify`）會渲染成
主題色 + 底線的可點連結；站內走 `next/link`，站外才開新分頁。
裸網址仍相容（舊資料），但新文案一律用有顯示文字的寫法。

同樣原則適用於活動頁、機台頁、錯誤訊息與任何前台提示。

---

## ⚠️ 前台改動一律同時影響「網頁」與「App」

**`mobile/` 的 iOS／Android App 是 remote URL 模式的殼** —— webview 直接載入
`https://www.ggb.com.tw`。**沒有第二份程式碼、沒有第二次部署**：
推上去的那一刻，網頁玩家與 App 玩家同時換到新版（App 不用重新送審）。

所以改 `frontend/` 的任何東西之前，都要問一句「App 那邊會怎樣」。

### 怎麼區分兩者的行為

唯一的判斷依據是原生殼注入的 User-Agent 標記 `GGBApp`：

| 位置 | 用途 |
|------|------|
| `lib/nativeApp.ts` | `isNativeAppUA()` / `isAppBlockedPath()`，給 middleware 用（server 端） |
| `lib/useIsNativeApp.ts` | `useNativeAppState()` / `checkNativeAppUA()`，給元件用（client 端） |
| `lib/native/bridge.ts` | `native.isNativePlatform()`，判斷有沒有 Capacitor 橋接 |

`useNativeAppState()` 回傳的 **`resolved` 一定要用**：初值是「還不知道」不是「不是 App」
（SSR 沒有 navigator，render 期間猜值會 hydration 不一致）。沒等 resolved 就下判斷，
App 裡會先閃一次網頁版的樣子。

### App 內不開放的功能

玩家商城（`/sell`）、卡牌交換（`/exchange`）、交易所（`/market`）、
官方商城（`/official`）在 App 內一律 404。

原因：抽獎是「付費＋隨機＋實體獎品」，再接上能把獎品換回新台幣的 C2C 市集，
就湊齊了賭博三要件。同業（潮玩家、抽抽一番賞、DOPA!、入魂一番賞）沒有一個
在 App 裡放這個。**擋門壓在 `FeatureFlagsContext`**（旗標散在十幾處，逐頁補一定會漏），
外加 middleware 直接回 404 —— 回 404 不是轉址，轉址等於告訴審查員這裡本來有東西。

新增任何 C2C 相關路由時，記得加進 `lib/nativeApp.ts` 的 `BLOCKED_PREFIXES`。

### 已經踩過的坑（不要再踩一次）

| 症狀 | 原因 |
|------|------|
| 全站中文變 ☐ | `system-ui` 會用 .notdef 方塊「覆蓋」中文並**中斷 fallback**。中文字型必須排在它**前面**（用 unicode-range 限制範圍，英數才不受影響）。見 `globals.css` 的 `GGB CJK` |
| 儲值跳到綠界錯誤頁 | `Browser.open()` **只吃絕對網址**。失敗後若退回 `form.submit()`，Capacitor 交給 Safari 是 GET，POST 參數整包遺失 |
| LINE 登入完回不來 | `display-mode: standalone` **不匹配 Capacitor 的 webview**。任何用它判斷「是不是 App」的地方都要補 `Capacitor.isNativePlatform()`（下拉更新、鍵盤修正都中過） |
| 外掛裝了卻沒作用 | Capacitor 8 的 iOS 專案走 **SPM 不是 CocoaPods**。沒有 `Package.swift` 的外掛會被 `cap sync` **靜默排除**，CLI 仍會說「Found N plugins」。裝完要確認它出現在 `ios/App/CapApp-SPM/Package.swift` |
| App 開機即 crash | Firebase 外掛在初始化就呼叫 `FIRApp.configure()`，沒有 `GoogleService-Info.plist` 會拋 NSException。目前已移除，等 Firebase 專案建好再裝回 |
| iOS 沒有震動 | `navigator.vibrate` 在 iOS **完全無效**（Safari 與 WKWebView 都不支援）。一律用 `lib/haptics`，它有原生／網頁雙軌 |
| 站外連結困住玩家 | App 的 webview 沒有網址列也沒有返回鍵。外部連結由 `ExternalLinkHandler` 全域攔截後改開 in-app browser —— 不要逐個改 `target="_blank"`，動態產生的連結（公告 linkify）會漏 |

### 金流

入帳靠的是綠界打到後端的 **server-to-server callback（`ReturnURL`）**，
跟玩家在哪個瀏覽器無關。所以 App 只需要「開得起付款頁、知道玩家回來了、重讀餘額」。

App 內不能讓 webview 直接導去綠界：3D 驗證會跳到各家銀行網域，白名單列不完。
走 `lib/paymentHandoff.ts` 的 HMAC 一次性簽章交接 —— in-app browser（iOS 的
SFSafariViewController）**跟 webview 不共用 cookie**，所以交接不能靠 session。

### 原生殼的操作

`mobile/README.md` 有完整步驟。要點：Node ≥ 22（Capacitor 8 CLI 的硬性要求，
本機預設是 20，用 `nvm use 22`）；改 `capacitor.config.ts` 的 `appendUserAgent`
前台的判斷會跟著失效，兩邊要一起改。

## 重要慣例

- 所有 migration 執行後 commit 並 push（不需詢問）
- **推版前必須更新 `DEVLOG.md` + 同步 `dev_logs` DB 表**：
  - 先更新 `DEVLOG.md`（格式：`## v2026.MM.DDx｜YYYY-MM-DD｜標題`）
  - 同步到 `dev_logs` DB 表，**STG 與 PROD 要各跑一次**：
    ```bash
    cd backend
    # STG（.env.local 指向的環境，本機預設就是 STG）
    export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/sync_devlog_to_db.ts
    # PROD（一定要用 DEVLOG_DB_URL 指定，否則寫不到正式站）
    DEVLOG_DB_URL="postgresql://postgres.akdqleelvqvjhjnfkpfq:OhpiiPc5OshSrtHt@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres" \
      npx tsx scripts/sync_devlog_to_db.ts
    ```
  - ⚠️ **只跑第一行等於只同步 STG，而且畫面照樣顯示「✅ 同步完成」**——
    `backend/.env.local` 指向 STG，腳本就寫 STG。2026-08-28 與 08-29 都因此讓
    PROD 的開發紀錄落後十幾筆，兩次都是事後才發現（08-29 那次一天內漏了 14 筆）。
    推正之後順手查一下：
    `SELECT max(version) FROM dev_logs;` 兩個環境要一樣。
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
