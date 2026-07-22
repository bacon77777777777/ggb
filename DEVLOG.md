# 開發日誌

> **版本號格式**：`v[年].[月].[次數]`，每次 merge main 打一個 git tag。緊急 hotfix 不等週期。

---

## v2026.07.22b｜2026-07-22｜QA 修復（3 阻塞 + 2 警告）

### [阻塞 1] 超商取貨「確認支付」按鈕永遠 disabled
- 原因：disabled 條件永遠要求 `recipientAddress`，但 CVS 模式不顯示地址欄位
- 修正：`profile/page.tsx` 依 `logisticsType` 分流，CVS 判 `storeId`、宅配判 `recipientAddress`

### [阻塞 2] 後台退款審核頁整頁 500
- 原因：`refund_requests.user_id` 的 FK 指向 `auth.users`（跨 schema），PostgREST 無法自動 JOIN `public.users`
- 修正：refund-requests API 改為兩段查詢（先取退款申請，再批次查 public.users）

### [阻塞 3] 優惠券抽籤 500 — `column uc.is_used does not exist`
- 原因：`user_coupons` 實際欄位是 `status`('unused'/'used'/'expired')，但 `play_gacha` DB function 使用已廢棄的 `is_used` 欄位
- 修正：migration `337_fix_coupon_is_used_column.sql`，`is_used = FALSE` → `status = 'unused'`，`SET is_used = TRUE` → `SET status = 'used'`
- migration 已套用至 PROD + STG

### [警告 1] 儀表板淨收/GMV 含未付款 pending 金額
- 修正：`dashboard/route.ts` recharge_records 查詢加 `.eq('status', 'success')`

### [警告 2] 儀表板「今日」統計用 UTC 而非台灣時間
- 修正：`parseDateOnly` 解析從 `T00:00:00.000Z`（UTC midnight）改為 `T00:00:00+08:00`（台灣 midnight）

---

## v2026.07.22a｜2026-07-22｜音效升級 + 修復儲值交易失敗

### 音效升級（第二輪）

**抽卡 CardFlipDirect**
- 卡包開啟瞬間：Web Audio 鋸齒波蓄力音（130→720Hz，0.5s）+ 300ms 後 paper-rip 撕裂音
- 每張牌點擊維持 flip 音（sword1.mp3），SSR bling 不變

**盒玩 BlindboxMachineMode2**
- 支付確認後 `gacha.mp3` loop 播放（機器運轉音效），落定後自動停
- 盒子碰地板/堆疊時 Web Audio 合成低頻 thud（90Hz→22Hz，限速 120ms 防連爆）
- 移除選取盒子音效（恭喜獲得彈窗有自己的音效，不需重複）

### 修復：STG/本地儲值交易失敗 10200074

**原因**：Vercel Preview（dev branch）環境沒有 ECPay 金流 env vars，後台送出 `MerchantID=undefined` 到 ECPay

**修復**：補設 Vercel Preview 環境的四個 ECPay 變數
- `ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` / `ECPAY_API_URL`（測試帳號 3002607 + stage URL）

---

## v2026.07.21l｜2026-07-21｜音效優化 — 沈浸式/抽卡/盒玩

### 沈浸式 IchibanTicket（撕紙）
- 音效從 `onDragEnd` 移至 `onDrag` 距離 > 5px 即觸發
- `hasSoundedRef` 防止拖曳 + 點擊路徑重複播放
- 失敗拖曳（< 8px 放手）重置 ref，不留狀態

### 抽卡 CardFlipDirect
- 新增 `useCardSounds` hook：`sword1.mp3`（翻牌）+ `u_o8xh7gwsrj...mp3`（SSR bling）
- 翻牌點擊瞬間播 flip 音；SSR shake 結束後播 bling + reveal

### 盒玩 BlindboxMachineMode2
- 新增 `useBoxSounds` hook：`changebox.mp3`（shuffle）/ `spinopel-open...mp3`（drop）/ `gachapush.mp3`（pick）
- handleShuffle → playShuffle；盒子落下 → playDrop；handleSlotClick → playPick

---

## v2026.07.21k｜2026-07-21｜一番賞流程優化（兩輪迭代）

### FigmaTearScene（原始經典）
- 最後一張 auto-trigger 延遲維持 1 秒（保持順暢）
- SKIP 按鈕恢復即時跳轉（移除 2 秒延遲 + "..." 顯示）
- `finishedRef` 防 SKIP 與 auto-trigger 重複呼叫

### 中間結果畫面（ichiban 通用）
- 新增 `openAllDone` state：點擊「全部開啟」後設 true
- `openAllDone=true`：按鈕變灰禁用，2 秒後自動呼叫 `handleBackToProduct`
- `openAllDone=true` 時不顯示三按鈕（前往倉庫/顯示獎項/繼續抽獎）
- 三按鈕保留給「逐張手動開啟所有」的情境（`allOpened && !openAllDone`）

### IchibanTicket 顯示簡化
- 移除票券非 showPrizeDetail 視圖的品項名稱（prizeName）和籤號（ticketNumber）
- 只顯示賞等（F賞 / A賞 / LAST ONE）

### 全部開啟後觸發 GachaResultModal
- openAllDone useEffect：桌機 modal → `onTearFinish(tearResults)` 觸發 GachaResultModal
- 手機：存 `ggb_tear_results` 至 sessionStorage → `handleBackToProduct` 導回商品頁 → 頁面 mount 讀取並彈窗

### 先前修正保留
- `isModal && ichibanTheme === 'ichiban_tear'` 時跳過中間畫面（避免桌機卡死）

---

## v2026.07.21j｜2026-07-21｜STG draw_records 欄位同步修復

### 問題
- STG `draw_records` 缺少 `txid_seed` 和 `points_used` 兩個欄位
- `play_ichiban` DB 函數寫入這兩個欄位，導致 STG 購買一番賞時報 `Purchase error: {}`
- PROD 早已有這兩個欄位，屬於歷史 STG/PROD 同步缺口

### 修復
- 補 migration `274_stg_sync_draw_records.sql`，已套用至 STG
- 清除 TicketSelectionFlow.tsx 中的 debug error logging

---

## v2026.07.21i｜2026-07-21｜前台 DS Token 大掃除（278 → 28 違規）

### tailwind.config.js 新增 token
- `accent-orange: '#FF5E00'`（MissionFrame 任務橘）
- `item-bg: '#28324E'`（商品縮圖佔位背景深藍灰）

### 違規修正（278 → 28，降 90%）
- `gray-*` → `neutral-*`（全站，15 → 0）
- `emerald-*` → `accent-emerald`（全站，56 → 0）
- `rounded-md` → `rounded-xl`（全站，76 → 0）
- `bg/text-[#EE4D2D]` → `bg/text-primary`（6 個檔案）
- `bg-[#28324E]` → `bg-item-bg`（profile × 4、WarehouseItemDetailModal）
- MissionFrame：`#ff5e00` → `accent-orange`、`#1b1b1b` → `neutral-900` 等
- 掃描腳本排除 `profilecard/` 子專案（shadcn 獨立 DS，不屬主程式）
- 剩餘 28 個 magic hex（排行榜金色、特殊背景色等）列為設計例外，暫不處理

---

## v2026.07.21h｜2026-07-21｜DS 稽核 + ActionBar 擴大遷移 + 後台修復

### 前台 DS 稽核頁強化
- Color Tokens 全面修正：primary `#EE4D2D`（橘紅）、加入 primary 4 子 token + accent 3 個、neutral 改為前台正確值
- 新增 UI Kit Components showcase：Button 6 variants、Input states、Modal 兩種模式、ActionBar/BottomSheet preview

### ActionBar 擴大遷移（共 6 頁）
- `exchange/[id]`、`exchange-orders/[id]`（3 個 conditional）、`item/[id]`

### 後台修復
- 後台登入頁 error 訊息改紅色樣式（原藍色語意錯誤）
- AdminLayout hydration mismatch 修復：`isSidebarOpen` 初始值固定 `true`，由 `useEffect` 從 localStorage 修正
- 後台登入頁標題改為「GGB後台管理系統 / 線上抽獎平台」

---

## v2026.07.21g｜2026-07-21｜AlertModal 整合 + ActionBar / BottomSheet 新組件

### AlertModal → Modal 整合（profile/page.tsx）
- `frontend/components/ui/Modal.tsx` 新增 `compact` prop（AlertModal 相容模式：320px 寬、圓角 2xl、標題置中）
- `profile/page.tsx` 6 個 `<AlertModal>` 全數遷移為 `<Modal compact>`
- logout 確認改用全域 `showAlert()` AlertProvider（不再用局部 state + AlertModal）
- 刪除 `frontend/components/ui/AlertModal.tsx`（零殘留引用）

### ActionBar 新組件
- 新增 `frontend/components/ui/ActionBar.tsx`：統一 fixed bottom 操作欄（backdrop-blur、safe-area-inset-bottom、shadow-modal）
- 支援 `hideOn="lg"` / `hideOn="md"` 響應式隱藏、`zIndex` 覆寫
- 已遷移：`sell/new/page.tsx`、`sell/new/specs/page.tsx`

### BottomSheet 新組件
- 新增 `frontend/components/ui/BottomSheet.tsx`：底部滑入抽屜（portal、遮罩、grab handle、ESC 關閉、body scroll lock）
- 支援 `title`、`height`、`zIndex` props
- 匯出至 `components/ui/index.ts`

---

## v2026.07.21f｜2026-07-21｜前台 UI Kit 整頓

### Button 系統整合
- 新增 `variant="solid"`（替代 SolidButton）：font-black、shadow-lg shadow-primary/30、active:scale、h-11（size lg）
- Primary / Danger variant 改 `font-black`，Secondary / Ghost / Outline 保持 `font-medium`
- 全 variant 從 `rounded-lg` → `rounded-xl`，`focus:ring-2` → `focus:ring-1`
- Loading spinner 改用 `Loader2`（簡潔 icon-only）
- 刪除 `SolidButton.tsx`；login、forgot-password、profile 三頁改用 `Button variant="solid"`

### 表單元件修正（Input / Select / Textarea）
- `border-2` → `border`、`min-h-[42px]` 移除、`focus:ring-2` → `focus:ring-1`
- `gray-*` → `neutral-*`（disabled 狀態、helperText）
- `rounded-lg` → `rounded-xl`
- Label 從 `text-sm font-medium text-neutral-700` → `text-xs font-semibold text-neutral-500`（對齊 DS 規範）
- 補齊 dark mode 樣式

### 死代碼清除
- 刪除 `EmptyState.tsx`（0 使用）
- 刪除 `FileInput.tsx`（0 使用）
- 刪除 `SidebarMenu.tsx`（0 使用）
- `RulesModal.tsx` z-[9999] → z-50（修正魔術數字）

---

## v2026.07.21e｜2026-07-21｜前台 Design System 稽核系統 + UI 統一

### 前台 DS 合規掃描系統（新增）
- Migration 336：建立 `frontend_design_scan_runs` + `frontend_design_scan_results` 兩張表（PROD + STG 同步）
- `backend/scripts/frontend-design-scan.ts`：掃描前台所有 .tsx/.ts，檢測 magic hex、bg-primary-600、gray-*、emerald-*、rounded-md、z-[magic]、inline style color 等違規
- `backend/app/api/admin/frontend-design-scan/route.ts`：讀取最新掃描結果 API
- `backend/app/frontend-design-system/page.tsx`：重寫為 live compliance scanner（對齊後台 Design System 頁架構）
  - CompliancePanel：統計摘要 / 違規類型分布 / 可展開違規檔案列表
  - Color Tokens 展示（light + dark mode）
  - z-index 規範表
  - 禁用 class / pattern 清單
- 初次掃描結果：272 個檔案 / 292 個違規 / 62 個違規檔案

### 前台 Navbar 導航修正
- 商品詳情頁（`isProductDetailPage`）：返回圖標 + 標題合併為單一 `<button>`，整體可點擊

### 頂部導航統一（SimplePageHeader）
- 新增 `frontend/components/ui/SimplePageHeader.tsx`（h-14 固定 header，含 back/title/right slot）
- 套用至 5 個規則頁、login、forgot-password、profile 手機驗證 modal

### 死代碼清除
- 刪除 `frontend/components/ui/Badge.tsx`（零使用）
- 刪除 `frontend/components/NewsCard.tsx`（零使用）
- 刪除 `frontend/components/PageCard.tsx`（@deprecated，零使用）

### 共用工具抽取
- `frontend/lib/productImage.ts`：ITEM_IMAGES 陣列 + getItemImageForId + DEFAULT_ITEM_IMAGE（修正 defaulet → default typo）
- `frontend/lib/timeAgo.ts`：timeAgo() 共用工具
- `frontend/components/news/CategoryBadge.tsx`：CategoryBadge 共用元件

