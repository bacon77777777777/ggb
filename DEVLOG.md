# 開發日誌

---

## 2026-07-08｜智能批量匯入：補全邏輯修正 + 並行加速

### 問題
1. **「✓ 已補全」卻沒圖**：xlsx 若有任意字串欄位被 Claude Haiku 誤判為 `image_url`（如 SKU 碼），`missingFields` 不含 'image'，導致系統標為 'done' 但圖片欄顯示空白。
2. **圖片 fallback 不顯示**：`onError` 隱藏 img 元素，但「?」佔位 div 屬於不同條件分支，並不跟著出現，圖片框完全空白。
3. **484 筆序列補全需 2 小時**：`enrichAll` 原本逐筆呼叫 `enrichOne`，484 筆 × 15s = 2 小時，完全不可用。

### 修正（`components/XlsxImportWizard.tsx`）
- `image_url` 驗證：只有 `http://` 或 `https://` 開頭才算有效圖片，否則清為 null 並重設 `aiStatus: 'idle'`
- 圖片欄改用 `position: relative` + `position: absolute` 層疊架構，onError 時隱藏 img 並顯示 fallback div
- `enrichAll` 改為每批 **4 筆並行**處理（`Promise.all` + for 迴圈分批），速度提升約 4 倍

---

## 2026-07-08｜智能批量匯入：任意廠商格式自動欄位識別

### 功能說明
過去 xlsx 解析只支援模威格式（硬寫欄位位置），其他廠商格式一律失敗。現在任意廠商的 xlsx 都能自動解析。

### 運作邏輯
1. 定義商品完整欄位清單（名稱/類型/條碼/日幣/台幣/圖片/品項/代理商）
2. 上傳 xlsx → 系統讀取欄位標題 + 前 3 筆範例資料
3. Claude Haiku 分析欄位語意，輸出 fieldMap（每個欄位對應到哪個標題）
4. 用 fieldMap 解析所有資料列，記錄 `missingFields`（哪些欄位檔案沒有）
5. 前台根據 `missingFields` 自動判斷 `aiStatus`：缺 image 或 prizes → `idle`（排 AI 補全）；都有 → `done`

### 修改
**`app/api/admin/products/parse-xlsx/route.ts`**
- `ParsedProduct` 新增可選欄位：`image_url`、`distributor`、`prizes`、`price_twd`、`missingFields`
- 保留模威 fast path（不消耗 Claude API）
- 未知格式 → `detectColumns()` 呼叫 Claude Haiku → `parseWithFieldMap()` 彈性解析
- 型別字典新增日文對應（一番くじ/ガチャ/ブラインドボックス 等）

**`components/XlsxImportWizard.tsx`**
- `ParsedProduct` 本地介面同步新增可選欄位
- xlsx 解析後：`prizes` 自動映射為 `variants`；`missingFields` 決定 `aiStatus`
- 上傳說明文字改為說明「智能欄位識別」流程

---

## 2026-07-08｜機器人假數據自動補回 + 頂部導航會員/在線統計

### 機器人假數據自動化（不再需要手動跑腳本）
- 新增 `lib/seedBotDraws.ts` 共用函式（冪等，已有 bot 記錄就跳過）
- 新增 `app/api/admin/seed-bot-draws/route.ts` API
- `app/api/admin/products/route.ts`：新增商品成功後 fire-and-forget 呼叫 seedBotDraws
- `components/XlsxImportWizard.tsx`：批量匯入成功後自動呼叫 seed API
- 觸發條件：有上架商品 + bot draw_records = 0 才執行，否則跳過

### 頂部導航改版
- 「會員 N 人」改為「總會員數 x,xxx  在線人數 x,xxx」
- 在線人數：`visit_logs` 近 15 分鐘的訪問記錄數
- `dashboard/pending` API 新增 `onlineCount` 欄位

### 其他修正
- 頂部會員數排除 `is_bot = true` 帳號

---

## 2026-07-08｜智能上架支援混合類型 xlsx

### 問題
智能上架（XlsxImportWizard）原本所有商品全部上架為 `type: 'gacha'`（轉蛋），不論實際類型。ai-enrich 搜圖也全部用「カプセルトイ」關鍵字，Claude Vision prompt 也硬寫「轉蛋商品」。

### 修改

**`app/api/admin/products/parse-xlsx/route.ts`**
- `ParsedProduct` 介面新增 `type` 欄位
- 讀取 xlsx `類型` 欄（如有），對應中文→DB enum（一番賞→ichiban、盒玩→blindbox、轉蛋→gacha、抽卡→card、自製賞→custom）
- 無此欄則預設 `gacha`

**`app/api/admin/products/ai-enrich/route.ts`**
- 接受 `product_type` 參數
- DuckDuckGo 搜圖關鍵字依類型切換（ichiban→一番くじ、blindbox→ブラインドボックス、card→トレーディングカード 等）
- Claude Vision prompt 改為「這是{類型名稱}商品」

**`components/XlsxImportWizard.tsx`**
- 預覽表格新增「類型」欄（可手動修改的 select dropdown）
- 上架時改用每筆商品實際的 `type`，同步推導 `category` 欄
- 呼叫 ai-enrich 時帶入 `product_type`
- CSV 格式也支援讀取 `類型` 欄

---

## 2026-07-08｜權限管理補全 + 事件中心紅點修正

### 修改（`app/permissions/page.tsx`）
**頂部導航** 區塊補齊缺少的 3 個圖標 + 會員數顯示：
- `header_members`（會員數顯示）
- `header_settlements`（廠商月結）
- `header_refunds`（待審退款）
- `header_recharge_review`（待複核儲值）
- `header_products`（鈴鐺告警）
- `header_orders`（配送待辦）

**對帳報表** 區塊補充：
- `coupons_report`（折價券明細）
- `settlement_snapshots`（廠商月結管理）

### 修改（`components/AdminLayout.tsx`）
- `PATH_PERMISSION_MAP` 補齊新 `header_*` permission ID 對應
- 頂部圖標 canAccess 統一換用 `header_*` permission ID
- **事件中心紅點修正**：新增 `useEffect([pathname])` 在每次頁面導航後重新取 `pendingCount`，解決在事件中心略過事件後返回側邊欄仍顯示舊數字的問題

---

## 2026-07-08｜廢棄 GB哥 LINE xlsx 智能上架

### 背景
另一台電腦開發了「LINE 群組丟 xlsx → GB哥智能批量上架」功能，但實測後發現根本無法在 Vercel Free 執行。

### 問題根源
- Vercel Free 函數上限：**10 秒**
- 單筆商品處理時間：**15-25 秒**（Bandai 爬蟲 + DuckDuckGo 搜圖 + Claude Vision 命名）
- 100 筆 xlsx 需要 25-40 分鐘，完全不可行
- 症狀：GB哥 回「📦 收到！開始智能上架…」後無聲無息，function 被 Vercel 強制 kill，無任何錯誤推回 LINE

### 修改（`app/api/line/webhook/route.ts`）
移除三段邏輯：
1. `file` 類型 message 的 event 處理
2. `handleFileMessage`（存 xlsx messageId 到 `line_pending_files`）
3. 上架意圖偵測 + `line-import-job` 觸發整段

### 保留備查
- `backend/lib/lineXlsxImport.ts`（解析 + 爬蟲 + Vision + 寫 DB 邏輯）
- `backend/app/api/admin/line-import-job/route.ts`

### 未來若要支援
需改為排隊機制：GB哥 解析 xlsx 存入 `line_import_queue` 表（< 2s）→ pg_cron 每分鐘處理 1-2 筆 → 完成後推 LINE 彙報。100 筆約需等 1 小時。

### 批量上架替代方案
後台 UI 的 `XlsxImportWizard`，本機執行無時間限制，100 筆沒問題。

---

## 2026-07-08｜清全站資料腳本修正：商品廠商納入清除範圍

