-- 219_seed_dev_logs.sql
-- Seed initial development log entries for the 開發紀錄 admin page

INSERT INTO public.dev_logs (version, title, description, type, status, priority, created_at) VALUES

-- 2026-07-01 後台持續開發
('v1.5.0', '儀表板卡片 UI 全面優化', 'InfoTooltip 藍色驚嘆號圖標套用至所有統計卡、圖表、排名列表；統一標題 CSS（text-lg→text-sm）；StatCard 不論有無圖表都保留高度佔位；商品排名名稱改為 text-xs + line-clamp-2。', 'improvement', 'released', 'medium', '2026-07-01 10:00:00+08'),

('v1.5.0', '儀表板統計卡數據優化', '將意義重複的「期間轉化率」改為「平均客單價(TWD)」（ARPU = 總儲值 ÷ 付費人數）；將「ABC賞已出數量」改為「付費用戶數」（期間付費不重複用戶）。', 'improvement', 'released', 'high', '2026-07-01 10:10:00+08'),

('v1.5.0', '物流明細報表優化', '移除頂部統計小卡及收件人欄位；工具列（日期區間 + 匯出CSV）移至 PageCard 外側；預設顯示本月 1 日至今的日期範圍，與商品消費版型一致。', 'improvement', 'released', 'medium', '2026-07-01 10:20:00+08'),

('v1.5.0', '儲值明細工具列優化', '日期區間選擇器與匯出 CSV 按鈕移至 PageCard 外側，與商品消費頁版型對齊；預設日期範圍改為本月 1 日至今。', 'improvement', 'released', 'low', '2026-07-01 10:30:00+08'),

('v1.5.0', '商品消費種類欄位修正', '分類欄位從 category（常顯示「未分類」）改為 type 欄位，對應中文標籤：gacha→轉蛋、ichiban→一番賞、blindbox→盒玩；篩選器同步改用 type 欄位。', 'fix', 'released', 'high', '2026-07-01 10:40:00+08'),

('v1.5.0', '側欄結構重組與命名優化', '「主頁」群組改名為「營運總覽」；「營運總覽」頁改名為「轉換分析」，僅保留轉換漏斗與付費行為分析，移除與儀表板重複的資金流動/會員大卡；物流明細移至儲值明細正下方。', 'improvement', 'released', 'medium', '2026-07-01 10:50:00+08'),

('v1.5.0', '排名列表 TOP 10 升級至 TOP 15', '熱門商品、熱門搜尋字、最多點擊系列三個排名列表由 TOP 10 改為 TOP 15；RankingList 元件新增 limit prop，不再硬寫數量。', 'improvement', 'released', 'low', '2026-07-01 11:00:00+08'),

('v1.5.0', '修復 Vercel 部署重複觸發', '移除 .github/workflows/deploy.yml（Vercel GitHub 整合已自動部署，原 webhook 造成每次 push 觸發兩倍部署次數，達到 Hobby 方案上限）。', 'fix', 'released', 'high', '2026-07-01 11:10:00+08'),

-- 2026-07-01 前台開發
('v1.4.0', '個人化演算法全流程串接', 'get_user_series_preferences RPC 依抽轉紀錄計算 series 偏好分數；首頁 seriesTabs 排序：個人偏好 → 全平台熱門 → 商品數量三層降級；精選排序同步支援個人化。', 'feature', 'released', 'high', '2026-07-01 00:00:00+08'),

('v1.4.0', '排行榜與跑馬燈假數據兜底', 'draw_records < 20 筆時以 is_hot 代理熱門度並回傳示範數據，平台初期無真實資料時介面仍可正常顯示。', 'feature', 'released', 'medium', '2026-07-01 01:00:00+08'),

('v1.4.0', '用戶行為數據整合至儀表板', '移除側欄獨立「用戶行為」頁；儀表板新增三張行為統計卡（點擊商品數、點擊後成功抽獎、點擊→抽轉化率）；排名列表擴展為三欄：最多點擊系列 / 熱門商品 / 熱門搜尋字。', 'improvement', 'released', 'high', '2026-07-01 02:00:00+08'),

-- 2026-06-30 主要開發
('v1.3.0', '報表頁面建立（儲值/消費/摘要）', '新增 /reports 路由（三個 Tab）：儲值明細、消費明細、期間摘要 KPI；支援 DateRangePicker 篩選、各 Tab 匯出 CSV（帶 BOM）。', 'feature', 'released', 'high', '2026-06-30 10:00:00+08'),

('v1.3.0', '廠商管理功能', 'Migration 187：suppliers 表 + products.supplier_id FK；廠商 CRUD API + 管理頁面（列表、新增/編輯 Modal、刪除確認）；商品編輯頁加入供應廠商下拉選單。', 'feature', 'released', 'high', '2026-06-30 11:00:00+08'),

('v1.3.0', '儀表板圖表架構', '儲值趨勢、儲值/消耗對比、抽獎次數柱狀圖、分類圓餅圖、TOP 排名列表完整建立，待真實資料累積後驗證數值。', 'feature', 'released', 'medium', '2026-06-30 12:00:00+08'),

-- 2026-06-30 DB 補齊
('v1.2.0', 'DB 安全 Bootstrap 補遷移', '新 DB 原只有 9 張表，透過兩支安全 bootstrap migration（全程 CREATE TABLE IF NOT EXISTS）將 DB 擴展至 46 張表，修復前後台大量頁面 500 或資料空白問題。', 'fix', 'released', 'high', '2026-06-30 09:00:00+08'),

('v1.2.0', 'GitHub Actions 自動化 DB 遷移', '新增 .github/workflows/migrate.yml：push 到 main 且有 .sql 變動時自動觸發；以 _migration_log 表追蹤已套用 migration，避免重複執行。', 'feature', 'released', 'high', '2026-06-30 09:30:00+08'),

('v1.2.0', '物流明細報表 + 運費設定', 'Migration 218：platform_settings 表（key-value），預設運費 60；GET/PUT /api/admin/reports/logistics；/reports/logistics 報表頁（日期篩選/狀態篩選/搜尋/CSV）；/settings/shipping 宅配運費設定頁。', 'feature', 'released', 'high', '2026-06-30 14:00:00+08'),

-- 2026-06-29
('v1.1.0', '平台上線遷移啟動', '建立 GitHub repo（bacon77777777777/ggb）並推送 main；強化 manual_migrate.js 支援依序套用 migrations；建立新 Supabase 專案 ggb-prod 並取得 API keys。', 'feature', 'released', 'high', '2026-06-29 12:00:00+08'),

-- 2026-05-30
('v1.0.0', '販售功能（市集）', '前台：販售上架頁（蝦皮式規格編輯）、圖片上傳至 Supabase Storage marketplace、賣家收款/私下交易設定、販售訂單流程頁（step 流程 + 付款證明上傳）、私聊統一（exchange + marketplace 共用 /messages）。', 'feature', 'released', 'high', '2026-05-30 10:00:00+08')

ON CONFLICT DO NOTHING;