### 全站色碼修正
- bg-[#F5F5F5]（45 處）→ bg-neutral-50
- bg-primary-600（2 處）→ bg-primary、bg-primary-700 → bg-primary/90

### 商品頁背景圖移除
- GachaProductDetail：移除 gacha/bg.png 背景
- item/[id] card 類型：移除 card/pcbg.png 桌面背景

---

## v2026.07.21d｜2026-07-21｜規則頁面 RWD 完善 + 商品頁手機導航

### 規則頁面（5 個：gacha / blindbox / ichiban / card / custom）
- 步驟卡片圖片改為 `fill` 模式（支援 RWD 容器尺寸），桌面維持 100×100px
- 標題加 `whitespace-nowrap`，防止「選擇商品並抽獎」等標題在 3 欄格局換行
- 頂部導航全尺寸都顯示（保留桌面返回按鈕）

### 商品頁（`/item/[id]`）
- 新增手機端專屬固定頂部導航（`md:hidden`，z-[200] 蓋在 Navbar 上）
- 顯示商品名稱 + 返回按鈕，桌面端沿用原 Navbar

---

## v2026.07.21c｜2026-07-21｜盒玩詳情頁補猜你喜歡

- `GachaCollectionList` 移出 scale 容器，放至正常文件流
- flex wrapper 補 `marginBottom = 375 * (932/750) * (scale-1)` 補償視覺高度
- 效果：品項總覽 + 猜你喜歡 與轉蛋頁一致

---

## v2026.07.21b｜2026-07-21｜輸入框驗證全站補強

### 電話號碼
- 新增 `frontend/lib/phone.ts` 共用工具（normalizePhone / isValidPhone / 常數）
- 所有手機號碼輸入框統一：`inputMode="numeric"`、placeholder `例：0900123456`、onBlur 自動正規化（886xxx / 9xxxxxxx → 09xxxxxxxx）
- 套用位置：配送申請、超商設定、編輯地址、手機驗證、FAQ 客服表單、交換訂單收件人

### 姓名欄位
- 所有姓名欄位：`maxLength={30}`、placeholder `例：王吉比`
- 暱稱編輯：補 `maxLength={20}` / `minLength={2}`（UI 說 2-20 但原本無 HTML 限制）

### 密碼欄位
- 三個入口（login、forgot-password、update-password）統一加入：密碼不得包含中文字元檢核

### 其他
- 私訊輸入框 `maxLength={1000}`
- 賣場商品名稱 / 描述補 HTML `maxLength`（60 / 3000）
- 銀行帳號 `inputMode="numeric"`

---

## v2026.07.21a｜2026-07-21｜成就任務系統大修

### 最高獎成就 trigger（migration 333）
- 新增 `draw_records` AFTER INSERT trigger，自動追蹤最高獎成就
- 適用商品類型：ichiban / card / custom（轉蛋/盲盒無賞等，排除）
- 最高獎定義：`product_prizes.total <= 3`
- 命中：`top_prize_count+1`、`bad_luck_streak=0` + 任務進度更新
- 未命中：`bad_luck_streak+1` + 任務進度更新
- 修正 `top_prize_count` / `bad_luck_streak` 原本從未被更新的問題

### 一發入魂定義修正（migration 335）
- 原本：帳號史上第一筆 draw_record 才算（條件太嚴苛）
- 改為：對任一商品的第一次抽獎即抽中最高獎（每個新商品都有機會）

### 任務文字統一（migration 334）
- 所有「轉蛋」改為「抽獎」（21 筆，PROD + STG）
- 移除成就描述括號說明文字

### 一番賞抽獎追蹤補漏
- `TicketSelectionFlow` 補呼叫 `track_mission_event(draw_count)` + `check_achievements`
- 原本一番賞完全不計入任何抽獎任務次數

---

## v2026.07.20m｜2026-07-20｜競品爬取修正

### 修正 Clove 只顯示 1 筆
- `extractCloveUrlsFromHtml` 舊 regex `cmm[a-z0-9]+` 只能匹配 `cmm` 開頭的 ID
- 實際頁面 ID 格式為 Cuid2（`cmi...`、`cmq...`、`cmr...`），33 個商品全部漏抓
- 改用 `"id":"cm[a-z0-9]{18,}"` JSON 模式，curl 驗證可正確識別全部 33 筆

### 91toy 標記為 SPA
- 首頁只有導覽連結，商品列表由 JS 渲染，HTML 爬取無法取得商品連結
- 競品列表加上「SPA，可能無法爬取」橙色標記

---

## v2026.07.20l｜2026-07-20｜後台工具全面重新設計

### 全新競品爬取體驗（tools/page.tsx 完整重寫）
- **單一入口**：貼任意 URL（首頁/列表頁/商品頁）一鍵開始，自動判斷列表或單筆
- **三段式進度條**：1. 發現連結 → 2. 抓取資料 → 3. AI 補齊，清楚顯示當前階段與百分比
- **商品表格**：每列顯示 72×72 縮圖（點擊彈大圖）、名稱/類型/價格/代理商/稀有度⭐/熱賞標籤
- **AI 補齊欄位**（新 `/api/tools/ai-enrich` 端點）：Claude Haiku 自動推斷代理商、稀有度（1-5星）、是否熱賣；AI 推測值以橙色 ✦ 標示
- **獎項可展開**：點「X 項 ▼」展開子表格，獎項圖片同樣支援縮圖 → 彈窗
- **圖片彈窗**：點縮圖 → overlay 顯示原圖 + 來源連結
- **修正異步 bug**：AI 補齊階段改用 localResults Map 避免 React state 閉包讀取過期問題

### 新增 API：/api/tools/ai-enrich
- 輸入：name、typeGuess、prizes、sourceHost
- 輸出：supplier、rarity（1-5）、isHot、aiFilledFields

---

## v2026.07.20k｜2026-07-20｜後台工具強化（任意網址爬取）

### expand-list：通用商品連結發現（任意網站）
- 新增 `extractGenericProductLinks()`：解析任意頁面所有 `<a href>` 連結，過濾非商品路徑，依 URL path prefix 聚類，回傳最多商品連結的路徑群
- 支援 dopaminekuji.com 等未知網站，不再侷限 slimetoy/clove

### scrape：Claude AI fallback prize 提取
- 當 JSON-LD / nextData / text regex 都無法提取獎項時，改用 `claude-haiku` 讀取頁面文字並結構化輸出
- 適用任何商品頁，包含日文/中文混排的一番賞/轉蛋頁面

### 工具 UI：列表頁自動偵測
- 單筆模式若無獎項，自動在背景呼叫 expand-list
- 發現商品連結時顯示藍色提示欄「發現 X 個商品，切換批量模式」
- 一鍵切換批量模式並載入所有連結

---

## v2026.07.20j｜2026-07-20｜全站 SEO 強化（關鍵字・Sitemap・Article JSON-LD）

### 全站 keywords + 更強的 title/description（root layout）
- 新增 SITE_KEYWORDS 涵蓋 30+ 關鍵字：線上轉蛋、線上一番賞、線上抽獎、轉蛋台灣、盲盒、盒玩、寶可夢卡牌、集換式卡牌、吉吉比、GGB 等
- Root title 改為「吉吉比｜線上轉蛋・線上一番賞・盲盒・卡牌 台灣最大平台」
- OG image 改用 banner.png

### 商品頁 SEO 強化（seo-products.ts）
- Title：{商品名}｜線上一番賞/轉蛋/盲盒/抽卡 吉吉比
- Description 自動帶入商品名、系列、單抽價格、剩餘數量、關鍵字
- 每頁獨立 keywords meta

### 情報文章 SEO 強化（news/[id]/layout.tsx）
- 新增 NewsArticle JSON-LD，符合 Google 新聞/Discover 收錄資格
- Title、description、OG 全面補強關鍵字

### Sitemap 加入新聞文章
- fetchNewsForSitemap() 撈所有 is_active=true 文章加入 sitemap
- 新聞列表頁 changeFrequency 改 hourly
- 商品頁 priority 提升至 0.8

---

## v2026.07.20i｜2026-07-20｜商品建立修正（抽卡賞等 + R2 憑證更新）

### 抽卡商品賞等改為一翻賞制（A賞～J賞）
- 移除 `cardLevels`（N/R/SR/SSR/UR/LR/SP/SEC/PR/HR/GR/MR/CHR）
- 抽卡類型改用 `ichibanLevels`，與一翻賞/自製賞統一（新增頁 + 編輯頁同步）

### R2 API Token 更新
- 舊 token 失效（signature mismatch），在 Cloudflare dashboard Roll 後更新 `R2_SECRET_ACCESS_KEY`
- 同步更新 `backend/.env.local` 和 `frontend/.env.local`

### Upload route 401 錯誤訊息改善
- 原本「Unauthorized」改為「請重新登入（session 已過期）」，更容易 debug

---

## v2026.07.20h｜2026-07-20｜統一 Loading 畫面（全商品類型）

### 統一商品頁 Loading 畫面
- 新增 `ProductLoadingScreen` 共用元件（`frontend/components/ui/ProductLoadingScreen.tsx`）：淺色背景 + Loader2 spinner + 「載入商品中...」
- **轉蛋（gacha）**：機台圖片載入完成後才顯示內容，載入期間 content hidden-render（避免 layout shift）；GachaProductDetail 新增 `onMachineReady` prop
- **盒玩（blindbox_mode2/3）**：`onLoaded` 觸發 `isMachineReady`，機台主圖下載完成後才撤除 Loading；其他盒玩主題（影片）資源載入後立即 ready
- **一翻賞/抽卡/自製賞**：DB 資料就緒即 ready，無機台圖片等待
- **3s 安全 fallback**：圖片載入失敗或超時，3 秒後強制顯示內容
- 統一替換舊的深色「資源下載中...」Loading 畫面

---

## v2026.07.20g｜2026-07-20｜盒玩落地快速穩定 + 換一批不禁用 + 購買速度優化

### 盒玩物理徹底重寫（mode2/3）
- **根本原因**：spring 在落地後把 avZ 從 0.03 rad/s 拉升到 3 rad/s，造成持續旋轉；`callDone` snap 跳到 targetAngleZ（最多 84° 跳動）
- **修法**：移除 spring，改純摩擦衰減（`avZ *= 0.80`）；落地瞬間 `avZ *= 0.30` 立刻切速；不設 targetAngleZ，callDone 保留 angleZ 原位不 snap
- 落地後 ~0.3 秒內 Z 旋轉停止，X/Y lerp 0.35 快速收斂到 BASE_AX/BASE_AY
- 碰撞 spin 只加給未落地盒子，防止已落地盒子被連續擾動

### 換一批點擊後三顆按鈕不禁用（mode2/3）
- 移除 `isShuffling` 禁用條件；立即開盒/試試看 onClick guard 同步移除

### 購買流程加速（blindbox + 所有 gacha）
- 移除購買前的庫存 pre-check refresh（省 200-500ms RTT），server 端已在 `play_gacha_locked` 做驗證
- API route `getUser()` 改 `getSession()`，避免 Supabase Auth server 額外請求（省 100-300ms）

---

## v2026.07.20f｜2026-07-20｜盒玩落地物理平滑化 + 取物口蓋板改由圖片實現

### 盒玩落地物理平滑化（mode2/3）
- **問題**：盒子落地後會跳成停止（離散 lerp + 硬 snap），視覺上不連貫
- **修法**：改用漸進式阻尼 + spring force，落地後 0~800ms 內阻尼從 0.88 漸升至 0.97，同時以 spring 向目標角度收斂
- 新常數 `ANG_FRIC_LAND = 0.88`、`ROT_FRIC_LAND = 0.84`
- `allSettled` 改為角速度門檻判斷（`avZ < 0.10`、`avX/Y < 2.0`）+ 2500ms 安全 fallback

### 取物口蓋板改由美術圖實現
- 移除 CSS `filter: invert(1) opacity(0.5)` 的 hole.svg 黑遮罩
- 效果改由 `hole_bg.png` 美術圖直接呈現（mode2/3 主圖同步更新）

---

## v2026.07.20e｜2026-07-20｜盒玩取物口蓋板 + 換一批禁用補完 + 圖片補 git

### 盒玩機取物口黑色半透明蓋板（mode2/3）
- 新增常駐黑色圓角矩形遮罩模擬塑膠透明蓋效果
- 使用 `hole.svg`（510×167 rx=80 rounded rect）作為形狀，`filter: invert(1) opacity(0.5)` 轉成 50% 黑色
- 改用百分比定位（120/750, 570/932, 510/750, 167/932）解決固定像素在縮放容器中位置偏移的問題
- 點擊取物 click area 改為 z=14（覆蓋於蓋板之上）

### 換一批按鈕禁用補完（mode2/3）
- 補上 `readyToPick` 條件，確保盒子落地等待取物時三顆按鈕全部禁用

### 補上未追蹤的靜態圖片資源
- `frontend/public/images/blindbox/mode3/box/1-6.png`、`mode2/box.svg`、`mode3/box.svg` 首次加入 git 追蹤
- 先前只存在本機，staging 部署後找不到 3D 盒子六面圖

---

## v2026.07.20d｜2026-07-20｜換一批3D盒消失修正 + 按鈕禁用邏輯統一

### 換一批動畫 3D 盒子消失 bug 修正（BlindboxMode2/3）
- **根本原因**：CSS `opacity < 1` 在同一 DOM 元素套用 `transform-style:preserve-3d` 會強制建立 stacking context，導致 3D 塌成 2D 單面（只剩 4.png 正面）
- **修法**：shelf 盒子改用兩層 div — 外層處理 opacity 動畫（無 preserve-3d），內層處理 3D transform 動畫（無 opacity）
- shuffle keyframe 拆成 `ggb-3d-shuffle-fade` + `ggb-3d-shuffle-transform-c${col}` 分開跑

### 轉蛋/盒玩所有模組按鈕禁用邏輯統一
- **轉蛋機（GachaMachineVisual/Mode2/3/4）**：
  - 新增 `disableButtons` prop，由 GachaProductDetail 統一計算（`machineState !== 'idle' && !isPushShaking`）
  - 推一下（shaking 200ms）→ 三顆按鈕**不禁用**
  - 立即轉蛋/試試看（spinning→result）→ 三顆全禁用直到關閉恭喜獲得彈窗
- **盒玩機（BlindboxMode2/3）**：
  - 換一批動效中（`isShuffling`）→ 三顆全禁用（原本立即開盒/試試看漏掉此條件）
  - 立即開盒/試試看 → 三顆全禁用直到關閉彈窗

---

## v2026.07.20b｜2026-07-20｜移除 blindbox_mode2 盒子圖片上傳欄位

### 後台商品編輯頁
- 移除 `blindbox_mode2` 專用的盒子圖片上傳欄位
- 兩個模式（mode2/mode3）現在都用固定六面圖，上傳欄位已無作用

---

## v2026.07.20a｜2026-07-20｜BlindboxMode2 升級3D盒子 + 全機台禁用按鈕修正

### BlindboxMachineMode2 升級 3D 立體盒
- 完整移植 Mode3 的 CSS preserve-3d 系統，Box3DFaces 六面圖（共用 `mode3/box/1-6.png`）
- SHELF_SCALE=0.82、透視旋轉、CSS keyframe 前位移 → 翻倒（名稱加 `-m2` 後綴避免衝突）
- 物理引擎升級：angleX/Y/Z 三軸旋轉，落地後 lerp 歸位，10 抽空中碰撞有 3D 角衝量

### 全機台禁用按鈕移除透明度
- 售完/換一批禁用狀態移除 `opacity-40`，只保留 `grayscale`
- 涵蓋：BlindboxMode2/3、GachaMachineVisual、GachaModeMode2/3/4

---

## v2026.07.19d｜2026-07-19｜blindbox_mode3 叢林探險 + 換一批動畫 + UI 修正

### 新模組：blindbox_mode3（叢林探險販賣機）
- 複製 mode2 架構，換 main/hole_bg/btn 圖片為 mode3 素材
- 後台商品設定、全站模組設定、gacha-themes type 均已加入

### 換一批動畫全面重設計（mode2 & mode3）
- 前排：滑到定點後 opacity→0 淡出（delay 0.3s, duration 0.5s）
- 後排：移至前排原始位置後停留，不回彈
- t=600ms：後排後方新盒子淡入（stagger 40ms/欄）
- t=1400ms：shelfKey++ 瞬間重整架上盒子（initial={false}，無動畫）
- 彈窗關閉後也用相同 shelfKey++ 機制，後排不再滑回

### 盒玩頁面 UI 修正
- 總覽/商品資訊卡片加 `px-2 py-2`，左右 padding 與轉蛋頁一致
- 背景改為純色 `bg-neutral-50 dark:bg-neutral-950`，移除 gacha 背景圖

---

## v2026.07.19c｜2026-07-19｜blindbox_mode2 動畫大幅升級

### BlindboxMachineMode2 物理動畫全面優化
- **貨架佈局改版**：2 排 × 5 格 → 上下架各前後排（20 slot 共 4 列），每格前排 + 後排（scale 0.90，往上 12px、往右 4px）
- **前後排聯動位移**：前排 nudge 時後排同步移至前排原始位置（補 Y/X 偏移 + scale 1.0），落下後後排停留原位直到彈窗關閉
- **物理落下引擎**：改用完整 rAF 物理循環（gravity=1200，分前後排 floor，碰撞僅同排，天花板約束在碰撞後夾制）
- **取物口修正**：物理牆縮至視覺遮罩外 10px；落地 av 收斂（`av * 0.4 + rand(-0.5, 0.5)`）；settle 條件加入 av < 0.3 門檻
- **彈窗時序修正**：`handleMode2AnimComplete` 不提前 setMode2State('idle')，保留取物口盒子至彈窗關閉後才 reset

---

## v2026.07.19b｜2026-07-19｜盒玩新模組 blindbox_mode2（Dreamy Box 貨架機台）

### 新增盒玩 mode2 機台
- **BlindboxMachineMode2**（`frontend/components/shop/BlindboxMachineMode2.tsx`）：
  - 2 排 × 5 格貨架（22px 重疊），抽後盒子消失，關彈窗刷新滿格
  - Z 軸放大 → Y 軸飛至取物口 → hole.svg 遮罩下落動畫
  - 10 抽各錯開 180ms stagger
  - 全部進洞後 2 秒彈出恭喜獲得結果彈窗
- **blindbox/[id]/page.tsx**：偵測 `machine_theme === 'blindbox_mode2'` 切換至新元件
- **Migration 332**：`products.box_image_url TEXT`（盒子圖片，STG 已套用）
- **後台**：machine_theme 選 blindbox_mode2 時顯示盒子圖片上傳欄（正方形）

---

## v2026.07.19a｜2026-07-19｜新增轉蛋模組 mode3（金光閃閃）、mode4（狗狗蛋箱）

### 新增轉蛋機台模組
- **mode3 金光閃閃**（`frontend/components/shop/GachaMachineMode3.tsx`）：複製 mode2 旋鈕機台，換 `main.png` 主圖，圖素路徑改至 `gacha/mode3/`
- **mode4 狗狗蛋箱**（`frontend/components/shop/GachaMachineMode4.tsx`）：無旋鈕設計，box / hole 改用自訂 SVG 遮罩（CSS mask），圖素路徑 `gacha/mode4/`
- 四個登記點全部同步更新：
  - `backend/app/settings/modules/page.tsx` → PRODUCT_TYPES 全站預設
  - `backend/app/products/[id]/page.tsx` → MODULE_OPTIONS 各別商品覆蓋
  - `frontend/components/shop/GachaProductDetail.tsx` → MACHINE_COMPONENTS
  - `frontend/components/gacha-themes/index.tsx` → MachineTheme type + THEME_MAP
- **CLAUDE.md** 補充抽獎模組架構說明，防止日後遺忘登記點

---

## v2026.07.18d｜2026-07-18｜積分消耗顯示修正（前台抽獎紀錄 + 後台消費報表）

### 積分消耗顯示修正
- **根本原因**：`draw_records.points_used` 存的是 G 等值（e.g. 150G），實際積分需 × 4（e.g. 600 積分）
- `draw_records` 的 `points_used` 維持儲 G 等值（供廠商結算用），顯示層統一 × 4 換算
- **前台抽獎紀錄**（`frontend/app/profile/page.tsx`）：
  - select 補撈 `points_used`；累計至群組
  - 有積分消耗時顯示「X 積分」（indigo 色），否則顯示 G 幣圖示 + 數字
- **後台消費報表**（`backend/app/reports/[type]/page.tsx`）：
  - 積分欄由 `N G` 改為 `N×4 積分`
  - KPI 總積分卡、CSV 匯出同步修正

---

## v2026.07.18c｜2026-07-18｜留言頭像修正 + DB 同步 + 機器人留言改短

### 留言頭像丟失修正（`frontend/app/news/[id]/page.tsx`, `frontend/app/api/news/[id]/comments/route.ts`）
- `Avatar` component 改為：有 src 顯示圖片 → 有名字顯示首字 → 否則顯示預設 `/images/avatar/01.png`
- 留言 GET API `name` 欄位加 fallback `|| '用戶'`
- 留言 POST API 從 `user.user_metadata` 取 avatar_url/name 作備用

### 機器人留言字數大幅縮短（`backend/app/api/cron/news-agent/route.ts`）
- prompt 改為「絕大多數 1~8 字元，偶爾 1 則最多 15 字元」，不寫完整句子
- 舊有長留言不追溯修改，新文章起套用

### DB 同步（PROD）
- migration 330：`token_adjustments` RLS 補 SELECT policy（修正 token_ledger 手動補幣前台讀不到）
- migration 331：`create_delivery_orders_split` 補回 STG（從 PROD 對齊）

---

## v2026.07.18b｜2026-07-18｜prod 環境修正（超商選店/配送訂單賞等/ECPay 物流測試環境）

### 超商取貨選店 404 修正
- 前台 Production `NEXT_PUBLIC_API_URL` 未設 → 加入 `https://admin.ggb.com.tw`
- 修正 `form.action = '/api/logistics/map'` 打到前台自己 404 的問題

### 配送訂單品項賞等標籤（`frontend/app/profile/page.tsx`）
- 配送訂單展開品項標籤同步修正：轉蛋/盒玩顯示「普通」，其他顯示「X賞」
- query 補 `products ( name, type )`，mapping 加 gacha/blindbox 強制覆蓋邏輯

### 後台 Production ECPay 物流測試環境憑證
- 設定 `ECPAY_LOGISTICS_MERCHANT_ID / HASH_KEY / HASH_IV / MAP_URL / API_URL` 為綠界測試環境
- 使用測試帳號 3002607，物流 API 指向 `logistics-stage.ecpay.com.tw`

---

## v2026.07.18｜2026-07-18｜Staging 環境變數修正（儲值頁 Unauthorized）

### Vercel Preview 環境變數修正
- 前台 Preview `NEXT_PUBLIC_API_URL` 原為空字串 → 改為 `https://ggb-backend-git-dev-ggbtw.vercel.app`
- 後台 Preview `NEXT_PUBLIC_BASE_URL` 原為空字串 → 改為 `https://ggb-backend-git-dev-ggbtw.vercel.app`
- 後台 Preview `NEXT_PUBLIC_FRONTEND_URL` 原為空字串 → 改為 `https://staging.ggb.com.tw`
- 修正後 staging.ggb.com.tw 儲值頁按確認支付會正確呼叫後台 API 並傳送 JWT 驗證

---

## v2026.07.17｜2026-07-18｜倉庫/分解/抽獎紀錄 UI 修正 + 超商選店 PWA 修正

### 倉庫品項列表（`frontend/app/profile/page.tsx`）
- 轉蛋、盒玩品項的賞等標籤固定顯示「普通」（不再顯示品項名稱）
- 分解紀錄手機版從 2 欄格狀改為直式列表（同倉庫格式），顯示廠商名、賞等標籤、品項名、商品名、代幣回收數
- 分解紀錄查詢新增 `suppliers` join，補入廠商名稱欄位

### 抽獎紀錄（draw-history）
- 轉蛋、盒玩品項展開後不顯示籤號（其他類型保留）
- 賞等標籤同步顯示「普通」

### 超商選店 PWA 修正
- 選店表單改用 `form.target = '_blank'`，避免 PWA 畫面被 ECPay 頁面取代
- 新增 `frontend/app/logistics/cvs-callback/page.tsx`：選店完成後用 `postMessage` 回傳門市資訊給 PWA opener；無 opener 時改寫 `localStorage` 待 PWA 下次 focus 讀取
- `backend/app/api/logistics/map-callback/route.ts` 改導向 `/logistics/cvs-callback` 而非 `/profile`

### 配送錯誤訊息改善
- `handleConfirmDelivery` 錯誤 log 改為輸出 `.message`、`.code`、`.details` 欄位，方便排查

### Migration 327 — orders 補 logistics 欄位
- `orders` 表新增 `logistics_type`、`logistics_subtype`、`store_id`、`store_name` 四欄
- 修正 `create_delivery_order` RPC 插入失敗（column does not exist）

### 超商取貨 PWA 空白頁根本修正（Migration 328 + server-side polling）
- 根因：ECPay callback 在 SFSafariViewController，無法與 PWA WKWebView 共享 session / localStorage
- 新建 `cvs_pending_selections` 表（migration 328），後端 callback 後寫入門市資料
- 前端表單送出時產生 `requestId`，透過後端線程帶入 ECPay callback URL
- 前端在 WKWebView 內 polling `/api/logistics/cvs-pending?token=xxx`（2秒一次，最多 90 秒）
- 收到資料後自動填入門市並彈出配送 modal，不依賴任何跨 context 通信
- 新增 `frontend/app/api/logistics/cvs-pending/route.ts` polling 端點

---

## v2026.07.16｜2026-07-18｜新轉蛋機 mode2 + 後台 sidebar 調整 + 分析頁週區間圖表

### 新轉蛋機模組 `gacha_mode2`
- 新增 `frontend/components/shop/GachaMachineMode2.tsx`
- 使用 `frontend/public/images/gacha/mode2/` 圖素（main.png 750×932、box.svg、hole.svg、switch.png、btn1/btn2）
- 蛋箱區 (3.6%, 7.94%)、switch 旋鈕 (39.87%, 56.22%)、蛋口 (66.67%, 62.23%)，按鈕位置與經典版相同
- 確認付款 → switch 旋轉 360° → 蛋墜入蛋口 → 等待點擊蛋口顯示獎品
- switch 圖片與「立即轉蛋」按鈕都可觸發購買確認彈窗
- 在 `GachaProductDetail.tsx` 的 `MACHINE_COMPONENTS` 新增 `gacha_mode2` 對應

### 後台 Sidebar 調整（`backend/components/AdminLayout.tsx`）
- 移除 LOGO 圖片，改用純文字「GGB管理後台」
- 側欄收起時顯示「G」縮寫

### 分析頁週區間圖表（`/analytics-overview`）
- 8–90 天範圍自動改用週（週一）為 x 軸區間，修正 G2 ordinal 排序錯亂問題
- 儲值與消耗對比 LineChart：ResizeObserver 動態填滿高度（maxHeight 360）
- y 軸對齊修正、圖例 paddingTop 統一為 24px

---

## v2026.07.15｜2026-07-16｜分析頁 — 換用 @ant-design/charts 圖表 + DateRangePicker

### 分析頁圖表升級（`/analytics-overview`）
- 安裝 `@ant-design/charts` v2.6.7（G2 5.0）
- `Sparkline` SVG → `Tiny.Area`（平滑曲線面積圖，dynamic import + ssr:false）
- `DonutChart` SVG → `Pie`（innerRadius=0.68，真實 AntD 風格甜甜圈）
- `BarChart` SVG → `Column`（自動調色，hover highlight）
- 右上角時間選擇器換用已有的 `DateRangePicker` 組件（與儲值明細頁相同），搭配今日/本週/本月/本年快捷按鈕
- API 改為只接 `start`/`end` 參數，去除 `period` 字串，前後期自動從時間長度推算
- 新增 `spark` 欄位（最近 14 個日/月資料點）供 KPI sparkline 使用

---

## v2026.07.13｜2026-07-16｜分析頁 — Ant Design Pro 風格營運儀表板

### 新頁面：`/analytics-overview`（營運總覽 → 分析頁）

**4 層資料視覺化**，右上角時間切換（今日/本週/本月/本年/自訂）統一控制所有層：

**第 1 層 — KPI 卡片**（4 格橫排，白底 + 分隔線）
- 總銷售額、訪問量、消費筆數（抽獎）、總儲值金額
- 每卡片：大字值 + 周同比 % + 日同比 % + 迷你 Sparkline
- 轉化率 = totalDrawCount / totalVisits × 100%
- 客單價 = totalSales / totalDrawCount

**第 2 層 — 線上熱門搜尋 + 銷售類別佔比**
- 熱門搜尋：`search_logs` GROUP BY keyword，顯示搜尋次數 + 同比成長%
- 類別佔比：`draw_records → products.type`，SVG 甜甜圈圖（純 stroke-dasharray 不依賴外部套件）

**第 3 層 — 廠商銷售概覽**
- Tab 切換：銷售額 / 消費筆數
- 左側：時間序列 SVG 柱狀圖（日或月 breakdown）
- 右側：廠商銷售排行榜（mini progress bar）

**第 4 層 — 廠商轉化率**
- 各廠商 SVG 環形進度圓（銷售佔比 %）
- 60%+ 藍、30%+ 綠、<30% 琥珀

### 新 API：`/api/admin/analytics-overview`
- 支援 `period` + `start/end` 參數
- 同時查 current + previous period，計算周同比
- 另查今日/昨日 → 日同比
- Bot 排除（同財務 query 慣例）
- 返回：totalSales, totalVisits, totalDrawCount, totalRecharges, bars[], keywords[], categories[], suppliers[]
- `bars` 本年模式按月分組（12 根），其他模式按日分組

### 所有圖表純 SVG / CSS，無外部圖表套件

---

## v2026.07.12｜2026-07-16｜Design System — 商品品項 form + Toolbar 高度統一

### 商品品項卡片重設計（products/[id]/page.tsx）
- 每個欄位加上明確 `<label>`：品項名稱、等級、總數量、剩餘庫存、抽中機率、分解設定
- 卡片結構：標頭（品項N + 剩餘/總計 + 刪除）+ 主體（圖片+名稱橫排、等級、3欄數量、分解設定）
- 卡片改用 `bg-white rounded-xl`，標頭 `bg-neutral-50 border-b`
- 轉蛋／盒玩分解設定改為禁用表單（SelectField disabled + input disabled），而非純文字

### Toolbar 高度統一 — 全站三種高度收斂為 `h-9`（36px）
**根本原因**：
- text 按鈕 `py-2 border`（38px）≠ 匯出CSV `py-2 border-2`（40px）≠ icon 按鈕 `w-10 h-10`（40px）≠ 搜尋框 `py-1.5`（34px）

**SearchToolbar 修正**：
- 新增按鈕：`py-2` → `h-9`
- 匯出CSV：`py-2 border-2` → `h-9 border`
- 搜尋框：`py-1.5` → `h-9`
- icon 按鈕（密度/篩選/欄位）：`w-10 h-10 border-2` → `w-9 h-9 border`
- 批量操作按鈕：`py-1.5` → `h-9`

**Picker 觸發器修正**（DatePicker、DateRangePicker、YearMonthPicker）：
- 全部由 `py-1.5 / py-2` → `h-9`

**頁面自訂按鈕修正**：
- products/page.tsx：智能批量匯入、上傳圖片 `py-2` → `h-9`
- recharges/page.tsx：近三個月快選月份按鈕 + 匯出CSV
- reports 8 個子頁面：匯出CSV `py-2 border-2` → `h-9 border`

---

## v2026.07.11｜2026-07-16｜Design System — 頁面佈局標準化

### 根本問題修正：雙層 padding
- AdminLayout `<main>` 已有 `p-6`，多頁頁面根 div 又加 `p-6` 造成雙層 padding
- 受影響頁面（移除根 div 的 `p-6`）：categories, coupons, exchange, marketplace, exchange-orders, sell-orders, sell-orders/[id], categories/[id], tools

### 根 spacing 統一：`space-y-4` → `space-y-6`
- 修正：agent-events, content-drafts, dev-logs, leaderboard-bots, news, recharge-review, recharges

### suppliers 結構升級
- 原本用 raw `<div className="bg-white rounded-lg border...">` 包裹 table
- 改用 `<PageCard noPadding>`，與其他列表頁一致
- 新增 `import PageCard`

### sell 頁加 `space-y-6` wrapper
- StatsCard grid + PageCard 原本直接在 AdminLayout 下（無間距 wrapper）
- 包上 `<div className="space-y-6">`；grid gap `gap-3 → gap-4`

### coupons 頁移除冗餘標題
- `<h2>折價券列表</h2>` 與 AdminLayout pageTitle 重複，移除
- `hover:bg-primary-dark` 修正為 `hover:bg-primary/90`

---

## v2026.07.10｜2026-07-16｜Design System — SelectField 元件統一全站表單欄位

### 新元件：`SelectField`（`components/ui/SelectField.tsx`）
- 統一封裝 `appearance-none + 自訂 chevron + py-1.5 px-3 text-sm border rounded-lg`
- `compact` prop 提供 text-xs 緊湊模式（用於品項行內編輯）
- disabled 狀態自動套用 bg-neutral-50

### 全站 `<select>` 替換（48 個 → SelectField）
- **批量腳本**：20 個頁面（settlement-snapshots, reports, analytics, competitor-intel, logs, content-drafts, exchange, users, news, dev-logs 等）
- **手動修**：products/[id]（8 個，含 div.relative+svg wrapper 全部拆除）、products/new（7 個）、orders/[id]（pill 樣式 select 保留特殊 className）
- 根本解決：所有 select 現在 `appearance-none`，跨瀏覽器高度一致，加上統一 chevron 圖示

### 自訂 picker 高度統一
- `DatePicker` / `YearMonthPicker` 觸發器加入 `text-sm px-3`，與 input/select 高度對齊

### Badge 補完
- exchange-orders: done 狀態 span → Badge
- logs: success/失敗 status span → Badge
- reports/coupons: 已使用/未使用 span → Badge
- users/[id]: isPending + failed overlay span → Badge

---

## v2026.07.9｜2026-07-16｜Design System 收尾 — 最後 6 處 inline span 換 Badge

### Badge 組件擴充 + 最後一批覆蓋
- statusVariantMap 新增報表用狀態：`success / shipped / in_warehouse / pending_delivery / refunded / exchanged / dismantled / listing`
- `reports/[type]/page.tsx`：STATUS_COLOR span（recharge/消費兩個資料表）→ Badge；供應商名稱 span → `<Badge variant="primary">`
- `recharge-review/page.tsx`：待複核 amber span → `<Badge variant="warning">`
- `competitor-intel/page.tsx`：AI 爬取 span → `<Badge variant="primary">`
- `news/page.tsx`：已上架/下架草稿計數 span → `<Badge variant="success">` / `<Badge variant="default">`

---

## v2026.07.8｜2026-07-16｜Design System 深掃第二輪 — Badge 全覆蓋 / TableEmpty / th 排版統一

### Badge 組件擴充 + 全站覆蓋
- statusVariantMap 新增 15 個狀態：open/in_progress/resolved/closed/approved/published/archived/confirmed/pending 等 CS 工單 + 草稿 + 月結狀態
- 替換 content-drafts, cs-management/tickets, suppliers, settings/modules, draws, products (熱賣/已完抽), settings/rates 的 inline span → Badge
- DataTable 組件 emptyMessage 升級：`<td>文字</td>` → `<TableEmpty message={...} />` 帶圖示
- settlement-snapshots 狀態 span 也換成 Badge

### TableEmpty / TableSkeleton 全站補完
- news/page.tsx, orders/page.tsx, dismantled/page.tsx（修正多餘 `<tr>` wrapper bug）
- reports/dismantled：spinner loading td → TableSkeleton，empty td → TableEmpty
- sell, exchange, marketplace, cs-management/tickets 的 table loading + empty 全部標準化

### `<th>` 排版統一
- tools, products/[id]/verify, reports/logistics, dev-logs, reports/settlement, marketplace 補上 `text-xs font-semibold text-neutral-500` 標準排版

### window.prompt 移除
- settlement-snapshots/page.tsx：`window.prompt()` 替換為 inline 密碼輸入框，CRON_SECRET 常駐顯示於控制列

---

## v2026.07.7｜2026-07-16｜Design System 全站 UX 掃蕩 — Toast / 骨架屏 / Badge / Empty State

### Toast 通知系統（`backend/contexts/ToastContext.tsx`）
- 新增全域 Toast Provider，4 種類型：success / error / warning / info，右上角滑入動畫
- 所有頁面 `alert()` 呼叫（共 42 個檔案、100+ 處）全部替換為 `toast(msg, type)`，type 依訊息語意自動判斷（失敗→error、成功→success、請填→warning）
- `globals.css` 補 `toast-in` keyframe 動畫

### Loading 骨架屏全站覆蓋
- 43 個頁面的「載入中…」文字 → `CardSkeleton` / `TableSkeleton` 動畫佔位
- `TableSkeleton` 整合進 `DataTable.isLoading` prop；`CardSkeleton` 用於卡片/區塊型內容
- 涵蓋：settings/*, reports/*, settlement-snapshots, refund-requests, permissions, news, users 等

### Badge 組件擴充
- `statusVariantMap` 新增 10 個狀態：`paused`, `deleted`, `sold`, `draft`, `hidden`, `進行中`, `審核中`, `已退款`, `已拒絕`, `已拒絕`
- 替換 `exchange/page.tsx`、`sell-orders/page.tsx`、`sell/page.tsx` 的 inline status span → `<Badge status=...>`
- 移除 `exchange/page.tsx` 的 `statusBadgeClass` helper function

### Empty State 統一
- `TableEmpty` 覆蓋：sell, exchange, marketplace, cs-management/tickets, reports/[type], dismantled 等 table empty row
- `EmptyState` 覆蓋：suppliers, settlement-snapshots, refund-requests, permissions 等卡片型空狀態

---

## v2026.07.6｜2026-07-16｜Design System 批次 2–7 — UI Kit 全站統一

### 組件統一（components/ui/）
- **Input / Select / Textarea / FileInput**：border-2 → border、py-2 min-h-[42px] → py-1.5、ring-2 → ring-1；disabled gray-* → neutral-100/400/200；helper text → neutral-500
- **Label**：text-sm text-neutral-700 → text-xs text-neutral-500
- **Switch**：bg-gray-200 → bg-neutral-200（unchecked track）
- **Badge**：新增 `status` prop，內建 `statusVariantMap` 自動對照 20+ 種狀態字串到 variant，匯出 `BadgeVariant` 型別
- **Select**：新增 `placeholder` prop；useId() 取代 Math.random()

### 共用 Dialog 修正（components/）
- **AlertDialog / ConfirmDialog**：gray-900/600/50/300/400 全部換成 neutral-*；取消鈕 border-2 → border border-neutral-200

### 全站 emerald-* → green-*（24 個頁面）
- emerald-50/100/200/600/700/800 統一改為 green-*，success 色系統一

### 偏離頁面修正
- **settings/modules**：gray-300/blue-500/rounded-md → neutral-200/primary/rounded-lg；bg-blue-600 → bg-primary
- **analytics**：gray-300/blue-500/blue-600 → neutral-200/primary
- **settings/rates**：border-blue-300/disabled:bg-gray-300 → primary 系列
- **orders、users/[id]、reports/logistics**：status getStatusColor 中的 gray-100/gray-700 → neutral-100/neutral-600

### Design System 頁面（/design-system）
- 新增 `backend/app/design-system/page.tsx`，展示所有 token、組件、間距、陰影、狀態色規範
- 包含「禁止使用」清單：gray-*、emerald-*、自定義 getStatusColor、border-2（inputs）等
- 加入 AdminLayout 側邊欄導覽（IconTools 圖示）

---

## v2026.07.5｜2026-07-16｜Design System 批次 1 — Tailwind Token 地基

### 設計系統
- **補全 neutral scale**：新增 50/400/600/800，共 10 階完整 scale（原本缺 4 個，530+ 個 class 原本 fallback 到 Tailwind 預設不受控）
- **移除 accent token**：dead alias（值與 primary 完全相同），全站僅 1 處使用，已清除

---

## v2026.07.4｜2026-07-15｜商品編輯頁 UI 重構 + 品項欄位鎖定規則

### 功能
- **商品編輯頁佈局重構**（`backend/app/products/[id]/page.tsx`）：從左右雙欄卡片改為全寬上下三段（上架資訊 / 商品資訊 / 品項），品項改 grid-cols-3 排列
- **重置按鈕**：儲存後快照 formData + prizes，點重置還原至最後儲存狀態
- **「類別」欄位鎖定**：type 建立後不可修改（disabled select）
- **品項欄位鎖定規則**：
  - 一番賞 / 抽卡 / 自製賞（isVerifiable）：等級可選（不含「普通」）、總數量唯讀、剩餘唯讀
  - 盒玩 / 轉蛋（isGachaType）：等級固定顯示「普通」、總數量可改（儲存時驗證不低於已抽數量）、剩餘唯讀自動 delta 計算
  - 名稱、圖片全類型可改
- **品項區塊標題**顯示整體 剩餘 / 總計；各品項卡片標題顯示個別 remaining/total
- **商品主圖**改為 56px dashed 縮圖，與品項圖樣式統一

### 修正
- **ESLint build 錯誤**：`catch(e){}` 空 block statement，改為 `catch(_e){ /* clipboard unavailable */ }`

### 樣式統一
- DatePicker、YearMonthPicker、TagSelector trigger 高度與 border 統一為 `py-1.5 border border-neutral-200`
- YearMonthPicker 新增 `onClear` prop

---

## v2026.07.3｜2026-07-14｜LINE 推播修復 + 環境變數補齊

### 修復
- **LINE 推播中斷**：Vercel Production 的 LINE 相關環境變數（`LINE_CHANNEL_ACCESS_TOKEN`、`NOTIFY_TARGET_ID` 等 5 個）在環境分離作業時被清空，導致所有 cron 推播靜默失敗。已重新設定並 redeploy。
- **weekly-report build 錯誤**：`line_push_weekly` 未加入 `LINE_PUSH_KEYS` 型別定義，導致 TypeScript 編譯失敗。已補上。
- **LINE 月額度說明**：免費方案 500 則/月，正常每日 8 則約 240 則/月不超額，測試期間耗量高屬正常，月初自動重置。

---

## v2026.07.2｜2026-07-14｜版本管理系統 + GB哥週報

### 版本管理
- 建立 `v[年].[月].[次數]` 版本號規則，每次 merge main 打 git tag
- 打第一個 tag `v2026.07.1`（歷史版本補標）
- DEVLOG 格式加入版本號前綴

### GB哥週報（每週一 09:00）
- 新增 `backend/app/api/cron/weekly-report/route.ts`
- 內容：業務數據（新用戶/抽獎/收入/待出貨）、管理員操作摘要、AI 事件、本週建議
- Migration 325：pg_cron 排程（週一 01:00 UTC）
- 推送方式：LINE 訊息直接推給老闆

---

## v2026.07.1｜2026-07-14｜前台 bug 修正 + 選籤 UI + 環境分離

### 環境建設
- 建立 `dev` branch（開發用）/ `main`（正式）雙軌流程
- 啟用 `ggb-staging` Supabase project，跑完 324 個 migration 建好表結構
- Vercel Preview 環境變數指向 staging DB，Production 保持 ggb-prod
- 本機 `.env.local` 改指向 staging DB，開發不再碰正式資料

### 修正
- **「查看結果」報錯**（`frontend/app/item/[id]/page.tsx`）：`draw_records` 欄位為 `prize_image_url`，前台 query 誤用 `image_url`，導致 Supabase 回傳 error → 完抽商品點「查看結果」跳錯。同步修正 state 型別定義與兩處 modal mapping。

### 修正
- **「查看結果」報錯**（`frontend/app/item/[id]/page.tsx`）：`draw_records` 欄位為 `prize_image_url`，前台 query 誤用 `image_url`，導致 Supabase 回傳 error → 完抽商品點「查看結果」跳錯。同步修正 state 型別定義與兩處 modal mapping。
- **公平性驗證頁按鈕位置**：原本在底部加分隔線的獨立區塊，移至哈希值欄位正下方，完抽後（`isSoldOut`）才顯示，全寬按鈕樣式。手機版與桌機版同步更新。

### 功能
- **選籤頁已抽籤樣式重設計**（`frontend/components/shop/TicketSelector.tsx`）：
  - 移除品項名稱，僅保留賞等
  - 號碼置頂灰色小字，賞等置底粗體
  - 稀有賞等（該賞等在全局籤中出現 ≤5 個）顯示紅色，>5 個顯示黑色
  - 樣式與「抽獎結果一覽」Modal 保持一致

---

## 2026-07-14｜後台 Ant Design 商品管理改版

### 功能
後台商品管理頁（`backend/app/products/page.tsx`）改用 Ant Design v5 + ProTable。

- **安裝套件**：`antd @ant-design/pro-components @ant-design/icons @ant-design/nextjs-registry`
- **`backend/app/layout.tsx`**：加入 `AntdRegistry`（Next.js App Router SSR style 支援）
- **`backend/components/Providers.tsx`**：加入 `ConfigProvider`（主色 `#3B82F6`、繁體中文 locale、圓角 8px）
- **商品列表 ProTable**：
  - 頂部 4 格統計卡：全部/上架中/低庫存/熱賣
  - ProTable columns：縮圖+名稱+編號、類型（Tag）、狀態（Badge）、售價、成本、庫存（顏色警示）、銷售、開賣日、操作
  - 欄位 filter（類型/狀態）、欄位排序（售價/庫存/銷售）
  - 展開列：顯示所有品項卡（縮圖 + 名稱 + 等級 + 剩餘/總數 + 機率）
  - 多選 + 批量操作（上架/下架/刪除）
  - toolbar：搜尋、匯出 CSV、上傳 ZIP、匯入 CSV/Excel、新增商品
  - 內建 density 切換、欄位顯示設定、pagination（20/50/100 筆/頁）

