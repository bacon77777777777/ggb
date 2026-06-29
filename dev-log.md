# 開發日誌 (Development Log)

## 2026-06-29 ggb 上線遷移啟動 (ggb Cutover Kickoff)

### 進度摘要 (Progress)
- GitHub：建立 `bacon77777777777/ggb` 並成功推送 `main`（已設定追蹤 `origin/main`）。
- Backend：強化 `backend/scripts/manual_migrate.js`，可依序套用 `backend/db/migrations/*.sql`（用於新 Supabase 建齊 schema，不搬舊資料）。
- Supabase：已建立新專案 `ggb-prod` 並取得 API keys（待使用 Transaction/Pooler 連線字串執行 migrations）。

### 待辦 (Next)
- Supabase：使用 Transaction/Pooler 的 `SUPABASE_DB_URL` 跑 `manual_migrate.js`，並驗證 `feature_flags`、`sell(view_count/escrow)` 相關 migrations 全部成功。
- Vercel：建立 `ggb-frontend`（Root=frontend）與 `ggb-backend`（Root=backend），分別填入 env vars，確認 build/deploy 與線上驗證項目。

## 2026-02-28 任務系統 V2 (Mission System V2)

### 新增功能 (New Features)
- **任務擴充 (Mission Expansion)**:
  - **每日任務 (Daily Tasks)**: 擴充至 10 項，包含登入、瀏覽商品、分享、關注排行、每日首抽、累計抽卡(3/5/10次)、每日首儲、歐氣爆發(SR)。總計 200 積分。
  - **每週任務 (Weekly Tasks)**: 擴充至 10 項，包含累計登入(3/5/7天)、廣泛探索(3種機台)、抽卡達人(10/30/50/100次)、財富密碼(消耗5000代幣)、歐洲血統(3次SR)。總計 1000 積分。
- **積分系統 (Points System)**:
  - 在 `users` 表新增 `points` 欄位，任務獎勵由代幣 (tokens) 改為積分 (points)。
  - 更新領取獎勵邏輯 (`claim_task_reward`) 與相關 RPC。
- **前端追蹤 (Frontend Tracking)**:
  - **瀏覽商品**: 商品頁停留 2 秒自動觸發 `view_product`。
  - **社群分享**: 點擊分享按鈕或複製連結時觸發 `share_app`。
  - **排行榜膜拜**: 點擊膜拜按鈕時觸發 `like_ranking`。

### 技術細節 (Technical Details)
- **資料庫遷移 (Database Migrations)**:
  - `136_update_mission_system_v2.sql`: 核心遷移腳本，包含任務定義、積分欄位、觸發器與 RPC 更新。
  - `128_add_points_and_update_play_ichiban.sql`: 補齊積分欄位。
- **後端邏輯 (Backend Logic)**:
  - **Metadata 追蹤**: 使用 `user_task_progress` 的 `metadata` 欄位 (JSONB) 記錄已瀏覽的商品 ID 或已遊玩的機台 ID，實現「不同商品/機台」的計數邏輯。
  - **觸發器 (Triggers)**:
    - `handle_new_draw_mission_progress`: 統一處理抽卡相關任務 (次數、金額、中獎、機台種類)。
    - `handle_recharge_mission_progress`: 處理儲值相關任務。
  - **冪等性 (Idempotency)**: 確保遷移腳本可重複執行 (`ON CONFLICT`, `IF NOT EXISTS`, `DROP IF EXISTS`)。

### 修正與優化 (Fixes & Improvements)
- **UI 修復 (UI Fixes)**:
  - 修正購買確認彈窗 (`PurchaseConfirmationModal`) 在深色模式下的顯示問題 (背景色適應與文字對比度優化)。
- **開發工具 (Dev Tools)**:
  - 更新 `reset_and_seed.sql` 以包含最新的任務資料與積分邏輯，並移除冗餘代碼，且確保 `users` 表包含 `points` 欄位。
- **資源更新 (Assets)**:
  - 更新 `frontend/public/videos/video1.mp4` 影片素材。

## 2026-02-28 環境同步與確認 (Environment Synchronization)

- **SQL Migration**: 確認 `backend/db/migrations/120_update_process_topup_add_notifications.sql` 已手動執行，儲值單號格式應已修正。