### 修正（`db/migrations/288_cleanup_before_launch.sql`、`CLAUDE.md`）
商品（`products`、`product_prizes`）與廠商（`suppliers`）需隨全站資料一起清除，不保留。
新增區塊 1 優先 TRUNCATE 這三張表（CASCADE 處理 FK）。

---

## 2026-07-08｜清全站資料腳本修正：AI 記憶永久保留

### 修正（`db/migrations/288_cleanup_before_launch.sql`）
AI/系統資料不應隨清全站資料一起刪除——這是 GB哥和 cron agent 積累的記憶與經驗，清掉等於白養。

- 移除 AI/系統資料的 TRUNCATE 區塊（全部保留）
- 保留：`line_conversations`、`agent_events`、`action_logs`、`content_drafts`、`gb_pending_actions`、`capability_gaps`、`settlement_snapshots`、`leaderboard_bot_daily_stats`、`market_intel_analysis`、`competitor_*`、`tag_daily_stats`、`meeting_logs`、`tasks`
- 唯一例外：`webhook_events`（ECPay 冪等記錄）仍清除，舊付款的防重複記錄無保留必要

### 修正（`CLAUDE.md`）
「永不清除」清單補上所有 AI 記憶表，並從「清除」清單移除。

---

## 2026-07-08｜待處理事項移至頂部導航 + 儀表板清理

### 修改（`components/AdminLayout.tsx`）
新增三個導航圖標（廠商月結/待審退款/待複核儲值）+ 會員人數顯示：
- 會員人數（hidden lg:block，桌機才顯示）放在圖標群左邊
- 廠商月結圖標 → `/settlement-snapshots`，badge 顯示 draft 筆數
- 待審退款圖標 → `/refund-requests`，badge 顯示 pending 筆數
- 待複核儲值圖標 → `/recharge-review`，badge 顯示待複核筆數
- 以上均受各自 permission 控制（canAccess 現有路徑對應）
- 資料來自 `/api/admin/dashboard/pending`（AdminLayout 統一呼叫）

### 修改（`app/dashboard/page.tsx`）
- 移除「待處理事項」區塊（已移至頂部導航）
- 移除頂部「累積會員：N人」文字（已移至頂部導航）
- 時間段切換器改為靠右對齊

---

## 2026-07-08｜儀表板排名 TOP 15 復原 + 報表快速導覽移除

### 修正（`app/dashboard/page.tsx`）
- commit `4975904` 將「最多點擊系列 TOP 15」「熱門商品 TOP 15」「熱門搜尋字 TOP 15」三個 RankingList 刪除，本次復原
- 移除「報表快速導覽」區塊（快速連結已在側邊欄，重複無意義）

---

## 2026-07-08｜GB哥 流量查詢修正（user_event_logs → user_events）

### 問題
GB哥 system prompt 全域寫錯表名：`user_event_logs` 不存在此類 analytics 資料，
正確的前台行為埋點表是 `user_events`，其中含 225 筆 `product_view` 事件。
另 `product_view_events` 為空表（0 筆，前台未寫入）。

後台「行為報表 → 商品頁面進入次數」正確查的就是 `user_events WHERE event_type = 'product_view'`，
GB哥 卻被指引查 `product_view_events`（空表）或 `user_event_logs`（錯表），每次花 Haiku API 換來「找不到資料」。

### 修正（`lib/gbBro.ts`）
1. 全域 replace `user_event_logs` → `user_events`（共多處）
2. 流量/人氣詞彙對應改為 `user_events WHERE event_type = 'product_view'`
3. `product_view_events` 保持「尚未實作，勿查詢」備註

---

## 2026-07-08｜全 Agent LINE 推播訊息格式修正

### 修正範圍（5 個 cron agent）

LINE 手機端約 20 字自動換行，長行數字、金額、訂單號容易斷在中間。統一修正：

**財務長 cfo-agent**：
- `近7天儲值 NT$ X（日均 NT$ X）` 拆成 2 行
- `待確認月結：N 筆，合計 NT$ X` 拆成 2 行
- `已確認待付款：N 筆，NT$ X` 拆成 2 行
- `超時儲值：N 筆，NT$ X（pending 超過 3 小時）` 拆成 2 行

**行銷長 cmo-agent**：
- `本週新用戶：N 人（+N vs 上週）` 拆成 2 行
- `近7天：N 瀏覽 → N 抽獎 → N 儲值` 改為 3 條 bullet

**供應鏈 supply-chain**：
- 移除「留意」區塊標題（留意項目直接 bullet，不另分段）

**健康監控 health-check**：
- `ECPay callback 近 1 小時失敗率` → `ECPay 近1小時失敗率`（縮短避免英文斷行）
- `尖峰時段 2 小時內 0 筆成功儲值，付款流程可能故障` → `尖峰2小時 0 筆儲值，付款流程可能故障`

**風控 risk-scan**：
- `大額儲值：用戶 單筆 NT$ X（訂單號）` → 訂單號移至下一行（避免訂單號斷行）
- 移除「留意」區塊標題（留意項目直接接在高風險後）

---

## 2026-07-08｜GB哥 Intent 分類器架構重構 + 早報格式修正

### GB哥 Intent 分類器架構重構（`lib/gbBro.ts`）

**問題根源**：Intent classifier 是「路由開關」，B/C/D/E/F/G/H/I 各 bucket 都有硬寫的查詢邏輯，任何新問法或模糊語意都可能落入錯誤 bucket（例如「流量最高前三商品」→ 誤判 C 庫存，回傳「目前無低庫存商品」）。

**解法**：將 fast path 縮減為只剩兩個明確且不會誤判的情境：
- `A_revenue`：明確時間詞 + 財務數字查詢 → deterministic 計算，速度快（~400ms）
- `J_execute`：寫入操作 → 需要二次確認流程
- `confirm` / `cancel`：單字確認，無需 API
- **其他所有查詢**（庫存、訂單、退款、月結、用戶、流量分析...）→ `handleOpenQuestion`（Claude tool loop + run_sql），正確率接近 100%

代價：B/C/D/E/F/G/H/I 原本 ~400ms 的回覆改為 ~1.5s，但不再出現答非所問。

移除 `IntentType` 的 B/C/D/E/F/G/H/I，`INTENT_CLASSIFIER_SYSTEM` 精簡為只識別 A 與 J，`matchIntentRegex` 同步精簡。

### 早報格式修正（`app/api/cron/daily-report/route.ts`）

舊格式將儲值、抽獎、次數、玩家擠在同一行，LINE 手機端約 20 字斷行，導致數字被截斷（例如「52\n次，1人」）。

改為每個數據獨立一行（bullet 格式），與「待處理」section 視覺一致：
```
昨日數據
• 儲值：NT$ 0
• 抽獎消費：6,930 G
• 抽獎次數：52 次
• 參與玩家：1 人
• 新增會員：0 人
• 本月累計儲值：NT$ 6,000
```

---

## 2026-07-07｜智能批量匯入全面升級 + AI 圖片補全

### 智能批量匯入（XlsxImportWizard）重設計
- **表格佈局**：從卡片改為 CSS Grid 表格，欄位：圖片 / 商品名稱 / 條碼 / 日幣定價 / 件數 / 品項數 / 狀態
- **整列點擊展開**：點任意位置展開品項（checkbox 與狀態按鈕例外）
- **Header 精簡**：「全部 AI 補全」移至標題右側，「全選」移至表格欄位列
- **商品名稱**：保留 Excel 原始名稱，AI 補全不覆蓋
- **補全狀態**：有主圖且有真實品項名 → ✓ 已補全（綠）；否則 → ⚠ 未完整（橙，可重試）
- **代理商欄位**：萬代商品自動填入「萬代股份有限公司（BANDAI）」存入 `products.distributor`