---

## 2026-07-13｜抽卡模組 — card_pack 模組整合進模組切換系統

### 功能
TCG（集換式卡牌）抽獎改為完整卡包開啟體驗，取代原本的影片播放。

- **`BoosterPackOpenEffect.tsx` 全面重寫**：
  - 純 CSS 卡包設計（深藍/紫漸層 + 動態全息折射效果），不依賴外部圖片
  - **按住蓄力機制**：按住 ~700ms 蓄力進度條（黃色 SVG 邊框動畫），蓄滿自動觸發
  - **撕裂動畫**：Top 殘片飛上 + Bottom 殘片落下，搭配鋸齒 clip-path 撕口
  - **全螢幕白閃**：撕開瞬間過場
  - **粒子爆炸**：24 顆彩色粒子向外散射
  - **卡牌展開**：卡背圖依稀有度扇形排列，錯落有致
- **`CardDrawAnimation.tsx`**：移除不存在的 `packImage` 路徑（改用 CSS 卡包）
- **`gacha-themes/index.tsx`**：`card_pack` 主題接上 `CardDrawAnimation`（dynamic import）
- **`item/[id]/page.tsx`**：
  - `card` 類型商品：保留原本影片播放流程（`/videos/card.mp4`）
  - 非 card 類型商品（gacha/blindbox 等）：effectiveTheme 條件擴充 `card_pack`，進入 `GachaThemeRenderer`
  - 後台「抽獎模組設定」或「商品編輯」選 `card_pack` → 任何類型商品都能啟用卡包開啟動畫