## 2026-02-27 物流串接與門市選擇 (Logistics Integration & Store Selection)

### 新增功能 (New Features)
- **物流整合 (Logistics Integration)**:
  - **前端選店 (Frontend Store Selection)**: 實作結帳前強制選取門市邏輯，支援 7-11、全家、萊爾富、OK 等超商。
  - **電子地圖串接 (E-Map Integration)**: 整合藍新物流電子地圖 (`/api/logistics/map`)，解決跳轉過程中的狀態丟失問題 (Session Storage)。
  - **物流單建立 (Create Logistics Order)**: 後台訂單詳情頁新增「建立物流單」按鈕，對接藍新 API 自動生成物流單號。
  - **狀態回調 (Status Callback)**: 實作 `/api/logistics/callback`，將藍新物流狀態碼映射至系統訂單狀態 (Processing -> Picked Up -> Shipping -> Delivered)。

### 技術細節 (Technical Details)
- **API & Routes**:
  - `POST /api/logistics/map`: 生成選店表單，增加環境變數檢查與錯誤提示。
  - `POST /api/logistics/map-callback`: 接收選店結果，驗證並重導回前端。
  - `POST /api/logistics/create`: 驗證管理員權限，檢查訂單資料，發送建單請求。
  - `POST /api/logistics/callback`: 處理物流狀態更新，包含 AES 解密與狀態機邏輯。
- **資料庫 (Database)**:
  - 確保 `draw_records` 與 `orders` 的關聯正確 (Foreign Key)。
  - 修正 `recharge_records` 缺少 `payment_method` 的問題 (Migration 129)。

## 2026-02-27 儲值系統優化 (Recharge System Optimization)

### 新增功能 (New Features)
- **儲值紀錄 (Recharge Records)**:
  - 後台儲值管理表格新增「付款方式 (Payment Method)」欄位，方便管理員查看。
  - 資料庫 `recharge_records` 表新增 `payment_method` 欄位 (Migration 129)。
  - 更新 `create_topup_order` 資料庫函數，支援寫入付款方式。
  - 更新 NewebPay 支付 API (`/api/payment/newebpay`)，將付款方式傳遞至資料庫。

## 2026-02-27 公平性驗證與殺率機制修復

### 錯誤修復 (Bug Fixes)
- **公平性驗證 (Fairness Verification)**:
  - 修復產品 822 的 Seed 與 Hash 不一致問題，確保前端驗證結果正確。
  - 在後台產品編輯頁面屏蔽 Seed 與 Hash 修改功能，防止誤操作導致驗證失效。
  - 建立 `optimize_seed_for_profit.ts` 腳本，透過暴力搜尋 (Brute-force Search) 尋找完美種子，確保在調整殺率 (`profit_rate`) 後，前端驗證結果與後端實際抽獎結果一致（特別是大獎）。
- **抽獎邏輯 (Draw Logic)**:
  - 新增 `profit_rate` 欄位至 `products` 表 (Migration 126)，解決 `play_ichiban` 函數因缺少欄位而報錯的問題。

### 補充結論 (Conclusion)
- **單抽驗證一致性**：已確認目前單抽驗證結果一致且正常。
  - TXID Hash：`SHA256(seed:nonce)`（驗證用）
  - RandomValue：`HMAC-SHA256(key=seed, msg=nonce)`（抽獎用）
- **後續優化建議（非必要）**：若要降低未來維護風險，優先處理
  - 收斂前後端/測試頁多份 drawLogic 實作，避免日後不一致

## 2026-03-14 工具一條龍匯入與圖片處理 (Batch Tools + Image Pipeline)

### 新增功能 (New Features)
- **工具頁批量流程 (Tools Batch Flow)**:
  - 批量頁新增「列表頁 URL」載入，支援 `slimetoy.com.tw/` 與 `oripa.clove.jp/zh-TW/oripa/All`，可省略 Thunderbit CSV。
  - 批量結果可匯出「商品匯入範本 CSV」，並提供「下載圖片」按鈕打包成 zip。