### AI 圖片 & 品項補全（ai-enrich route）
- **完全免費化**：移除 Claude API 圖片搜尋，改用免費爬蟲
  - **Bandai 官方目錄**（主要）：`bandai.co.jp/catalog/item.php?jan_cd={barcode}000` → 主圖 + 各品項圖
  - **Suruga-ya**（日文名稱線索）：爬 `item_name` 欄位，過濾套組類型
  - **DuckDuckGo 圖片搜尋**（fallback）：缺圖品項個別補搜
- **Claude Haiku（最後順位）**：根據 Suruga-ya 日文線索生成繁體中文品項名稱，找不到就推測；不輸出空行或佔位名稱
- **品項名稱原則**：只輸出真實名稱，找不到就留空（不造假）

### 前台品項清單
- 移除品項左側彩色 level 標籤（GachaCollectionList）

### 權限管理 UI
- 編輯角色彈窗：「頂部導航」分組移至最上方（第一個），方便設定鈴鐺告警 / 配送待辦

### Claude Vision 品項命名（第二輪升級）
- **根本問題**：Claude 看不到圖片只能靠商品名猜，導致名稱全錯（蠟筆小新全猜「新之助」）
- **解法**：`nameVariantsByVision()`，把 Bandai 品項圖 URL 陣列直接傳給 `claude-haiku-4-5-20251001` Vision API
- Claude 看圖識別角色並讀圖上日文文字，輸出繁體中文名稱
- 圖片與名稱天然同 index，不會錯位；找不到名稱留空，不造假
- 移除 Suruga-ya 爬蟲與 Claude 純文字猜測，改為 Vision 看圖命名

### @30x5 格式正確解析
- **修正**：`@30x5` = 一袋 30 個 × 有 5 袋（包裝規格），非品項種類數
- `variant_count` 設為 0（未知），由 AI 補全從 Bandai 目錄推算品項數
- `pcsPerBag × bagsPerCase` 作為 total_count 計算基礎

### XlsxImportWizard 細節修正
- **代理商欄位**：加入 `title` tooltip 顯示全名，Dialog 拓寬至 `max-w-7xl`，防止截斷
- **數量分配**：`base + (vi === 0 ? rem : 0)` — 餘數加到第 1 品項
- **BOM 字元修正**：Excel 欄位 header BOM 字元改用 `﻿` regex 取代

### AI 補全結果摘要橫幅
- 全部 AI 補全完成後，預覽列表上方顯示摘要橫幅
- ✅ 有圖 N 件　⚠️ 缺圖 N 件　❌ 失敗 N 件；缺圖商品仍可匯入

### GB哥 LINE 智能上架
- 新增 `lib/lineXlsxImport.ts`：xlsx 解析 → AI 補全 → 批量寫入 DB → LINE push 結果摘要
- 操作流程：丟 xlsx 到管理員群組 → 回覆「gb哥幫我上架」→ 自動處理
  - 有 `quotedMessageId`（長按回覆）→ 直接下載該訊息的 xlsx
  - 無引用 → 查 30 分鐘內 `line_pending_files` 暫存的最新 xlsx
- 無圖商品直接跳過不上架（嚴重失敗），有圖商品全自動上架至 active
- LINE push 結果：✅ 已上架 N 件 ｜ 缺圖跳過 N 件 ｜ 總計 N 顆 ｜ 預估總額 ¥xxx
- webhook 新增 `file` 事件處理（存入 `line_pending_files`）

### DB Migrations
| Migration | 說明 |
|---|---|
| 293 | `line_pending_files` 表：GB哥智能上架暫存每個 LINE 群組最後一個 xlsx 訊息 |

### ESLint 修正（Vercel 部署）
- `ai-enrich/route.ts`：regex 不必要 escape `\.` `\*` → 改為 `.*`
- `XlsxImportWizard.tsx`：literal BOM 字元在 regex 裡 → 改為 `﻿`

---

## 平台擴展階段計畫

### 第一階段：現在（0～500 會員）
現況已完備，不需額外投入。

| 服務 | 方案 | 費用 |
|---|---|---|
| Supabase | Free | $0 |
| Vercel | Free | $0 |
| Upstash Redis | Free (500k cmd/月) | $0 |
| Sentry | Free (5,000 errors/月) | $0 |
| GitHub Actions 備份 | Free | $0 |

### 第二階段：成長期（500～2,000 會員）
**觸發條件**：同時在線超過 100 人，或 Sentry 出現 DB timeout 錯誤。

- 升級 **Supabase Pro（$25/mo）** → 連線數提升 + PITR 備份開啟
- 升級 **Vercel Pro（$20/mo）** → 解除每天 100 次部署限制

### 第三階段：高峰活動期（單日 UV > 1,000）
**觸發條件**：預期辦大型限時活動前。

- 提前通知 Supabase 申請暫時提升連線數
- 跑 k6 壓力測試確認瓶頸
- 評估是否升級 Supabase Team（$599/mo）

### 負載異常處理流程
```
Sentry 收到大量 timeout 錯誤
  ↓
Supabase Dashboard → Database → Connections 確認連線數
  ↓
連線數 > 80% → 立刻升級 Pro
  ↓
仍無法解決 → feature flags 一鍵關閉轉蛋功能
```

---

## 正式環境切換清單

### 綠界正式帳號啟用後（後台 Vercel 環境變數）

拿到正式 MerchantID / HashKey / HashIV 後，在 Vercel → ggb-backend → Environment Variables 更新：

| 變數 | 說明 |
|---|---|
| `ECPAY_MERCHANT_ID` | 正式商家編號（取代測試 3002607） |
| `ECPAY_HASH_KEY` | 正式 HashKey |
| `ECPAY_HASH_IV` | 正式 HashIV |
| `ECPAY_API_URL` | `https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5` |
| `ECPAY_LOGISTICS_API_URL` | `https://logistics.ecpay.com.tw/Express/Create` |
| `ECPAY_LOGISTICS_MAP_URL` | `https://logistics.ecpay.com.tw/Express/map` |

> 金流與物流共用同一組 MerchantID / HashKey / HashIV，無需另設 `ECPAY_LOGISTICS_MERCHANT_ID` 等。
> 前台（ggb-frontend）**不需要**異動任何變數。
> 更新後 Redeploy 後台即生效。

---

## 待辦事項（Backlog）

### 前台

- [ ] **轉蛋機模組化**
  - 轉蛋頁面上方機台區塊獨立為可替換模組（目前硬寫單一樣式）
  - 設計多套機台主題（東洋扭蛋機、夾娃娃機風格、街機風格⋯⋯）
  - 後台可切換各商品套用的機台模組，提升玩家視覺體驗差異化

---

## 自動化神經系統開發路線圖

> 目標：財務、風控、客服、行銷全部系統自動盯、自動處理，異常才通知人決定。
> 每天只需看一則 LINE 早報 + 後台首頁，從「操作者」變成「看數據做決策的老闆」。
>
> **部署原則**：完成一個 Phase 再統一推版，避免觸發 Vercel 每日 100 次限制。
> **開發原則**：每個功能獨立可測試，涉及金額的邏輯一律留完整明細供人工複核。

---

### 現有環境（開發時直接沿用）

| 項目 | 狀態 |
|---|---|
| LINE Messaging API | ✅ 已串接，webhook 已驗證 |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ 已設環境變數 |
| `LINE_CHANNEL_SECRET` | ✅ 已設環境變數 |
| `OWNER_LINE_USER_ID` | ✅ 已設環境變數（老闆個人 LINE ID）|
| ECPay 金流 / 物流 | ✅ 測試環境，正式帳號待申請 |
| 對帳報表分組 | ✅ 儲值/消費/物流/折價券/分解/廠商結算 已完整 |
| 廠商結算公式 | ✅ 淨收入→可分潤基礎→平台30%→廠商70% 已完整 |