---

## 2026-07-13｜機器人留言 AI 化（B+C 方案）

### 問題
舊留言為 hardcoded 範本池，與文章內容無關（可愛商品卻說「太猛了」），且重複率高。

### 修正
- **Migration 324**：`seed_bot_engagement_for_article` 移除留言 seeding，只保留按讚（15~40 個 bot 讚）
- **news-agent 新增 `generateAndSeedComments()`**：
  - 每篇新文章調用 Claude Haiku 4.5，根據標題/摘要/類別生成 3~5 則脈絡符合的留言
  - Prompt 按 category 調整語氣（ichiban→興奮/期待、blindbox→可愛/驚喜、tcg→強度討論）
  - 留 1 則中性/略負面（顯真實感）
  - 留言 `created_at` 隨機分布在文章發布後 0~8 小時內，按時間排序植入
  - 費用估算：每篇 ~$0.00084；排程每 6 小時跑一次，正常用量 $0.1~0.3/月

---

## 2026-07-13｜新聞列表讚/留言數與內頁不同步修正

### 根本原因
`/api/news/counts` 直接 select raw rows（`news_likes`、`news_comments`），受 Supabase 預設 1000 rows 上限截斷。60 篇文章 × 每篇 N 筆讚 > 1000 → 超出的文章讚數顯示為 0。文章內頁用 `count: 'exact'` 精確計數，兩者不同步。

