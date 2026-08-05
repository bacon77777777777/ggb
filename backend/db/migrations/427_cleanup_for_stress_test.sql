-- 427: 壓測用的資料清除（288 的修正版）
--
-- 與 288 的差異，三處都是 288 的實際缺陷：
--
-- 1. 288 標頭寫「保留 draw_records WHERE is_bot = true（維持排行榜）」是錯的。
--    TRUNCATE products ... CASCADE 會把 draw_records 整張清空 —— CASCADE 是
--    連帶清空引用表，不是套用該外鍵的 ON DELETE SET NULL。
--    所以 288 第 3 段那個 DELETE ... WHERE 真實用戶 是永遠刪不到東西的死碼。
--    此版本不再假裝保留，改為明講「機器人紀錄也會清掉」。
--    （2026-08-05 起不需要補回：機器人的六個前台展示點都不依賴 draw_records）
--
-- 2. 288 沒清機台相關：slot_spin_logs 會留著，slot_machines 的保底進度、
--    佔用狀態、當日計數也不會重設，壓測會拿到髒的起始值。
--
-- 3. 288 沒有涵蓋後來新增的表。
--
-- 保留（與 288 相同，另加註）：
--   admins / 權限、platform_settings、feature_flags、module_settings、categories、tags
--   dev_logs（永不清除）
--   news 與其留言/讚 —— 467 篇 AI 產出，重跑要數小時且要花錢
--   AI 記憶全部（line_conversations、agent_events、action_logs、content_drafts、
--     gb_pending_actions、capability_gaps、settlement_snapshots、market_intel_*、
--     competitor_*、tag_daily_stats、meeting_logs、tasks）
--   users WHERE is_bot = true（101 個機器人帳號本身）
--   events / event_sections、site_promos、announcements（壓測要沿用）
--   slot_themes / slot_machines（只重設狀態，不刪主題）
--
-- 執行前提：老闆明確指示才跑。已包在 transaction，確認輸出無誤再 COMMIT。

BEGIN;

-- ── 1. 商品／廠商／輪播圖 ───────────────────────────────────────────────
-- ⚠ CASCADE 會連帶清空 draw_records（含機器人的），這是預期行為
TRUNCATE TABLE
  product_prizes,
  products,
  suppliers,
  banners
RESTART IDENTITY CASCADE;

-- ── 2. 交易與行為 ───────────────────────────────────────────────────────
TRUNCATE TABLE
  order_items,
  orders,
  recharge_records,
  token_adjustments,
  user_event_logs,
  user_events,
  notifications,
  refund_requests,
  user_badges,
  user_coupons,
  user_task_progress,
  user_titles,
  referrals,
  daily_check_ins,
  user_worship_logs,
  product_follows,
  product_view_events,
  visit_logs,
  user_ip_log,
  search_logs,
  sell_listings,
  sell_messages,
  sell_orders,
  sell_seller_profiles,
  sell_listing_view_events,
  exchange_messages,
  exchange_offer_activation_codes,
  exchange_offer_cards,
  exchange_offers,
  exchange_orders,
  marketplace_listings,
  marketplace_messages,
  marketplace_orders,
  marketplace_seller_profiles,
  marketplace_transactions,
  webhook_events,
  leaderboard_bot_daily_stats
RESTART IDENTITY CASCADE;

-- ── 3. 機台：清紀錄、重設狀態，但保留主題與機台本體 ────────────────────
TRUNCATE TABLE slot_spin_logs RESTART IDENTITY;

UPDATE slot_machines SET
  floor_counter        = 0,
  rush_state           = NULL,
  occupant_id          = NULL,
  occupant_active_until= NULL,
  occupancy_expires_at = NULL,
  day_spins            = 0,
  day_rush             = 0,
  day_reset_date       = CURRENT_DATE;

-- 獎池品項指向 product_prizes，已被上面的 CASCADE 清掉；這裡只是保險
DELETE FROM slot_pool_items;

-- ── 4. 真實用戶帳號（機器人保留） ───────────────────────────────────────
DELETE FROM users
WHERE is_bot IS NULL OR is_bot = false;

-- ── 5. 記錄此次操作 ─────────────────────────────────────────────────────
INSERT INTO dev_logs (version, title, description, type, status, priority)
VALUES (
  'DB-RESET',
  '壓測前資料清除',
  '執行 migration 427。清除：商品／廠商／輪播圖、所有交易與行為資料、真實用戶帳號、機台紀錄與狀態。'
  '保留：管理員、平台設定、dev_logs、news 文章、AI 記憶、機器人帳號、活動頁、首頁彈窗、機台主題。'
  '注意：機器人的 draw_records 會被 products CASCADE 一併清除，但不需補回 —— 前台展示點都走獨立資料來源。',
  'improvement', 'released', 'high'
);

-- ── 6. 確認結果 ─────────────────────────────────────────────────────────
SELECT '── 應為 0 ──'       AS tbl, NULL::bigint AS cnt
UNION ALL SELECT 'products',          COUNT(*) FROM products
UNION ALL SELECT 'draw_records',      COUNT(*) FROM draw_records
UNION ALL SELECT 'orders',            COUNT(*) FROM orders
UNION ALL SELECT 'recharge_records',  COUNT(*) FROM recharge_records
UNION ALL SELECT 'token_adjustments', COUNT(*) FROM token_adjustments
UNION ALL SELECT 'slot_spin_logs',    COUNT(*) FROM slot_spin_logs
UNION ALL SELECT 'users（真人）',      COUNT(*) FROM users WHERE is_bot IS NULL OR is_bot = false
UNION ALL SELECT '── 應保留 ──',       NULL
UNION ALL SELECT 'users（機器人）',    COUNT(*) FROM users WHERE is_bot = true
UNION ALL SELECT 'news',              COUNT(*) FROM news
UNION ALL SELECT 'dev_logs',          COUNT(*) FROM dev_logs
UNION ALL SELECT 'admins',            COUNT(*) FROM admins
UNION ALL SELECT 'platform_settings', COUNT(*) FROM platform_settings
UNION ALL SELECT 'events',            COUNT(*) FROM events
UNION ALL SELECT 'site_promos',       COUNT(*) FROM site_promos
UNION ALL SELECT 'slot_themes',       COUNT(*) FROM slot_themes
UNION ALL SELECT 'line_conversations',COUNT(*) FROM line_conversations
UNION ALL SELECT 'agent_events',      COUNT(*) FROM agent_events;

-- 確認上面數字無誤後才 COMMIT；有問題就 ROLLBACK
COMMIT;