**LINE 通知目標設計（統一環境變數）**
```
NOTIFY_TARGET_TYPE = user | group
NOTIFY_TARGET_ID   = {User ID 或 Group ID}
```
- 支援同時推播多個目標（用逗號分隔），不同類型通知可設不同對象
- Group ID 取得方式：加 Bot 進群後，任意發訊息，後台 `/api/line/debug-webhook` 會 log 出 Group ID

---

### Week 1（核心神經系統骨幹）

> 本週完成後：每天一則 LINE 早報 + 後台首頁待處理事項，日常營運基本自動化。

#### W1-1｜Phase 0-1：Webhook 冪等性防護（最優先，財務安全地基）
- [ ] 建立 `webhook_events` 表，記錄每筆回調原始內容、處理時間、結果（成功/重複/失敗）
- [ ] ECPay 金流回調加入 `MerchantTradeNo` 唯一性檢查，同一筆只處理一次
- [ ] ECPay 物流回調同上
- [ ] 重複回調記錄 log 但回傳成功（避免 ECPay 一直重試）
- 📦 推版節點

#### W1-2｜儀表板重構：待處理事項區塊
- [ ] 儀表板頂部新增「今天有幾件事要做」區塊（橫排小卡）
- [ ] 待處理配送訂單筆數（連結至配送管理，醒目橘色 badge）
- [ ] 待確認廠商請款筆數（連結至廠商結算，醒目橘色 badge）
- [ ] 預留位置（灰色）：待回覆客服、待審核退款、待複核儲值（資料源後續 Phase 串接）
- [ ] 全部為 0 時顯示「目前沒有需要處理的事項 ✓」

#### W1-3｜儀表板重構：KPI 精簡 + 分層
- [ ] 移除與轉換分析重複的比率型指標（折扣率、ARPPU 等）
- [ ] 移除至點擊分析：分類抽獎對比圖、熱門商品 TOP15、熱門搜尋字
- [ ] 第一層：淨營收（NR）最大、GMV、Burn、Draws、新增會員、付費用戶（PU）
- [ ] 第二層：僅保留「儲值與消耗對比」+「DAU 趨勢」兩張圖
- [ ] 頁尾加「查看完整歷史數據」→ 連結至營運報表頁面
- [ ] 頂部固定顯示累積會員總數（小字，不隨時間篩選變動）
- [ ] 移除自訂日期起訖（本頁只保留日/週/月/年快速切換）

#### W1-4｜LINE 每日早報推播
- [ ] Supabase Edge Function 排程，每天早上 08:00 執行
- [ ] 推播內容：昨日淨利、總儲值、手續費、物流成本、廠商應付、新增會員、抽獎次數
- [ ] 若營收較前一日下滑 >20%，加入 ⚠️ 警示標籤
- [ ] 使用 LINE Flex Message 格式
- [ ] 支援同時發給個人 + 群組（`NOTIFY_TARGET_TYPE` / `NOTIFY_TARGET_ID`）

#### W1-5｜AI 文案草稿生成（模板型圖片）
- [ ] 排程每天依前日熱門商品從 DB 撈資料
- [ ] Claude API 生成貼文草稿（3 種風格各一則：促銷型、故事型、緊迫感型）
- [ ] 模板型圖片：商品圖片 + 品名 + 價格套入固定版型（Canvas / Sharp 實作）
- [ ] 後台「文案草稿」管理頁面：查看草稿、複製文字、下載圖片、標記已發布
- [ ] 草稿狀態：待確認 / 已確認 / 已發布 / 已棄用

#### W1-6｜基礎風控警報
- [ ] 單一帳號 1 小時內消耗代幣超過閾值（可設定）→ LINE 通知
- [ ] 商品獎池 `remaining` 低於閾值 → LINE 通知（含商品名稱、剩餘數量）
- 📦 推版節點

---

### Week 2-3（財務自動化 + 退款流程）

#### W2-1｜代幣統一流水帳（Token Ledger）
- [ ] 建立 `token_ledger` view，整合儲值 / 消費 / 配送扣款 / 退款，含前後餘額
- [ ] 後台新增「代幣流水帳」查詢頁（可篩選用戶、時間範圍）

#### W2-2｜每日自動對帳
- [ ] 排程每天凌晨比對 ECPay 實際回調金額 vs `recharge_records` 系統紀錄
- [ ] 有差異 → LINE 通知差異明細；無差異 → 推播「對帳完成，無異常」
- [ ] 對帳結果寫入 DB 留存

#### W2-3｜廠商月結自動排程
- [ ] 排程每月 1 號自動計算上月各廠商應付金額，產生草稿結算單
- [ ] 後台頁面：查看草稿、人工確認、標記已付款
- [ ] 每筆付款留完整記錄（金額、時間、操作人）

#### W2-4｜基礎退款流程（Phase 0-2）
- [ ] 建立 `refund_requests` 表（訂單ID、申請原因、金額、狀態、審核人、時間、備註）
- [ ] 後台退款審核頁面（清單、核准 / 拒絕按鈕）
- [ ] 核准後：退代幣 or 標記「待人工退款（信用卡需自行至綠界/藍新操作）」
- [ ] 儀表板「待審核退款」badge 串接此表

#### W2-5｜Webhook 失敗重試佇列（Phase 1-6）
- [ ] pending 狀態超過 30 分鐘未確認的儲值訂單 → 標記「待人工複核」
- [ ] 後台建立「待複核清單」頁面
- [ ] LINE 通知筆數，儀表板「待複核儲值」badge 串接
- 📦 推版節點

---

### Week 3-5（風控全套 + 物流修復）

#### W3-1｜物流「已送達」狀態異常調查與修復
- [ ] Trace 物流狀態更新機制（ECPay 回調 / 人工 / 排程）
- [ ] 確認「已送達」筆數與實際是否吻合
- [ ] 修復後才進行物流異常通知開發

#### W3-2｜風控監控全套（Phase 2）
- [ ] 同 IP/裝置多帳號偵測：短時間內同 IP 多帳號 → 標記可疑 + LINE 通知
- [ ] 速率異常：同帳號短時間大量儲值 → 暫停抽獎 + LINE 通知（不自動封鎖）
- [ ] 物流逾期：訂單超過 N 天無更新 → LINE 通知
- [ ] 管理員敏感操作即時通知（手動調代幣、刪商品）
- [ ] 系統健康監控：API 錯誤率 / DB 連線 / Supabase 狀態異常 → LINE 通知
- 📦 推版節點

---

### Week 5-8（客服自動化 + 行銷自動化）

#### W5-1｜LINE Bot 客服（Phase 3）
- [ ] 建立 FAQ 資料庫（需老闆提供 FAQ 清單文件）
- [ ] 用戶問題先比對 FAQ，找不到才呼叫 Claude API 生成回覆
- [ ] 建立 `support_tickets` 表，Bot 無法處理時自動建工單 + LINE 通知
- [ ] 工單待處理筆數串回儀表板「待回覆客服」badge

#### W5-2｜老闆專屬 LINE 指令助手「GB哥」（與 W5-1 共用 LINE webhook）

**設計原則**
- 喚醒詞：`GB哥`（不分大小寫、全形半形皆可，例：`gb哥` / `Gb哥`）
- 僅在訊息中出現喚醒詞時才進入指令邏輯，其他訊息完全略過（不浪費 API token）
- 群組 + 個人聊天均使用同一套邏輯

**授權驗證**
- 喚醒詞觸發後，判斷 sender userId 是否在 `OWNER_LINE_USER_IDS`（環境變數，逗號分隔，最多 4 人，權限相同無分級）
- 非授權者呼叫 → 回覆「此功能僅限特定成員使用」，不執行任何查詢

**指令層級**