- **圖片打包與轉檔 (Image ZIP Download)**:
  - 下載圖片輸出一律為 `.webp`。
  - SlimeToy：轉為 500x500 並以鄰近區塊覆蓋左上 logo 後再輸出 webp。
  - Clove：維持原尺寸，僅轉 webp（不再 resize）。

### 內容規則 (Import Rules)
- **商品名稱清理**：移除「潮玩賞」與「clove」字樣。
- **Clove 類型**：統一輸出為「抽卡」。
- **Clove 獎項**：
  - 各獎項數量一律設為 1。
  - 自動補一筆「隨機小物」獎項，數量為剩餘口數，圖片固定為 `01KK471XHY43DQBJ7MX0X3N5YP_fce470.webp`。
- **匯入範本欄位**：新增 `預購商品`、`預計出貨時間` 欄位，預設為「否」與空白。

### 價格處理 (Pricing)
- **Clove 價格換算**：Clove (pt=JPY) 會換算成站內代幣價格，並四捨五入到十位數（個位數為 0）。
  - 可用環境變數調整匯率：`CLOVE_JPY_TO_TWD_RATE` 或 `CLOVE_JPY_TO_TOKEN_RATE`。

### UI 修正 (UI Improvements)
- **全套收集圖片彈窗**：前台點擊獎項圖片彈窗，在圖片上方顯示獎項名稱。
- **配率表/最後賞預覽**：配率表點擊獎項與最後賞卡片皆可彈出圖片，並在上方顯示白色獎項名稱（抽卡/一番賞/自製賞）。
- **購買確認底部間距**：修正購買確認彈窗底部安全區，避免「確認支付」按鈕貼底。

### 抽卡頁面 (Card Page)
- **下半部資訊改版**：抽卡商品頁移除「全套收集」，加入「店家配率表 / 公平性驗證 / 商品資訊 / 猜你喜歡」。
- **完抽 CTA**：完抽後主按鈕改為「查看結果」並開啟結果彈窗。
- **RWD 遮擋修正**：修正手機（iPhone 12 Pro）上「店家配率表」被上半部縮放遮擋問題。

### 試玩體驗 (Trial Experience)
- **試玩固定最大賞**：盒玩/轉蛋/抽卡的試玩會固定顯示最大賞（吸引客人用，不影響正式抽獎）。
- **抽卡試玩顯示真實獎項**：抽卡試玩改為顯示該商品獎池中的最大賞（名稱/圖片皆為真實資料）。

### 首頁跑馬燈 (Winning Marquee)
- **RLS 讀取修復**：新增 `get_winning_records` RPC 與 `/api/winning-records`，避免前台直查 `draw_records` 受到 RLS 影響。

### 首頁二級標籤 (Home Secondary Tabs)
- **菜單/標籤拆分**：修正「菜單管理」與「熱門標籤」概念混淆，菜單用於首頁一級 tabs，標籤用於二級 tabs 與商品多選。
- **熱門標籤自動化**：新增標籤熱門度統計（瀏覽/抽獎加權 + 時間衰減），並提供 `/api/hot-tags`（固定前三顆後接 3+N 熱門標籤）。
- **後台標籤多選**：商品新增/編輯支援搜尋、多選、建立新標籤，並以 `#標籤` 方式顯示。
- **後台菜單綁商品**：菜單可手動綁定商品，首頁一級 tabs（自製賞後方）會自動顯示菜單並套用綁定結果。

### 抽獎邏輯 (Draw Logic)
- **機率全為 0 的容錯**：當獎池 `probability` 全為 0 時，改用剩餘數量作為權重抽取，避免永遠抽到排序第一個獎項。
- **轉蛋/盒玩抽獎修復**：轉蛋與盒玩改為依機率隨機抽取（可重複），並在完抽後禁止繼續抽。
- **轉蛋/盒玩購買修復**：補齊 pgcrypto（hmac/digest）相依與 `search_path`，避免資料庫找不到 `hmac()` 造成購買失敗。

### 後台管理 (Admin)
- **輪播圖上傳**：banner 圖片改上傳到 `banners` bucket（不依賴 `products` bucket），並改走後台上傳 API。

### 開發腳本 (Dev Scripts)
- 新增 `backend/scripts/fix_csv_chao_wan_shang_to_custom.js`：修正匯入 CSV 的「潮玩賞」字樣與類型值。