- **修正**：migration 323 建立 `get_news_engagement_counts(text[])` RPC，使用 GROUP BY 真正聚合，一次 call 回傳所有文章的讚/留言數，無 row 上限問題。
- counts API route 改呼叫此 RPC。

---

## 2026-07-13｜一番賞撕紙桌機第二次購買修正

### 桌機第二次撕紙 fold 無法完成（彈回）
腳本已快取時 IIFE 同步執行（無 await），前一次拖曳的 mouseup 事件可能仍在佇列中或殘留的 jQuery document handler 未清除，導致 turn.js 初始化後立刻被舊事件干擾，fold 無法完成。
- **修正 A**：加 `requestAnimationFrame` delay，讓瀏覽器先清空事件佇列再初始化 turn.js
- **修正 B**：init 前先 `$(document).off('mousemove mouseup touchmove touchend')` 強制清除所有 jQuery document drag handlers（turn.js 是 app 內唯一使用者，全清安全）

## 2026-07-13｜一番賞撕紙桌機排版修正

### 桌機撕紙畫面跑版
桌機寬度（如 1440px）導致 `s = dims.w / 393 ≈ 3.66`，ticket Y 軸超出 viewport，整個場景飛出畫面。
- **修正**：TicketSelectionFlow 在 FigmaTearScene 外層包一個比例約束容器：
  `width: min(100vw, calc(100dvh * 393/844)); height: 100dvh`
  CSS `min()` 自動處理手機（取 100vw）vs 桌機（取高度算出的寬度），兩側補黑色底。
  ResizeObserver 量到正確的約束尺寸，`s ≈ 1`，排版與手機一致。

---

## 2026-07-13｜一番賞撕紙深度修正（第四輪）

### 根本原因 C：turning gate 仍阻擋第二次購買的撕紙完成
- 情境：即使 `hasMoved` 已設為 true，`onCapturePointerDown` 若未觸發（第二次掛載 capture listener 競態），`pressStartX = null` → `onCapturePointerMove` 直接 return → `hasMoved` 仍 false → `turning` gate 阻擋翻頁
- **核心觀察**：turn.js 翻頁需拖曳過 50% 才能完成，純點擊無法到達 50%，`turning` gate 本身是多餘的
- **修正**：完全移除 `turning` event handler，不再用任何條件攔截 turning 事件；`hasMoved`/`slideRight` 保留，僅用於控制 up2.svg 顯示和 tearing class

## 2026-07-13｜一番賞撕紙深度修正（第三輪）

### 根本原因 A：turn.js destroy 從未被執行
`done=true` → React 先 unmount `{!done && ...}` DOM → `flipbookRef.current = null` → useEffect cleanup 條件 `flipbookRef.current &&` 失敗 → `$fb.turn('destroy')` 沒執行 → turn.js document-level listeners 殘留 → 第二次購買產生雙重 listeners 衝突
- **修正**：在 useEffect closure 內用 `$fbSaved` 儲存 jQuery 物件，cleanup 改用 `$fbSaved.turn('destroy')`，不依賴 `flipbookRef.current`

### 根本原因 B：turning gate 比 dx > 3 更早觸發
Turn.js 在拖曳很早（< 3px）就 fires `turning`，但 `slideRight` 需 dx > 3 → gate 擋住合法拖曳
- **修正**：新增 `hasMoved` ref，任何 `pointermove` 即設 true，`turning` gate 改用 `!hasMoved.current`（只攔截完全沒有移動的純點擊）

---

## 2026-07-11｜一番賞撕紙深度修正（第二輪）

### 根本原因修正
- **同頁二次購買崩潰**：`tearIndex` 重置為 0，`key=0` 不變 → React 不重新掛載 FigmaTearScene → `turnReady.current=true` 殘留 → 新的 useEffect 被 guard 擋住，turn.js 和 listeners 沒有重新初始化
  - 修正：新增 `tearSessionId`，每次購買 +1，作為 `key` 的前綴：`key={\`${tearSessionId}-${safeIndex}\`}`
- **選籤頁閃現**：`handleFinish` 先清 `showFigmaTear`/`drawnResults` state → React 重渲染露出選籤頁 → 再 navigate
  - 修正：移除 state 清理，讓 navigate/unmount 自然清理
- **capture pointerdown contains 檢查失敗**：全螢幕 tear scene overlay，`contains` 有時因 turn.js 動態元素返回 false → `pressStartX` 沒設定 → slideRight 永遠 false → turning gate 擋住全部翻頁
  - 修正：移除 `contains` check，全螢幕 overlay 任何 press 都屬於它

---

## 2026-07-11｜一番賞撕紙四大修正

### 問題修正
1. **恭喜彈窗移至商品詳情頁（Issue 1）**
   - TicketSelectionFlow 新增 `onTearFinish` prop
   - 桌機 modal：回調 → ProductDetailPage 接收後顯示 `GachaResultModal`
   - 手機：撕完後存 `sessionStorage('ggb_tear_results')` → `router.push('/item/[id]')` → ProductDetailPage mount 時讀取並顯示彈窗
   - 確定只關閉彈窗，停留在商品詳情頁

2. **第二張起 up2.svg 不顯示修正（Issue 2）**
   - 原因：React `onPointerDown` 在 bubble 相位執行，turn.js 可能在前已消費事件，導致 `pressStartX.current` 未設定
   - 修正：改用 `document.addEventListener('pointerdown', ..., true)` capture 相位，確保在 turn.js 之前攔截

3. **防止點擊直接撕開（Issue 3）**
   - 重新加回 `turning` event gate：`!slideRight.current` 時 `preventDefault()`
   - `slideRight` 只在拖曳 dx > 3px 後才設 true，純點擊維持 false → 翻頁被阻止
   - 彈回時（`turned` page=1）清除 tearing class 和 p-temporal visibility

4. **拖曳事件全改為 capture 相位**
   - `onCapturePointerDown` / `onCapturePointerMove` 均以 capture 模式監聽
   - 確保任何 Y 軸位置按壓都能正確設定 pressStartX 並觸發 up2 顯示

---

## 2026-07-11｜FigmaTearScene UI 微調

### 一番賞撕票場景調整
- **手掌往左移**：`left: 21*s → 5*s`，手指提示小手往左拉開視覺空間
- **手掌 z-index 置頂**：`zIndex: 10`，手疊在抽獎券上方更自然
- **抽獎券上移**：`top: 42*s → 34*s`，在手掌下方位置更協調
- **手指提示路徑微調**：y 起始 `-8.5*s`（更平的對角線），避免過度傾斜

---

## 2026-07-11｜一番賞撕紙 turn.js 真實翻書效果 + news-agent 節流

### 一番賞撕紙動畫（FigmaTearScene）
- **改用真實 turn.js**：jQuery + turn.js 動態載入，`display:single / direction:rtl`，貼紙從左角掀起往右撕開
- **資源對齊**：複製 `up1.svg`、`up2.svg`、`light.svg` 自 demo dist，CSS mask 讓摺痕光影限制在貼紙輪廓內
- **座標系**：flipbook 相對於 320×156 bg，offset (53, 12) 242×133，精準對齊貼紙位置
- **p-temporal 背面**：互動前隱藏避免載入閃爍，`.touched` class 觸發顯示
- **完成判斷**：`turned` event page===2 後 300ms 進入 done 狀態，顯示獎項文字與開獎按鈕

### news-agent 節流
- 排程：每 20 分鐘 → 每 6 小時（migration 322）
- 每次上限：12 篇 → 3 篇
- 無圖片直接 skip，不呼叫 Claude（省 token）

---

## 2026-07-11｜FigmaTearScene 對角折線掀起效果