| Tier | 類型 | 範例 | 處理方式 |
|------|------|------|---------|
| 1 | 純查詢（唯讀） | 「GB哥，這週儲值多少」 | AI 解析 → 查 DB → Flex Message 回覆 |
| 2 | 生成類（不影響正式資料） | 「GB哥，幫我出三則促銷文案」 | AI 生成 → 存草稿 → 回覆預覽 |
| 3 | 複合條件操作（查詢+條件+異動） | 「GB哥，玩具總動員庫存低於5就改成20」 | AI 拆解 → 查詢 → 條件判斷 → **二次確認** → 執行 |

**Tier 3 安全機制**
- 任何資料異動均需回覆「確認」才執行，5 分鐘無回應視為取消
- 每筆操作完整記錄（指令原文、觸發者、時間、執行結果），比照後台管理員操作記錄
- 5 分鐘內連續多個 Tier 3 指令 → 暫緩處理，LINE 通知「偵測到連續操作，請確認是否為本人」
- 商品名稱模糊比對到多個結果 → 先列選項讓授權者確認，不自行猜測

**技術架構**（與 W5-1 共用底層）
- 喚醒詞過濾層（字串比對，不呼叫 API）
- 授權驗證層（userId 比對 env var）
- 意圖解析層（Claude API，回傳結構化 JSON：tier / query / condition / action）
- 執行層（呼叫既有後端 API，不重寫邏輯）
- 回覆層（LINE Flex Message，視覺上與一般聊天明顯區隔）

#### W5-2｜沉睡客自動喚回（Phase 4-4）
- [ ] 排程偵測 N 天未登入 / 未儲值的會員
- [ ] 自動發送 LINE 訊息 + 專屬優惠券

#### W5-3｜VIP 會員分級（Phase 4-5）
- [ ] 依 `users.total_topup` 設定分級規則
- [ ] 分級變化時自動通知用戶

#### W5-4｜競品風向監控（Phase 4-7）
- [ ] 排程每週用 Claude API 分析指定同業公開社群頁面
- [ ] 整理摘要報告，LINE 推播

**競品清單（分析對象）**
| 網站 | URL |
|---|---|
| 91toy | https://www.91toy.com.tw/ |
| Slime Toy | https://slimetoy.com.tw/ |
| KujiFlip | https://kujiflip.tw/ |
| Dopamine Kuji | https://dopaminekuji.com/ |
| 混線一番 | https://h5.hunxianyifan.com/ |
| City DAO | https://citydao.world/ |
| EggBox Kuji | https://eggboxkuji.com/lottery |
| Wonder Kuji | https://wonderkuji.com.tw/ |

- 📦 推版節點

---

### Week 8+（合規與長尾）

#### W8-1｜電子發票串接（Phase 5-1）
- [ ] 串接綠界電子發票 API，儲值成功後自動開立

#### W8-2｜廠商結算對帳單 PDF（Phase 5-2）
- [ ] 每月自動產出 PDF，含明細，可寄送廠商確認

#### W8-3｜口碑監控（Phase 5-4）
- [ ] 搜尋 Google 評論、PTT、Dcard 公開討論
- [ ] 負評或大量負面提及 → LINE 通知

#### W8-4｜年齡驗證閘門（Phase 0-3）
- [ ] `users` 表加 `birth_date` 欄位
- [ ] 未滿 18 歲不能付費抽獎
- [ ] 未填年齡者，購買前強制補填
- 📦 推版節點

---

### 四大分析頁面分工（避免指標重複）

| 頁面 | 回答的問題 | 專屬指標 |
|---|---|---|
| 儀表板 | 現在賺多少、有沒有事要處理 | 待處理事項、NR、GMV、Burn、Draws、PU |
| 轉換分析 | 客人有沒有變忠實、跟上期比進退步 | 首儲轉化率、回購率、付費率、ARPPU（這兩項只在此頁） |
| 點擊分析 | 客人在關注什麼、該往哪備貨行銷 | 商品瀏覽、系列 TOP15、搜尋字 TOP15、分類抽獎對比 |
| 營運報表 | 任意時段發生了什麼、對帳/報稅/給合夥人 | 逐日/週/月明細、CSV 匯出、留存率 |

> 相同指標（GMV、DAU、NR）四頁共用同一套後端計算函式，確保數字一致。

---

## 2026-07-07（LINE 推播財務口徑統一 + GB哥營收查詢修正）

### 後台（Next.js / backend）

**GB哥昨日營收追修**
- `FinancePeriod` 新增 `yesterday`，固定為台灣時間昨天 00:00～24:00
- GB哥工具 `get_revenue_summary` enum 新增 `yesterday`
- GB哥收到「昨日 / 昨天 / 今日 / 本週 / 本月 / 近7天 / 近30天」營收統計類問題時，若不是要求分析或比較，直接走 deterministic 回覆，不再交給 Claude 自行選期間或追加比較
- 「昨日營收」回覆標題固定顯示實際日期，例如 `昨日營收統計（2026/07/06）`
- 系統提示補強：問昨日只查昨日，不主動追加近 7 天比較

**LINE 群推播詞彙統一**
- 新增 `backend/lib/financeMetrics.ts`，統一台灣時間區間、真人用戶過濾、真實儲值金額與抽獎消費統計口徑
- 每日早報「消費金額」改為「抽獎消費」，單位固定為 **G**；儲值金額固定為 **NT$**
- 本月累計儲值排除 `test` / `promotion` / `compensation` 等非真實付款紀錄

**GB哥營收統計修正**
- `get_revenue_summary` 改用共用財務 helper
- 抽獎消費改為直接加總 `draw_records.points_used`，不再用 `products.price` 反推，避免商品改價或歷史資料導致錯誤
- 系統提示補上固定詞彙：儲值金額 NT$、抽獎消費 G、抽獎次數、參與玩家、儲值訂單
- 商品每抽價格工具描述由 NT$ 修正為 G

**財務長日報修正**
- 近 7 天 / 月比較儲值金額排除測試、行銷贈點、補償紀錄
- 代幣對帳改以 `token_ledger` 為帳務基準，納入拆解退還與手動調整，降低誤報差額
- 差異定義改為「實際持有 - 帳務應有」
- AI 分析加入防呆：禁止 Markdown 標題、禁止日期待補充、不可自行發明數字；若輸出異常則改用 deterministic fallback 摘要

### 驗證
- `cd backend && npx tsc --noEmit` ✅
- `cd backend && npm run build` ✅
- `cd backend && npm run lint` 仍有既有 lint 問題：`hooks/useTablePrefs.ts`、`scripts/manual_migrate.js` 空 block，`utils/csvColumnDetect.ts` regex escape

---

## 2026-07-05（v1.7.5 — 前台手機版 Lazy Load + 配送管理 Bug 修復）

### 後台（Next.js / backend）

**配送管理 Bug 修復**
- Bug 2：`map-callback` redirect fallback 改用 `NEXT_PUBLIC_FRONTEND_URL` 環境變數，修正原來誤用 backend domain 作為前台 redirect 目標的問題
- Bug 5：移除配送管理頁「合併生成配送單」假功能 modal（無實際邏輯，純 UI 展示），同步移除「可合併生成配送單」統計卡
- Bug 11：生成配送單按鈕現在對 `processing` / `picked_up` 且尚未有追蹤號的訂單也顯示（原僅限 `submitted` 狀態）；訂單列表批次選取邏輯同步更新

**Migration Runner 改版**
- `backend/scripts/manual_migrate.js` 改用 `psql` CLI 執行 SQL（原使用 `pg` npm 套件會截斷 username 中的 Supabase project ref，導致認證失敗）
- 支援 `--from`、`--to`、`--only` 參數

### 前台（Next.js / frontend）

**手機版 Lazy Load — 全面上線**
- 我的倉庫（`/profile?tab=warehouse`）：修復 lazy load 卡住問題，根因為 Safari 對 `overflow-y-auto` 容器內 IntersectionObserver 的相容性缺陷；改用 React `onScroll` 合成事件直接監聽 scroll container
- 新增 lazy load 到以下三個手機版頁面（預設顯示 10 筆，下滑到距底部 150px 自動載入 10 筆）：
  - **我的倉庫**（已修復）
  - **配送管理**（`delivery` tab）
  - **抽獎紀錄**（`draw-history` tab）
  - **首頁**（`/`）：使用 `window` scroll 事件，tab 切換時重置計數

