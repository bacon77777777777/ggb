# 開發日誌

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

## 待辦事項（Backlog）

### 前台

- [ ] **轉蛋機模組化**
  - 轉蛋頁面上方機台區塊獨立為可替換模組（目前硬寫單一樣式）
  - 設計多套機台主題（東洋扭蛋機、夾娃娃機風格、街機風格⋯⋯）
  - 後台可切換各商品套用的機台模組，提升玩家視覺體驗差異化

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