### 一番賞撕票動畫重寫（turn.js 風格）
- **折線改為對角線**：頂部固定點隨拖曳移動 `(foldX, 0)`，底部錨定左下角 `(0, ticketH)`，模仿 turn.js 書頁翻轉的角落掀起幾何
- **移除 CSS 3D rotateY**：解決 `clipPath + preserve-3d` 的瀏覽器衝突，改用純幾何裁切
- **三角形掀起區**：`leftClip = polygon(0 0, foldX 0, 0 H)`，顯示 up2.svg 灰色貼紙背面
- **雙側立體陰影**：掀起背面右側暗漸層 + 剩餘蓋板左側暗漸層，製造折頁深度感
- **對角折痕高光條**：沿折線旋轉定位，中間白光、兩側暗，模擬真實折痕

---

## 2026-07-10｜CSV 匯入修正 + 文章頁調整 + 空分類手勢

### CSV 批量匯入修正
- **根本原因**：`detectPrizeGroups` 會偵測到 `獎項N等級` 欄位（分類為 `level` type）但未讀取其值，`levelOverride` 預設為欄位 key「獎項N」，使用者手動修改成過長字串（>50 字元）後觸發 `product_prizes.level` varchar(50) 限制
- **修正**：`PrizeGroup` 新增 `levelCol` 欄位，`detectPrizeGroups` 把 `等級` 欄位映射進去；`buildProducts` 優先讀 CSV 每列的實際等級值（如「A賞」），再加 `.slice(0, 50)` 防呆
- **補資料**：手動補 product 35（一番賞公仔大亂鬥 Part11，25張/20種）和 36（乾坤一擲RUSHチケットオリパ，100張/20種）的獎項

### 前台調整
- **文章頁**：移除底部「閱讀原文」連結按鈕
- **首頁空分類**：類別內無商品時，內容區顯示「此分類暫無商品」並保留 `min-h-[40vh]`，確保可觸控左右手勢切換分類

---

## 2026-07-10｜客服系統 + 倉庫自動分解 + 前台靜態頁重寫

### 客服管理系統（全新）
- **前台聯絡表單**：FAQ 頁底部新增聯絡表單（回報類型/信箱/手機/內容），未登入時全部禁用並顯示提示
- **DB**：migration 318 建立 `cs_tickets` 表（category/email/phone/content/status/admin_note）
- **前台 API**：`/api/cs-tickets` POST — 驗證 session 後寫入工單
- **後台客服工單頁**：`/cs-management/tickets` — 依狀態篩選、展開查看詳情、標記狀態、填寫內部備註
- **後台操作手冊**：`/cs-management/sop` — 四大情境（代幣/抽獎/商品/出貨）標準處理流程與補償原則
- 側欄新增「客服管理」群組

### 倉庫30天自動分解（全新）
- **DB**：migration 317 建立 `auto_dismantle_expired_warehouse_items()` 函數
  - 對 `status='in_warehouse'` 且 `created_at < NOW() - INTERVAL '30 days'` 的品項執行分解
  - 排除機器人帳號、寫入 `token_adjustments`（type=dismantle）並更新用戶代幣
- **Cron**：`/api/cron/warehouse-dismantle` — POST，驗 `x-cron-secret`，呼叫 RPC，推 LINE 通知
- 待設定：pg_cron 每日凌晨執行

### 前台靜態頁全面重寫（UI + 法律內容）
重寫五個頁面（`about` / `faq` / `terms` / `privacy` / `return-policy`）：
- 統一標題樣式（無圖示圓圈、無多層卡片）
- GGB 平台專屬文字（非仿史萊姆玩具通用文）
- 法律保護語言：消保法第19條排除七日鑑賞期、儲值不退款、代幣不換現金
- 倉庫30天自動分解條款明確寫入 `terms` 和 `return-policy`

### 殺率排除盒玩/轉蛋
- `/api/draw`：category 為 `boxplay` / `gacha` / `盒玩` / `轉蛋` 時強制 `profitRate = 1.0`

### Migration 執行
- migration 317（warehouse auto-dismantle function）✅ 已執行
- migration 318（cs_tickets table）✅ 已執行

---

## 2026-07-10｜後台操作 Log 全面補齊

### 覆蓋範圍
19 個後台 API route 全數加入 `logAdminAction`，確保所有寫入操作都留下稽核軌跡：

| 操作 | 記錄動作 |
|------|---------|
| banners POST | 新增輪播圖 |
| settings PUT | 更新平台設定 |
| settings/modules PUT | 更新模組設定 |
| news POST | 後台新增文章 |
| news PUT / DELETE | 更新文章 / 刪除文章 |
| orders/batch POST | 批次更新訂單 |
| refund-requests PATCH | 核准退款 / 拒絕退款 / 執行退款（三種 action 分開記錄） |
| marketplace/clear POST | 清除市集資料 |
| marketplace/seed POST | 建立市集假資料 |
| storage/clear-products POST | 清除 R2 儲存空間 |
| platform-monitor POST | 手動觸發平台監控 |
| admins POST | 新增管理員 / 更新管理員 |
| leaderboard-bots POST/PATCH/DELETE | 排行榜機器人 CRUD |
| meeting-logs POST/PATCH/DELETE | 會議記錄 CRUD |
| sell/clear POST | 清除寄賣列表 |
| products/batch POST | 批次更新商品狀態 / 批次刪除商品 |
| trigger/news-agent POST | 手動生成文章 |
| trigger/generate-content POST | 手動生成 AI 文案 |
| dev-logs POST/PATCH/DELETE | 開發日誌 CRUD |

---

## 2026-07-10｜情報頁埋點全覆蓋

### 新增 EventType（`frontend/lib/trackEvent.ts`）
`news_list_view` / `news_article_click` / `news_category_filter` / `news_like` / `news_comment` / `news_share` / `news_source_click`

### 列表頁（`frontend/app/news/page.tsx`）
- 進入頁面：`news_list_view`
- 點分類 tab：`news_category_filter`（meta: category，'all' 不記錄）
- 點文章（列表列 + 輪播）：`news_article_click`（meta: news_id, category, title；輪播加 source: 'carousel'）

### 文章內頁（`frontend/app/news/[id]/page.tsx`）
- 進入 / 離開：`trackPageView` → `page_view` + `page_exit`（含 dwell_seconds 停留時間）
- 捲動深度：`trackScrollDepth` → `scroll_depth` 25/50/75/100%
- 按讚 / 取消讚：`news_like`（meta: action: 'like'|'unlike'）
- 送出留言（成功）：`news_comment`
- 點分享：`news_share`
- 點閱讀原文：`news_source_click`（meta: source_url）
- 新增「閱讀原文」外連按鈕（有 source_url 才顯示）

---

## 2026-07-10｜情報系統完整記錄

### 系統架構
- 資料表：`news`（`backend/db/migrations/297_news_enhance.sql`）
- 前台：`frontend/app/news/` — 情報列表 + 文章內頁（留言/讚/分享）
- 後台管理：`backend/app/news/` — 批量上架/下架/刪除、搜尋篩選排序
- 自動爬蟲：`backend/app/api/cron/news-agent/route.ts`

### news-agent 爬蟲規格
- 排程：每 20 分鐘（pg_cron `news-agent-20min`，`*/20 * * * *`）
- 每次上限：最多 12 篇（`MAX_TOTAL = 12`），每個搜尋詞最多 2 篇
- 搜尋來源：20 組關鍵詞，三語（繁中/日文/英文），Google News RSS
- 分類：`ichiban`、`blindbox`、`gacha`、`tcg`
- 圖片：優先抓 og:image → Jina Reader fallback → 預設 `banner_defaulet.png`
- 去重：DB source_url 比對 + Jaccard 標題相似度（≥ 0.55 跳過）
- Claude 篩選：只收商品發售情報，排除開幕/業績/開箱雜訊
- 寫入：`is_active: true` 直接上架，同時呼叫 `seed_bot_engagement_for_article`

### bot 互動補種
- DB function：`seed_bot_engagement_for_article(p_news_id TEXT)`（migration 312）
- 每篇新文章寫入後立即種：2~5 則 bot 留言、3~12 個 bot 讚
- 冪等：文章已有留言則跳過，`news_likes` ON CONFLICT DO NOTHING

### 前台情報頁
- `frontend/app/news/page.tsx`：整行點進文章，列表直接按讚（樂觀更新）
- `frontend/app/news/[id]/page.tsx`：留言抽屜、分享（PC 複製連結/手機原生分享）
- `frontend/app/api/news/[id]/like/`、`/comments/`：需 `SUPABASE_SERVICE_ROLE_KEY`（前台 env）

### pg_cron 重要說明
- Supabase pg_cron 無法使用 `current_setting('app.cron_secret')`
- 所有 cron job 的 secret 必須 hardcode 在 SQL 內（見 migration 301、306）

---

## 2026-07-10｜新文章自動種 bot 留言/讚 + 無圖改用預設 banner

### news-agent 自動補種（`backend/app/api/cron/news-agent/route.ts`）
- 每篇成功寫入後立即呼叫 `seed_bot_engagement_for_article(id)`（fire-and-forget，不阻塞主流程）
- 函式已在 migration 312 建立：2~5 則 bot 留言、3~12 個 bot 讚，跳過已有留言的文章

### 無圖文章改用預設 banner（`backend/app/api/cron/news-agent/route.ts`）
- 原本：og:image 抓不到 → 跳過整篇文章
- 現在：fallback 用 `NEXT_PUBLIC_FRONTEND_URL/images/banner_defaulet.png`，不再因無圖而跳過

---

## 2026-07-10｜分享圖標修正（二）+ 文章頁重複導航修復

### 分享判斷升級（`Navbar.tsx`、`item/[id]/page.tsx`、`news/[id]/page.tsx`）
- 改用 `pointer: coarse` + UA 雙重判斷，避免 Chrome DevTools 裝置模擬誤觸原生分享
- Mac/PC（UA 無 Mobile/iPhone/Android）→ 複製連結；真實手機/平板 → 原生分享
- Navbar catch 改為靜默（不再顯示「分享已取消」toast）

### 文章內頁重複導航修復（`Navbar.tsx`）
- `showBackButton` 排除 news detail 頁（文章頁有自己的浮動返回按鈕）
- 移除 Navbar 在 news detail 頁多餘的 share 按鈕，改由文章頁 fixed nav 統一處理

---

## 2026-07-10｜情報頁 UX 全面升級

### 情報列表（`frontend/app/news/page.tsx`）
- 整行可點進文章：overlay link 技巧（`absolute inset-0 z-0`），內容層 `pointer-events-none`
- 讚按鈕 `pointer-events-auto` 浮出，可在列表直接點讚（樂觀更新）
- 留言圖標點擊也進文章內頁
- 統計區改為水平圖標排列（留言泡泡 + 拇指讚），固定寬度容器（`w-9`）確保上下篇圖標對齊
- 數字欄 `w-5 text-right tabular-nums` 對齊

### 分享圖標修正（`Navbar.tsx`、`item/[id]/page.tsx`、`news/[id]/page.tsx`）
- Mac/PC 點分享：直接複製連結 + toast「連結已複製」
- 手機/平板：彈出原生分享介面
- 判斷改用 `window.matchMedia('(pointer: coarse)').matches` 取代 `maxTouchPoints`
- Navbar.tsx 同步修正（原本只要 `navigator.share` 存在就呼叫）

### 留言抽屜（`news/[id]/page.tsx`）
- 固定高度 `60vh`（原 `maxHeight: 65vh`），展開高度一致
- header padding `pt-4 pb-3` → `px-4 py-2`
- nav z-index `z-30` → `z-20`，確保遮罩（`z-40`）覆蓋頂部導航
- 留言讚按鈕：`flex-col` → `flex`，圖標與數字水平排列；永遠顯示數字（含 0）；`self-center` 垂直置中

---

## 2026-07-09｜文章生成圖片抓取強化（進行中）

### 問題
- 手動生成：新增 0 篇，跳過 160 篇（重複8、無圖150、Claude拒絕2）
- 根本原因：大多數文章來源站（PR TIMES / 電撃ホビー / Google News 目標站）有反爬蟲保護，直接 fetch 拿不到 HTML，og:image 為空

### 已嘗試
- 多 UA 策略（Chrome / Mobile / Googlebot）
- RSS `content:encoded` 解析、`enclosure` 放寬格式
- HTML body `<img>` tag 掃描
- Jina Reader API fallback（`r.jina.ai/{url}`）— 加入但效果待驗證

### 待查
- Jina 返回格式是否符合 regex（`!\[...\](url)`）
- 150 篇逐一 Jina 呼叫是否在 4 分鐘 deadline 內來不及完成
- 需要詳細 server log 確認各站回應狀況

---

## 2026-07-09｜文章生成升級 + 功能開關 GB哥推播區塊

### 文章生成（news-agent）
- `is_active: false` → `is_active: true`：生成文章直接上架，不需手動審核
- 手動「生成文章」按鈕：`limit: 1` → `limit: 5`，`maxDuration` 120 → 300 秒
- 新增「trusted domain 優先」：啟動時從 DB 拿歷史上有成功抓到圖片的來源域名，同批 RSS 文章排序時優先處理這些域名
- `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001` 加入 `.env.local`（本地測試打本地 API）

### 功能開關頁面（`backend/app/settings/features/page.tsx`）
- 移除頁面副標題「控制前台是否顯示各功能入口」
- 新增「GB哥推播」區塊，列出全部 14 個推播開關（每日早報、CFO 財務對帳…），可獨立開關
- 新增 API：`/api/admin/line-push-flags`（GET 讀取 / PUT 儲存，附稽核軌跡）

---

## 2026-07-09｜邀請好友系統 + 分享任務觸發點調整

### 邀請好友系統
- Migration 311：`referrals.is_mission_credited` 欄位（防止重設密碼重複計入）+ `complete_registration_referral(user_id)` DB 函式
- `login/page.tsx`：Step 1 加選填邀請碼輸入框（URL 帶 `?invite=XXX` 自動填入），Step 3 設密碼完成後呼叫 `complete_registration_referral` 計入邀請人任務
- `register/page.tsx`：重導時保留 `?invite=XXX` 參數
- `mission/page.tsx`：`invite_friend` 任務點「去完成」複製個人邀請連結（`/login?view=register&invite={code}`）