**倉庫 UI 調整**
- 列表行動按鈕「確認支付並配送」→「配送」（精簡文字）
- 申請配送 modal 運費顯示改為代幣（G 幣圖示 + 數字 + 「代幣」文字）
- modal 底部按鈕：取消縮窄、確認按鈕 `flex-1` 填滿；文字改為「確認支付 X 代幣」或「確認配送」

### DB Migrations
| Migration | 說明 |
|---|---|
| `240` | 開發日誌：正式環境切換清單（綠界金流/物流正式環境變數說明） |
| `241` | 開發日誌：本次前台 Lazy Load + 配送管理修復 |

---

## 2026-07-04（v1.7.4 — 廠商結算重設計 + 消費明細整合積分 + 運費細分4家超商）

### 後台（Next.js / backend）

**廠商結算（`/reports/settlement`）全面修復與重設計**
- 修復 runtime crash：`data.products.length` 讀取 undefined，根因為 migration 238（`draw_records.points_used`）尚未套用；解法：API 改以 try/catch 降級查詢，前端 `fetchData` 加 `if (json?.error) return` 防護
- 計算公式重組：先扣除折價券/運費/積分廠商吸收金額，再計算廠商分潤%，最後扣分解代幣
  ```
  distributableBase = netAfterTax - couponSupplierShare - shippingSupplierShare - pointsSupplierShare
  supplierGross     = distributableBase × supplierShare%
  supplierNet       = supplierGross - dismantleTotal
  ```
- 版面重設計：新增 `Row` 元件（label + value 左右排版，支援 bold / red / green / muted / indigo / indent props）
- 顯示順序：廠商商品消費 → 藍新手續費 → 淨收入 → 折價券吸收 → 運費吸收 → 積分補償 → 可分潤基礎 → 平台留存 → 廠商分潤 → 分解退代幣 → 實際應付廠商
- 「積分支付」全面改名為「積分補償」（頁面標籤、CSV、tooltip、費用設定）
- 積分補償顯示綠色 `+NT$X`，字重與上方紅色項目一致
- 移除：「・佔全平台 X%」、「參考 — 期間平台儲值」、「期間儲值總額參考」、「・共 NT$X」、「，不計入」等冗餘說明文字

**消費明細（`/reports/[type]`）整合積分幣種篩選**
- 新增幣種選擇器：全幣種 / 代幣 / 積分（預設全幣種）
- 新增 KPI 卡片「總消費積分」：有積分時 indigo 色，無則橘色，選代幣時隱藏
- 資料表新增「積分」欄位，選代幣時隱藏；「消費金額(G)」選積分時隱藏
- 依幣種篩選顯示商品：選代幣僅顯示代幣消費商品，選積分僅顯示積分消費商品
- 無資料時仍顯示表頭與空白列（UI 不塌陷）
- CSV 匯出加入積分欄位，依 `filteredProducts` 輸出
- 「G幣」選項改名為「代幣」

**側邊欄**
- 移除「積分明細」獨立入口（功能已整合至消費明細幣種篩選）

**運費設定（`/settings/shipping`）**
- 「超商取貨運費」細分為 4 家超商各自可填金額：
  - 7-ELEVEN：預設 NT$65
  - 全家：預設 NT$65
  - 萊爾富：預設 NT$60
  - OK mart：預設 NT$60
- 新增設定 keys：`shipping_fee_cvs_711`、`shipping_fee_cvs_family`、`shipping_fee_cvs_hilife`、`shipping_fee_cvs_ok`

### 新增頁面 / 路由
| 路由 | 說明 |
|---|---|
| `backend/app/reports/coupons/` | 折價券明細（新建頁） |
| `backend/app/reports/points/` | 積分領取明細（新建頁，積分消費已整合至消費明細） |

### DB Migrations（待套用）
| Migration | 說明 |
|---|---|
| `237` | 修正 `play_gacha`：處理折價券 NULL expiry + `is_active` 檢查 |
| `238` | `draw_records` 加入 `points_used INTEGER DEFAULT 0` |

---

## 2026-07-04（v1.7.3 — 點擊分析頁重設計 + 儀表板新卡片）

### 後台（Next.js / backend）

**點擊分析頁（`/reports/behavior`）全面重設計**
- 亮色主題（`bg-white` 卡片，移除深色）
- 時間選擇改為 DateRangePicker + 日/週/月/年 pill buttons（同儀表板風格）
- 匯出 CSV 改為白底 `border-2 border-neutral-200` 樣式（同轉換分析頁）
- 四張卡片固定高度（`h-[440px]`），list 區域 `overflow-y-auto` 可捲動
- 卡片標題加（XX筆商品）動態顯示筆數
- 摘要列數字改為藍色（`text-primary`）
- 10 秒自動刷新，右上顯示最後更新時間
- 頁面停留時間：已知路徑顯示中文名稱（`/` → 首頁、`/profile` → 我的倉庫 等），未知路徑顯示小灰字原始路徑
- 自動分析建議中路徑同步改為中文名稱

**行為分析 API（`/api/admin/behavior`）**
- 商品瀏覽卡片改為撈全部 `products`，未瀏覽商品顯示 0（原本只顯示有紀錄的商品）

**儀表板新增指標卡片**
- `淨營收（NR）`：總儲值 - 折價券折抵，副文字顯示折抵金額
- `折扣率（Discount）`：折抵佔總儲值比例 %，副文字顯示折價券 NT$ 數字
- `日均營收（Avg. Daily）`：總儲值 ÷ 天數，單日檢視時自動隱藏（避免與總儲值重複）
- `StatCard` 新增 `subtext` prop，折扣率等卡片可顯示副說明

**儀表板所有卡片加英文縮寫**

| 原名 | 改為 |
|---|---|
| 總儲值金額 | 總儲值金額（GMV） |
| 消耗代幣 | 消耗代幣（Burn） |
| 抽獎次數 | 抽獎次數（Draws） |
| 總代幣餘額 | 總代幣餘額（Balance） |
| 付費用戶數 | 付費用戶數（PU） |
| 訪問量 | 訪問量（PV） |
| 註冊量 | 註冊量（NU） |
| 平均客單價 | 平均客單價（ATV） |
| 點擊商品數（去重） | 點擊商品數（UPV） |
| 點擊後成功抽獎 | 點擊後成功抽獎（Conv.） |
| 點擊→抽轉化率 | 點擊→抽轉化率（CVR） |

### DB 異動
無（折價券查詢直接讀現有 `user_coupons` + `coupons` 表）

---

## 2026-07-04（v1.7.2 — 排行榜機器人 + 任務追蹤根本修復）

### 前台（Next.js / frontend）

**任務追蹤移至 Server API Route**
- 根本問題：`supabase.rpc()` 是 lazy promise，不加 `await` 根本不發 HTTP 請求。原本在 `blindbox/[id]/page.tsx` 用 `Promise.allSettled([rpc1, await rpc2]).catch()` 的寫法完全無效
- 修正：將 `track_mission_event` + `check_achievements` 移至 `/api/gacha/route.ts` server 端，用 `await Promise.allSettled([...])` 確實執行，每次轉蛋成功後必定追蹤

**排行榜 draw 計數顯示修正**
- `轉蛋魔人` 一直顯示 0：DB 返回欄位名稱是 `total_spent`，但前端讀 `draw_count`（undefined → 0）
- 修正：前端改讀 `item.total_spent || item.draw_count`

### DB 異動

| Migration | 說明 |
|---|---|
| `235_leaderboard_status_filter.sql` | 移除 `get_leaderboard_draws` 的 `status='success'` 過濾；新的轉蛋 status 是 `in_warehouse`，舊過濾導致所有新轉蛋不被計入排行榜 |
| `236_leaderboard_bot_data.sql` | 排行榜永遠顯示 20 筆：真實用戶優先（is_bot=0 排前），剩餘名次由 20 個預設機器人填補（龍騎士Ω、轉蛋狂魔... 等中文名）。機器人純視覺，無真實 draw/recharge 紀錄，不影響報表。賞金狂人機器人金額 100–4800 TWD；轉蛋魔人機器人次數 3–88 次 |

### 根因說明（任務追蹤）
`supabase.rpc('func', params)` 回傳的是 `PostgrestFilterBuilder`（lazy execution）。沒有 `.then()` / `.catch()` / `await` 就不發 HTTP 請求。原本的 fire-and-forget 寫法：
```ts
Promise.allSettled([
  supabase.rpc('track_mission_event', ...),    // lazy，NOT sent
  (await supabase.auth.getUser()).data.user.id, // await 評估後才建 array
]).catch(() => {});                              // 非 await，但 allSettled 會 trigger .then()
```
第一個 rpc 確實會在 `Promise.allSettled` 時被觸發，但整個 `Promise.allSettled` 沒有 `await`，加上 Next.js serverless function 可能在 response 送出後立刻終止，導致 RPC 沒有完成。移至 API route 並加上 `await` 後問題解決。

---

## 2026-07-04（v1.7.1 — 任務成就全鏈路修復）

### 前台（Next.js / frontend）

**任務事件追蹤**
- `blindbox/[id]/page.tsx`：每次轉蛋成功後自動呼叫 `track_mission_event('draw_count', { count })` + `check_achievements`，確保抽獎次數、連抽天數任務即時更新

**徽章牆放大**
- `PlayerProfileCard` 徽章牆圖片 `height: 72 → 83px`（+15%）

### DB 異動
| Migration | 說明 |
|---|---|
| `233_fix_mission_tracking.sql` | 全面重寫 `track_mission_event`：`login` → `login_streak` streak 計算並更新 `users.login_streak`；`draw_count` → `users.total_draws` + `draw_streak` + `single_day_draws` 任務；`recharge/recharge_amount` → `users.total_topup` + `topup_streak`；`invite_friend` → `users.total_referrals`（之前幾乎全部任務事件都沒有紀錄到 users 統計欄位，導致 `check_achievements` 永遠無法判斷達成條件） |
| `234_fix_claim_and_sync_stats.sql` | `claim_task_reward` 發獎後自動呼叫 `check_achievements`，修復「領完任務獎勵但徽章牆不顯示」問題；一次性 backfill 所有已存在用戶的 `total_draws`（從 `draw_records`）、`total_topup`（從 `recharge_records`）、`total_referrals`（從 `referrals`） |

### 根因說明
任務成就鏈路原本斷在三個地方：
1. `track_mission_event` 只更新 `user_task_progress` 進度列，**從未寫入 `users` 統計欄位**（`total_draws` 等永遠是 0）
2. `check_achievements` 讀取 `users.total_draws/login_streak/...` 判斷是否達標，統計欄位全是 0 → 永遠不觸發
3. `claim_task_reward` 只給積分，**不呼叫 `check_achievements`** → 即使手動達標也不發徽章

---

## 2026-07-03（v1.7.0 — 成就系統、報表 UI、權限管理）

### 前台（Next.js / frontend）

**玩家資料卡（PlayerProfileCard）徽章牆**
- Tooltip 改至徽章上方：黑色半透明氣泡 + 朝下三角箭頭
- 徽章圖片改為等比例 `height:72, width:auto`（不再拉伸）
- 移除鎖頭 overlay

**成就系統同步**
- `tasks` achievement 表清除 12 筆舊重複（42 → 30 筆）
- `badges` 表新增排行榜信徒（29 → 30 筆，`id: ranking_50, condition_type: like_ranking, condition_value: 50`）
- `AchievementsTab` + `PlayerProfileCard` BADGE_IMAGE 加入 `ranking_50 → 排行榜信徒.png`

**成就任務清理**
- 刪除分享大使、社群推廣者、每日常客（從 `tasks` 表移除）
- 保留排行榜信徒，加入 `ACHIEVEMENT_BADGE_IMAGE['like_ranking:50']`
- `MissionFrame` 徽章容器改為固定寬 80px，修正任務標題縱向對齊

**33 個成就徽章圖片上線**
- `/images/mask/` 33 張 PNG 加入版控並部署至 Vercel

### 後台（Next.js / backend）

**報表 UI 統一**
- 商品消費重命名為**消費明細**（側邊欄、頁面標題、CSV 檔名）
- 分解明細 Filter 改為 toolbar 樣式（廠商下拉 + DateRangePicker + 匯出，與消費明細一致）
- 儲值明細、物流明細、消費明細、分解明細四頁新增 KPI 合計小卡
- KpiCard 字體統一 `text-2xl font-black rounded-xl`

**管理員新增修復**
- 修正前端錯誤訊息只顯示「儲存失敗」問題，現在顯示真實 error message
- `admins` API route 修正 PostgrestError 處理（直接 `return NextResponse.json` 而非 `throw error`）
- Migration 229：`ALTER TABLE public.admins DROP COLUMN IF EXISTS email`（已直接執行於 production）

**權限管理頁全面更新**
- 移除 Legacy 重複 checkboxes（`dashboard_view`, `products_manage` 等 6 個）
- 新增 18 個頁面的權限項目：轉換分析、廠商管理、菜單管理、市集管理、消費/物流/分解/廠商結算明細、折價券管理、功能開關、運費設定、抽獎模組設定、工具、開發紀錄、販售管理/訂單、交換管理/紀錄
- Checkboxes 改為**按群組分區顯示**（營運總覽 / 金流報表 / 抽獎管理 / 系統設定 / 販售 / 交換），含 `max-h-96 overflow-y-auto`
- 角色卡標籤改顯示中文（`LEGACY_PERMISSION_LABELS` 對照 legacy key）
- 編輯 modal 開啟時自動 normalize 舊格式 key（`dashboard_view` → `dashboard`），儲存後同步更新 DB 格式

### DB 異動
| 操作 | 說明 |
|---|---|
| `DELETE FROM tasks WHERE type='achievement' AND ...` | 清除 12 筆舊重複成就任務（42→30） |
| `INSERT INTO badges` | 新增排行榜信徒 badge（ranking_50） |
| `ALTER TABLE public.admins DROP COLUMN IF EXISTS email` | 移除 admins email NOT NULL 欄位（migration 229） |

---

## 2026-07-03（平台穩定性全面強化）

### 安全性修復
- **draw_records UPDATE RLS 移除**：用戶原本可竄改自己的抽獎紀錄，已移除該政策，現在只有 SELECT + INSERT
- **庫存 CHECK 約束**：`product_prizes.remaining >= 0` 和 `products.remaining >= 0`，防止 advisory lock 被繞過時庫存變負數

### 後台操作審計（action_logs 全面補齊）
新增 `backend/lib/logAdminAction.ts` helper，覆蓋所有關鍵後台操作：
- 後台登入（成功 + 失敗，含 IP）
- 新增 / 修改 / 刪除商品
- 更新訂單狀態
- 停用 / 啟用用戶、重設密碼
- 修改功能開關

### 全站操作 Log（user_event_logs）
新增 `user_event_logs` 表，記錄前台用戶行為：
- **登入**：AuthContext SIGNED_IN → `/api/user/log-event`（server-side 含 IP）
- **抽獎**：`play_gacha` DB function 內部 INSERT（每次抽獎自動記錄）
- **儲值**：payment callback 成功後寫入（含 IP）