### 分享任務觸發點調整
- `mission/page.tsx`：分享任務「去完成」改導首頁，不再自動記次數
- 實際計數保留在商品頁點分享圖標時觸發（`item/[id]/page.tsx` 已有 `MissionService.trackEvent('share_app', {})`）

---

## 2026-07-09｜任務追蹤修復 + 多項 UI 優化

### 儲值任務不計次數（backend）
- ECPay callback 確認儲值後新增呼叫 `track_mission_event_for_user` RPC
- Migration 310：新增 `track_mission_event_for_user(user_id, event_type, data)` — service_role only
- 支援 `recharge`（今日首次儲值）與 `recharge_amount`（週累積代幣）兩種條件

### 分享任務不計次數（frontend）
- `mission/page.tsx`：將 clipboard 與 mission tracking 拆開，clipboard 失敗不再影響任務計數
- 改為先呼叫 `trackShare` 再複製連結，確保任意情況下都能記錄

### 簽到頁面 iPhone PWA 底部問題
- `MissionFrame.tsx`：`pb-[140px]` → `pb-[220px]`，scale 後足以覆蓋 iPhone 底部 nav + safe area
- `overflow-visible` → `overflow-hidden`，避免 scrollHeight 計算包含溢出內容造成無限滑動
- `mission/page.tsx`：使用 `visualViewport.height` 扣掉 nav 高度(60px) 計算 minContentHeight；外層改 `100dvh`

### 跑馬燈品項名稱截斷
- `WinningMarquee.tsx`：移除 12 字 JS 截斷，加顯示 `prize_name`，讓 CSS 自然處理溢出

### 情報頁面 category badge 樣式
- `news/page.tsx` + `news/[id]/page.tsx`：新增 `CategoryBadge` 元件，與商品 badge 一致（colored bg pill）
- 對應：ichiban=blue, gacha=orange, blindbox=purple, tcg=amber, general=neutral

### 情報讚數列表/內頁不同步
- 新增 `frontend/app/api/news/counts/route.ts`：batch 查詢讚數和留言數（service role，繞過 RLS）
- `news/page.tsx`：改用此 API 而非 anon client 直查 `news_likes`；加 `visibilitychange` 監聽，回到頁面自動重新拉取

### 頭像上傳修復 + 裁切功能
- 新增 `backend/app/api/upload/user-avatar/route.ts`：驗證 Supabase JWT，sharp 400x400 webp，上傳 R2
- 新增 `frontend/components/ImageCropper.tsx`：純 canvas 裁切器，支援拖曳/雙指縮放、圓形/正方形切換
- `profile/page.tsx`：選圖後開裁切 → 裁切完成才上傳（呼叫後台 admin.ggb.com.tw）

### GB 推播開關（功能架構完成）
- 新增 `backend/lib/linePush.ts`：`createLinePusher(key)` factory，查 `feature_flags` 決定是否推播
- 所有 cron routes 改用 `createLinePusher` 替換原本的 inline pushLine

---

## 2026-07-09｜修正註冊流程 redirect race condition

### login/page.tsx
- `onAuthStateChange` 觸發 `setUser(tempUser)` 時 step 仍為 2，useEffect 看到 user 就 redirect 到 /，step 3 根本沒機會出現
- 修正：`view === 'register' && step >= 2` 都不跳轉，讓 OTP 驗證（step 2）和設定密碼（step 3）完整完成

---

## 2026-07-09｜修正新用戶註冊設定密碼失敗

### 根本原因
- 用戶完成 OTP 驗證後，`onAuthStateChange` 觸發 `fetchProfile`
- 若 `public.users` 無 profile（曾清資料的舊帳號），原本直接 `signOut()` → session 被清除
- Step 3 呼叫 `updateUser({ password })` 時得到 "Auth session missing!"

### 修正
- `AuthContext.tsx`：PGRST116 時改為先呼叫 `/api/user/ensure-profile` 自動建立 profile，retry 後再設 user；只有建立失敗才 signOut
- 新增 `frontend/app/api/user/ensure-profile/route.ts`：驗證 auth 後用 service role upsert profile（含 generate_invite_code）
- `authErrors.ts`：補 "Auth session missing!" → "登入狀態已失效，請重新登入"

---

## 2026-07-09｜下拉重整圖標置中修正

### PwaPullToRefresh.tsx
- `show()` 更新 transform 時覆蓋掉 `translateX(-50%)`，導致圖標偏右
- 修正為 `translateX(-50%) translateY(${translate}px)` 合併兩個 transform

---

## 2026-07-09｜Auth 錯誤訊息全中文化

### authErrors.ts 擴充
- 補 A033：Supabase 頻率限制「security purposes / after X seconds」→「操作太頻繁，請稍後再試」
- 補 A041（帳號停用）、A042（暫停註冊）、A051（Session 過期）
- fallback 不再顯示英文原文，改為「操作失敗，請稍後再試」，原始錯誤只 console.warn

---

## 2026-07-09｜情報列表手勢修正 + news-agent 每 20 分鐘

### 情報列表手勢修正
- 輪播圖區塊滑動不再誤觸發類別切換（touch handler 移至列表 div）
- 列表 div 加 `min-h-[60vh]`，文章少時空白區域也能左右滑切換分類

### news-agent 改為每 20 分鐘（migration 306）
- 由 `0 * * * *`（整點）改為 `*/20 * * * *`（每 20 分鐘）
- 最多 8 篇上限不變

---

## 2026-07-09｜news-agent cron 修正 + 文章管理移至系統設定

### news-agent-hourly cron 修正（migration 305）
- cron job 仍在用 `current_setting('app.cron_secret')` → 整點無法取得值 → 每小時 401 被擋，無新文章
- migration 301 未生效（未覆蓋舊 job），305 重新 unschedule + 以 hardcode secret 重建

### AdminLayout 選單調整
- 「文章管理」從「其他黑科技」移至「系統設定」，排在「輪播圖管理」下方

---

## 2026-07-09｜文章留言按讚系統 + 商品管理主圖欄位

### 留言按讚系統（migration 303、304）
- 新建 `news_likes`、`news_comments`、`news_comment_likes` 三張表，含 RLS 政策
- migration 304 為所有上架文章注入 bot 種子留言（3~8 則/篇）及按讚
- 前台新增 4 個 API routes：`/api/news/[id]/like`、`/api/news/[id]/comments`、`/api/news/comments/[commentId]`、`/api/news/comments/[commentId]/like`

### 文章內頁底部互動 bar
- 移除 MobileTabbar（/news/[id] 不再顯示底部 Tab 列）
- 固定底部 bar：左側讚圖標（切換動效）+ 數字，右側橘圓圈白紙飛機輸入框（顯示則留言數）
- 留言抽屜：底部滑出，顯示留言列表、留言按讚、自己留言左滑刪除
- 已登入展開抽屜自動 focus 輸入框彈出鍵盤；未登入輸入框 disabled
- 留言數快取：先用 supabase HEAD count 快速顯示，背景再載完整列表

### 情報列表顯示留言 / 讚數
- 列表每列右下角顯示「留言 X 讚 Y」（深色）
- 標題固定兩行高度 42px，分類時間行對齊一致

### 商品管理主圖欄位
- products 列表 checkbox 右側新增 40×40 主圖縮圖欄位（object-cover rounded-lg）

---

## 2026-07-09｜前台情報頁 UI 全面優化

### 輪播升級
- 新增手勢滑動（touch swipe）支援
- 點點圖示改為居中 pill 樣式，與首頁輪播一致（active 白色長條、inactive 小圓白半透明）

### 文章內頁圖片等比例
- 移除固定 `aspect-[16/9]` 限制，改為 `w-full h-auto` 等比例顯示

### 列表縮圖改正方形
- 縮圖從 90×65 改為 90×90 正方形，object-cover 裁切滿圖

### 移除情報頁頂部導覽列
- `/news` 頁不顯示 Navbar（Navbar.tsx 新增路徑判斷，return null）
- 分類 Tab 已固定在頁頂，Navbar 重複顯示

---

## 2026-07-09｜文章管理新增生成按鈕 + news-agent cron 修正 + GB哥情報分類修正

### news-agent cron 修正（migration 301）
- migration 300 的 `news-agent-hourly` 還在用 `current_setting('app.cron_secret')` → 拿不到值 → 每小時 401 被擋
- migration 301 改用 hardcode secret（同其他 7 個已修正的 cron job）

### 文章管理新增「⚡ 生成文章」按鈕
- 新增 `/api/admin/trigger/news-agent` 管理員 API（server-side 呼叫，cron secret 不外露）
- news-agent 支援 `limit` 參數，手動觸發時 limit:1（只抓一篇）
- 按鈕顯示生成結果（新增 N 篇 / 跳過 N 篇）

### GB哥情報分類修正（gbBro.ts）
- 新增 news-agent 每小時排程說明
- 明確區分：`news 表`（前台文章） vs `competitor_posts 表`（競品分析）
- 修正 GB哥 把「有新文章嗎」誤判為查競品情報的問題

---

## 2026-07-09｜新聞採集升級 + 文章管理對齊商品管理

### news-agent 全面升級（migration 300）
- 排程：每天 06:30 → **每小時整點**（pg_cron `news-agent-hourly`，舊 job 已移除）
- 搜尋關鍵字：從日文窄詞改為**中文 + 日文 + 英文三語 14 個查詢**
  - 繁體中文（TW）：一番賞發售、盒玩發售、盲盒新品、轉蛋新品、卡牌新彈
  - 日文（JP）：一番くじ、ガシャポン、ブラインドボックス、ポケモンカード、遊戯王OCG
  - 英文（US）：gashapon、OCG、TCG、blind box
- 每次全局最多 **8 篇**（每關鍵字最多 2 篇）
- **移除 LINE 推播**（每小時跑不再推通知）
- Claude prompt 強化篩選：只接受新品發售情報，拒絕店鋪開幕/業績/開箱心得等雜訊
- 圖片修正：
  - 相對路徑 og:image 現在正確 resolve 成絕對 URL
  - data: URI 直接跳過
  - 驗證 Content-Type 必須為 `image/*`，排除 tracking pixel
  - 沒有有效圖片的文章直接跳過（不寫入 DB）

### 後台文章管理對齊商品管理
- 改用 `SearchToolbar` + `FilterTags`（搜尋框、篩選、清除標籤統一風格）
- 新增**批量勾選**功能：全選 checkbox + 批量上架 / 批量下架 / 批量刪除
- 移除黃色草稿提示橫幅，改為統計列 badge（已上架 N / 下架草稿 N）
- 新增文章按鈕移至右上角，與商品管理一致

---

## 2026-07-09｜情報頁面全面優化

### 前台情報（/news）
- 底部導航：情報 tab 移除 `isCenter: true`，與首頁/排行榜/簽到/會員同樣樣式（不再是浮動橘色圓）
- 列表頁 tab 改用 `Tabs/TabsList/TabsTrigger` 統一元件（帶動畫底線指示器）
- 輪播大圖：標題字體放大至 17px、增加漸層高度、修正文字被裁切問題
- 文章列表：增加行高（leading-[1.5]）與垂直間距（py-4），不再擠壓
- 內頁（/news/[id]）：移除自訂頂部導航，改用全域 Navbar（自動顯示返回鍵 + 分享按鈕，無標題）
- 內頁：移除「資料來源」區塊與「回到情報列表」按鈕，保留標籤列

---

## 2026-07-09｜新聞採集 Agent + 後台文章管理升級

### 新聞採集 Agent（news-agent）
- 每天 TW 06:30 自動執行（pg_cron `news-agent-daily`）
- 12 個日本來源：一番賞/轉蛋/盒玩/TCG/玩具媒體
- Claude Haiku 改寫成繁體中文（台灣用語）
- 主圖從來源站下載後上傳 R2 `news/` 路徑
- 全部預設 `is_active = false`（下架草稿），管理員審閱後手動上架
- LINE 通知：採集完成後推播新增篇數與標題預覽
- Claude Code skill：`/news-agent` 手動觸發

### news 表擴充（migration 297）
- 新增欄位：`image_url`、`source_url`（unique，防重複）、`category`、`summary`、`tags`

### 後台文章管理頁升級
- 表格加圖片縮圖、分類標籤、一句話摘要
- 分類篩選（一番賞/轉蛋/盒玩/卡牌/綜合）+ 狀態篩選
- 狀態欄改為可點擊一鍵切換上架/下架
- 有草稿時顯示黃色提示橫幅
- 編輯表單加入主圖 URL 預覽、摘要、分類欄位

---

## 2026-07-09｜ai-enrich 修正 + CSV 品項圖上傳 R2

### ai-enrich 主圖優先順序修正
- `storageImageUrl`（用戶自行上傳 R2 圖）移至最高優先，不再被 DDG 爬蟲圖覆蓋
- 修正前：`bandaiMainImg ?? siteResult?.image_url ?? ddgImage ?? dbImageByName ?? storageImageUrl`
- 修正後：`storageImageUrl ?? bandaiMainImg ?? siteResult?.image_url ?? ddgImage ?? dbImageByName`

### CSV 匯入品項圖 R2 上傳
- alltest.csv 共 198 張品項圖（分散於 `final_500x500_direct` 和 `images_500x500_webp` 目錄）全部上傳至 R2 `products/` 路徑
- 修正 wizard 品項圖全部顯示「?」的問題（圖片不在 R2 → onError 觸發）
- 上傳腳本：Python3 直接使用 AWS4 簽章，無需額外套件

---

## 2026-07-09｜cron 修復 + 監控修正 + wizard 圖片補全 + 競品情報升級

### Cron 全面修復（7 個 job 因 GUC 未設而全掛）
- `app.backend_url` / `app.base_url` / `app.cron_secret` GUC 參數在 Supabase 不允許 `ALTER DATABASE` 設定
- 解法：全部 unschedule → reschedule，把 `current_setting()` 換成 hardcode URL + secret
- 受影響：`health-check`、`risk-check`、`flag-pending-recharge`、`auto-deliver`、`cmo-agent-daily`、`market-intel-weekly`、`market-discovery-monthly`
- 同步修正 `cmo-agent-daily` 排程：`0 3 * * *` (UTC 3am = 台灣 11am) → `0 1 * * *` (UTC 1am = 台灣 9am)
- 停用 `daily-content-drafts` cron（AI 文案暫停推播）