### 後台 logs 頁升級
- 加入「前台事件」第二個 tab，顯示 login / draw / topup 明細
- 異常偵測：同 IP 5 分鐘內抽獎 ≥10 次自動標紅 + 顯示警告 banner
- 會員管理「最後 IP」改從 user_event_logs 撈（Supabase Free plan 的 audit_log_entries 為空）

### 自動備份
- 新增 `.github/workflows/backup.yml`
- 每天凌晨 3:00 UTC+8 自動 pg_dump，gzip 壓縮上傳 GitHub Artifacts，保留 90 天

### Rate Limiting（Upstash Redis）
- 抽獎：同一 user_id 每 3 秒最多 3 次（`/api/gacha` 新路由統一入口）
- 支付發起：同一 IP 每 10 分鐘最多 5 次
- 前台三個抽獎頁面（GachaProductDetail / blindbox / item）統一改呼叫 `/api/gacha`

### 即時監控（Sentry）
- 前台 + 後台各安裝 `@sentry/nextjs`
- `sentry.client/server/edge.config.ts` 設定完成
- `next.config` 包裝 `withSentryConfig`
- 只開 Error monitoring，關閉 tracing/replay 節省免費額度

### 後台改名
- 「後台開發紀錄」→「開發日誌」

---

## 2026-07-02（補）

### 本次目標
- 修復多個 Vercel build 錯誤
- 排行榜排序亂、圖片遺失、稱號位置跑掉
- 商品管理：成本欄位預設顯示、開賣時間持續未填 bug
- 玩家資料卡徽章牆互動
- 成就頁稱號標籤

### 前台（Next.js / frontend）

**Build 修復**
- `GachaMachineRetro.tsx:68`：`let start` → `const start`（prefer-const ESLint 錯誤）

**排行榜**
- SQL 函式 `get_leaderboard_whales` / `get_leaderboard_draws` 末尾補 `ORDER BY r.rnk`，修正 LEFT JOIN mock_titles 後順序不定導致亂序
- `profiles` 表不存在 → 改用正確的 `users` 表（欄位 `name`, `avatar_url`）
- `orders.total_price` 不存在 → 賞金榜改用 `recharge_records.amount`（status='success'）；轉蛋榜改用 `COUNT(draw_records)`
- Mock 頭像 `09.png` / `10.png` 不存在 → 改用現有 01/02 循環
- 日榜 / 周榜 mock 資料完全獨立（不同用戶排序、不同金額），讓兩個時間維度看起來自然不同；賞金與轉蛋類別的 mock #1 也不同（賞金日榜 GachaKing、轉蛋日榜 夜晚的貓）
- 4–10 名稱號 badge 位置靠左、在暱稱上方（移除 `justify-center`，改直接渲染 `<p>` 避免 flex-[1_0_0] 造成 layout 重疊）

**圖片遺失**
- `frontend/public/images/mask/`（1–11.png）和 `frontend/public/images/profilecard/`（card-bg.png、header-bg.png）從未加入 git，部署後 404
- 已補 commit 加入版控

**玩家資料卡（PlayerProfileCard）**
- 徽章牆點擊徽章顯示成就名稱泡泡：黑色半透明 `rgba(0,0,0,0.75)` 白字，位置改到徽章下方
- 移除徽章格 `overflow-hidden`，讓泡泡可正常溢出顯示
- 字體在設計稿座標 32px（scale ~0.54 後 ~17px）

**成就任務頁**
- 有解鎖稱號的成就（如 draw_count:500 → 轉蛋狂熱者）在灰色描述下方顯示稱號標籤（漸層色圓角 badge）
- 新增 `ACHIEVEMENT_TITLE` 常數對照 14 組 condition_type:target_value → 稱號名稱+顏色
- 列高 `h-[143px]` → `min-h-[143px] py-[16px]`，讓有稱號的列自然撐高

### 後台（Next.js / backend）

**Build 修復**
- `settings/modules/page.tsx`：
  - 移除 `<PageCard description="...">` 無效 prop（`PageCardProps` 無此欄位）
  - 移除 `{ type, label, note, themes }` 解構中的 `note`（型別定義無此欄位），以及對應的 JSX 區塊

**開賣時間持續未填（第二次修復）**
- 根因二：`POST /api/admin/products`（新增商品）及 `PUT /api/admin/products/[id]`（編輯商品）未寫入 `started_at`，只有 `batch/route.ts` 有寫
- 修正：兩個路由在 `status = 'active' && !started_at` 條件下自動補 `new Date().toISOString()`
- SQL 補填：`UPDATE products SET started_at = created_at WHERE status = 'active' AND started_at IS NULL` — 影響 28 筆

**成本欄位**
- `visibleColumns.cost` 預設改為 `true`，成本欄在商品列表預設顯示

### DB 異動
| 操作 | 說明 |
|---|---|
| `UPDATE products` | 補填 28 筆上架商品 `started_at = created_at` |
| `CREATE OR REPLACE FUNCTION get_leaderboard_whales` | 改 `users` 表、`recharge_records` 來源、日/周獨立 mock、ORDER BY |
| `CREATE OR REPLACE FUNCTION get_leaderboard_draws` | 改 `users` 表、`draw_records` 來源、日/周獨立 mock、ORDER BY |

---

## 2026-07-02

### 本次目標
- 前台：排行榜 mock 用戶稱號、成就任務圖示修正
- 後台：商品開賣時間未填入的 bug 修復、新增成本欄位

### 前台（Next.js / frontend）

**排行榜 mock 稱號**
- `get_leaderboard_whales` / `get_leaderboard_draws` 加入 `mock_titles` CTE，15 個 mock UUID 對應稱號（傳說課長、天選之人、歐皇⋯⋯）
- `COALESCE(真實稱號, mock稱號)` — 真實用戶稱號優先，mock 兜底
- 排行榜 4–10 名現在也會顯示稱號 badge

**成就任務圖示**
- 根因：成就列表使用 `MissionFrame.tsx`（Figma 轉出元件），而非之前誤改的 `MissionList.tsx`
- `MissionFrame` 內 `Helper1()` 是 SVG 灰圓圈，用於所有任務左側圖示
- 修改：`Mission` interface 加 `condition_type` / `target_value`；新增 `ACHIEVEMENT_MASK` 對照表；成就任務改用 `/images/mask/*.png`，每日/週任務保留灰圓
- `mission/page.tsx` 傳遞 `condition_type` / `target_value` 給 `MissionFrame`

**資料卡（PlayerProfileCard）**
- 關閉按鈕改成和購買確認 Modal 一致的樣式（`p-1 text-neutral-400`，無圓圈）

### 後台（Next.js / backend）

**開賣時間（`started_at`）修復**
- 根因：`batch/route.ts` 上架時只更新 `status`，未寫入 `started_at`
- 修正：`status = active` 時，對 `started_at` 為空的商品補寫 `NOW()`
- batch API 回傳欄位加上 `started_at`，前台 `setProducts` 同步更新 `startedAt` 顯示

**成本欄位（cost）**
- DB：`ALTER TABLE products ADD COLUMN cost numeric(10,2)`
- `types/product.ts` 加 `cost?: number`
- 商品列表（`products/page.tsx`）：
  - 新增 `成本` 欄（預設隱藏，可透過欄位切換開啟）
  - 排序支援 `cost`
  - CSV 匯出加入成本欄
- 新增商品（`new/page.tsx`）：表單 grid 改 4 欄，在價格後加成本輸入
- 編輯商品（`[id]/page.tsx`）：表單 grid 改 3 欄（md），加成本輸入
- CSV 匯入（`CsvImportWizard.tsx` + `csvColumnDetect.ts`）：
  - 新增 `cost` 欄位偵測（關鍵字：成本/進貨價/cost/批價）
  - `buildProducts` 讀取並傳入 `cost`

### DB 異動
| 欄位 | 說明 |
|---|---|
| `products.cost` | 新增成本欄，`numeric(10,2)` nullable，`ALTER TABLE` 直接執行 |

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