### 平台監控修正
- 建立 `get_db_size_mb()` SQL function（SECURITY DEFINER），繞過 execute_readonly_sql 動態 SQL 無法查 `pg_database_size()` 的限制
- `platform-monitor/route.ts`：改呼叫 `get_db_size_mb()` RPC，Supabase Pro 容量上限 500 MB → 8,192 MB，告警文字同步修正

### 智能批量匯入 wizard 圖片補全修正
- `imageOk = !!resolvedImg`：一定要有圖才算補全（之前 `raw_image_name` 為空的商品沒圖也顯示「已補全」）
- `resolvedImg = isValidImg(ai.image_url)`：接受任何 https URL（R2 或外部均可）
- `ai-enrich/route.ts`：AI 找到圖後自動下載壓縮（WebP）並上傳 R2，`finalImage` 為 R2 永久 URL
- 移除 expanded section 中的「待配對圖片：xxx.webp」文字顯示
- 加入診斷 log：`rawImage`、`ddgImage`、`R2 upload OK` 方便除錯

### 競品情報頁升級
- 新增「AI 情報週報」頁籤：展示 `market_intel_analysis` 的四層分析（事實 / 解讀 / 建議 / 異常）
- 監控清單顯示：active（綠點）/ candidate（橘點），附「立即爬取分析」按鈕
- 爬蟲升級：子頁多頁嘗試（/products, /kuji 等），`contentRichness()` 取內容最豐頁面，改用 bodyText / `__NEXT_DATA__` snippet 取代 meta description
- 新增 `/api/admin/market-intel` route（GET watchlist/analysis、POST 手動觸發）

---

## 2026-07-09｜Supabase egress 危機處理 + 圖片遷移 R2 + 平台監控

### 問題根本原因
Supabase 免費方案 cached egress 爆量（56.28 GB / 5.5 GB），整個專案 REST API 全停（402 Payment Required）。
根本原因：AI 補全每次對 Supabase Storage CDN 發 HEAD request，zip 上傳大量圖片，多輪測試重複產生重複圖片。

### 解法 1：圖片儲存遷移至 Cloudflare R2
- 開 R2 bucket `ggb`，啟用 Public Development URL
- 新增 `backend/lib/r2.ts`：封裝 `r2Upload`、`r2DeletePrefix`、`r2PublicUrl`
- `upload-images/route.ts`：上傳改寫 R2（key = `products/{filename}`）
- `storage/clear-products/route.ts`：清除改用 `r2DeletePrefix()`，保護 `exchange-receipts`
- `ai-enrich/route.ts`：`resolveStorageImage` 改為同步建構 R2 URL，不再 HEAD ping
- R2 環境變數加至 Vercel（`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_ENDPOINT` / `R2_PUBLIC_URL`）

### 解法 2：升級 Supabase Pro（$25/月）
- 立即恢復 REST API，後台登入及所有功能恢復正常
- 已開 Spend Cap（超量保護），R2 接手圖片後不會再有 egress 問題

### 平台監控儀表板
- `backend/db/migrations/295_platform_monitor_logs.sql`：建立 `platform_monitor_logs` 表，pg_cron 每 6 小時觸發
- `backend/app/api/cron/platform-monitor/route.ts`：檢查 Supabase DB 大小、R2 用量、Vercel 部署狀態、GitHub CI
- `backend/app/api/admin/platform-monitor/route.ts`：管理員讀取 / 手動觸發
- 後台「開發日誌」頁新增「監控」頁籤，4 個狀態卡 + 歷史記錄表
- 異常時推 LINE 告警

### AI 補全升級（merge 進來的 remote 版本）
- 20+ 品牌爬蟲（萬代、壽屋、海洋堂等），DB 條碼復用，4 並行批次處理
- `XlsxImportWizard.tsx`：圖片 onError 降級（`done` → `partial`），`isValidImg` 接受任何 http URL

---

## 2026-07-08｜麵包屑全面修正 + 移除開發自動登入

### 麵包屑全面修正
- 所有上層頁面（商品管理、配送管理、消費紀錄、儲值明細、報表等）移除自訂 breadcrumbs prop，改由 AdminLayout 自動推算，確保和左側欄完全對齊
- 修正多個錯誤標籤：`抽獎紀錄` → `消費紀錄`、`儲值紀錄` → `儲值明細`、`菜單管理` → `分類清單`
- 詳情子頁（`/[id]`）保留自訂 breadcrumbs，標籤已對齊 sidebar group 名稱

### 移除開發模式自動登入
- 移除 AdminContext.tsx 中 dev 模式自動以 superadmin 帳密登入的功能，正式/開發環境一律要求手動輸入帳號密碼

---

## 2026-07-08｜後台 Header 快捷彈窗 + 麵包屑自動化

### Header 新增三個快捷彈窗
- 廠商月結（clipboard）、待審退款（arrow）、待複核儲值（dollar）三個圖標從連結改為彈窗，點擊顯示最新 10 筆清單，可直接跳轉對應頁面
- 系統警示（bell）移到最右邊（配送圖標之後）

### 麵包屑自動化
- 麵包屑不再由各頁面手動傳入，改為 AdminLayout 根據 `menuGroups` 自動推算「群組 > 頁面」，永遠和左側欄對齊
- 各頁面若有特殊需求仍可傳入自訂 `breadcrumbs` prop 覆蓋

---

## 2026-07-08｜後台商品管理大獎狀態修正

- 盒玩、轉蛋、卡牌類別無大獎概念，大獎狀態欄改顯示 `—`，只有一番賞/自製賞顯示廢套/正常

---

## 2026-07-08｜前台轉蛋商品注意事項更新

- 注意事項改為適合 GGB 線上平台的用語（抽到什麼出什麼、廠商出貨、缺貨退 G幣、最終解釋權）
- 共 6 條，移除舊有實體門市相關文字

### 智能批量匯入（待觀察）
目前測試資料較少且多數無 JAN 條碼，品項圖與代理商補全仰賴爬蟲，效果待更多真實資料驗證。

---

## 2026-07-08｜品項圖補全 lazy loading 修正 + 商品頁條碼顯示修正

### AI 補全品項圖改善（`ai-enrich/route.ts`）
- `extractSiteVariantImages` 新增抓取 `data-src`、`data-lazy-src`、`data-original` 屬性，解決日本品牌官網（1kuji.com 等）使用 lazy loading 導致品項圖抓不到的問題
- `withImages` 過濾掉 og:image 主圖，避免主圖混入品項圖陣列造成索引位移
- 新增「直接配對路線」：站點已有品項名 + 站點有圖時，直接對應不呼叫 Claude Vision（更快更省 token）
- `claudeIdentify` 修正「潮玩賞」說明：台灣競品平台自定義名稱，直接忽略

### 前台商品頁條碼修正（`GachaCollectionList.tsx`、`item/[id]/page.tsx`）
- 條碼欄位改為顯示 `barcode`（JAN 國際條碼，如 `4582769995743`），不再顯示 `product_code`（系統內部碼，如 `10000033`）

---

## 2026-07-08｜AI 補全大升級：全品牌官網品項爬取

### 新增 20+ 品牌官方網址爬蟲（`ai-enrich/route.ts`）

按 `product_type` 路由到對應品牌群組，並行搜尋，第一個命中有品項資料的結果勝出：

**一番賞（ichiban）**：1kuji.com、charahiroba.com、segaplaza.jp、hikokuji.com、kujibikido.com、taito.co.jp/taitokuji、sanrio.co.jp、square-enix.com

**轉蛋（gacha）**：gashapon.jp、takaratomy-arts.co.jp、kitan.jp、kenelephant.co.jp、epoch.jp、qualia-45.jp、bushiroad-creative.com

**盒玩（blindbox）**：re-ment.co.jp、megahobby.jp、goodsmile.com、kotobukiya.co.jp、popmart.com

**卡牌（card）**：ws-tcg.com、cf-vanguard.com、unionarena-tcg.com、rebirth-fy.com、osicatcg.com、shadowverse-evolve.com、battlespirits.com

**自製賞（custom）**：同一番賞系列 + 盒玩系列（1kuji/charahiroba/sega/hikokuji/kujibikido/megahouse/goodsmile）

### 整體流程
1. Storage 比對 raw_image_name → image_url（已上傳 zip 就直接用）
2. DB 條碼比對 → 復用既有商品資料
3. 品牌官網並行搜尋 → 拿品項名稱/等級/定價/代理商（不抓圖）
4. 萬代目錄文字備援 + Yahoo 定價備援
5. Claude Haiku 補全剩餘品項名稱

### 修正 stats bug
- `缺主圖` 改為 `!image_url && !raw_image_name`（有 raw_image_name = 有圖來源，只是等 zip 上傳）
- `aiStatus` 不再依賴是否有圖，改由「是否找到有用資訊」決定

---

## 2026-07-08｜AI 補全修正：萬代目錄還原 + 品項圖精準化

### 問題（上一版的缺陷）
1. **萬代商品主圖錯誤**：移除了 `bandai.co.jp/catalog` 爬蟲，改用通用多平台搜尋，抓到的是亂圖
2. **代理商欄位空白卻顯示「已補全」**：通用搜尋無法判斷代理商，`distributor` 永遠 null
3. **品項圖抓到網站 icon**：AmiAmi/Yahoo 搜尋結果頁裡的 UI 圖示（河、人、購物車⋯⋯）被誤抓為品項圖
4. **品項數量亂來**：通用搜尋隨機抓到幾張就顯示幾個品項

### 修正（`ai-enrich/route.ts`）
**Layer 0：萬代官方目錄（最高優先）**
- 有 JAN 條碼時，優先打 `bandai.co.jp/catalog/item.php?jan_cd={barcode}000`
- 命中後：`images[0]` = 主圖、`images[1..]` = 品項圖（官方順序）、`jp_price_yen` 自動填入、`distributor = '萬代股份有限公司（BANDAI）'`
- `hintCount > 0` 時按品項數截取（防止圖多於品項款式的情況）
- 命中即回傳，**完全跳過其他平台搜尋**，`aiStatus: 'done'`

**Layer 1-5：非萬代多平台（Bandai 找不到才走）**
- Yahoo Japan、AmiAmi、Rakuten、Suruga-ya、DuckDuckGo 並行
- 品項圖來源嚴格限制：只從 **product detail 頁**抓（Yahoo detail + AmiAmi detail），不從搜尋結果頁抓
- 增加圖片過濾：含 `icon/logo/banner/cart/bell/badge/nav/menu` 等字樣的 URL 一律跳過

---

## 2026-07-08｜智能批量匯入全面重設計

### 欄位擴充（`parse-xlsx/route.ts`、`XlsxImportWizard.tsx`）
新增可識別欄位：`name_jp`（日文名）、`series`（系列）、`release_year/month`（發售時間）、`cost`（成本）、`special_price`（特價）。品項欄新增 `prize_image_columns` 對應品項圖片。

### Migration 294
`products` 表新增 `jp_price_yen INTEGER`（日幣定價）與 `special_price INTEGER`（特價），供批量匯入時寫入。

### 圖片邏輯（`XlsxImportWizard.tsx`）
- `image_url` 只存 http/https URL，非 URL 的檔名改存 `raw_image_name`
- 圖片格子顯示 📄 代表「有檔名但待上傳 Storage」
- 新增「📦 圖片壓縮檔」按鈕：上傳 zip → 解壓 → 批量寫入 Supabase Storage → 自動配對商品清單中的 `raw_image_name`

### 圖片壓縮檔 API（`upload-images/route.ts`）
接收 .zip → `adm-zip` 解壓 → 每張圖片 upsert 至 `products` bucket → 回傳 `{name, url}` 列表。

### 搜圖策略重構（`ai-enrich/route.ts`）
移除品牌特定爬蟲（Bandai/kuji.co.jp/gashapon.jp），改為通用多平台策略：
- Yahoo Japan Shopping（任何廠牌條碼/名稱搜）
- AmiAmi（アニメ/フィギュア專門）
- Rakuten（樂天市場）
- Suruga-ya（駿河屋，覆蓋率極高）
- DuckDuckGo × 2（廣域備援）
- 全部並行跑，Claude Vision 從評分前 8 名選最佳主圖
- 抽卡/自製賞（`card/custom`）：主圖直接取第一名（ai 選圖成本高且效果差），標為 `partial` 而非 `done`

### 缺資訊統計面板 + 點擊高閃
Preview 標題列新增三個 chip（點擊切換高閃模式）：
- 🖼 缺主圖 N：image_url 為空的商品列高閃橘色
- 📦 缺品項 N：無 variants 的商品列高閃
- 💰 缺定價 N：jp_price_yen 和 price_twd 都缺的高閃

### 全列可展開
每列都可點擊展開，不限於有品項的商品。展開內容：
- 日文名稱、發售時間、成本、特價、待配對圖片檔名
- 品項列表（含圖片 + 名稱）
- 若無任何品項 → 顯示「無任何品項資訊」

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
- `onError` 升級：圖片載入失敗時同步呼叫 `setProducts` 把 `aiStatus: 'done'` → `'partial'`，顯示重試按鈕

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

## 2026-07-14（卡包 3D 厚度感優化 + 新包圖更新）

### 前台（Next.js / frontend）

**卡包 3D 展示**
- `ProductPackViewer3D`：`PACK_THICKNESS` 從 24px 改為 5px，更貼近真實卡包比例
- 新增左右 CSS 3D 側面色塊，自動取樣 packImage 左右邊緣像素顏色當作側面漸層
- 新增 `backImage` prop，背面圖可傳入（預設 `/images/card/back.png`）
- 新卡包圖更新至 `public/images/card/pack/`（01a~05a 正面、01b~05b 背面）
- Carousel 與 CardDrawAnimation 路徑從 `/images/card/card/` 改為 `/images/card/pack/`

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
