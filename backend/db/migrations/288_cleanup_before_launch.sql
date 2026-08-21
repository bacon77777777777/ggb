-- ============================================================
-- Migration 288: 正式上線前完全清除測試資料
-- ============================================================
-- 執行前確認：只有在收到老闆指令「清全站資料」後才執行。
-- 此腳本在 transaction 中執行；執行後請確認輸出無誤再 COMMIT。
--
-- 保留：admins, feature_flags, platform_settings,
--        dev_logs（永不清除），AI 記憶資料（永不清除），
--        users WHERE is_bot = true（機器人帳號），
--        draw_records WHERE is_bot = true（機器人抽獎記錄，維持排行榜），
--        news / news_comments / news_likes（情報文章＋機器人互動，全部保留），
--        events WHERE slug='fairness'（抽獎公平性頁，常駐不刪），
--        slot_danmaku_bots（機器人彈幕）
-- ============================================================

BEGIN;

-- ── 1. 商品/廠商/輪播圖資料（全清） ────────────────────────────
-- 輪播圖管理四個 tab：home/challenge/app_splash 在 banners、首頁彈窗在 site_promos
TRUNCATE TABLE
  product_prizes,
  products,
  suppliers,
  banners,
  site_promos
RESTART IDENTITY CASCADE;

-- ── 1b. 機台（老虎機）全清；slot_danmaku_bots 是機器人彈幕，保留 ──────
TRUNCATE TABLE
  slot_spin_logs,
  slot_sessions,
  slot_pool_items,
  slot_theme_prizes,
  slot_machines,
  slot_themes
RESTART IDENTITY CASCADE;

-- ── 1c. 活動頁全清，但保留「抽獎公平性」(slug='fairness') ──────────────
-- event_sections 的 FK 是 ON DELETE CASCADE，刪 events 會自動連帶刪 sections
DELETE FROM events WHERE slug <> 'fairness';

-- ── 2. 使用者交易/行為資料（全清，CASCADE 處理 FK） ────────────
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
  marketplace_transactions
RESTART IDENTITY CASCADE;

-- ── 3. draw_records：只清真實用戶，保留機器人記錄（維持排行榜） ──
-- 注意：不用 TRUNCATE，改用 DELETE 才能加 WHERE
DELETE FROM draw_records
WHERE user_id IN (
  SELECT id FROM users
  WHERE is_bot IS NULL OR is_bot = false
);

-- ── 4. AI / 系統資料（永久保留，不清除） ───────────────────────
-- 以下表為 AI 長期積累的記憶與經驗，不可清除：
-- line_conversations（GB哥對話記憶）
-- agent_events（事件匯流排歷史）
-- action_logs（管理員稽核軌跡）
-- content_drafts（AI 文案草稿）
-- gb_pending_actions（GB哥 待確認動作）
-- capability_gaps（GB哥 能力缺口記錄）
-- settlement_snapshots（廠商月結快照）
-- market_intel_analysis（競品分析報告）
-- competitor_posts / competitor_reports / competitor_watchlist
-- tag_daily_stats、meeting_logs、tasks
-- dev_logs（永不清除）

-- 清除：webhook_events + leaderboard_bot_daily_stats（重新上線後由 ensure_bot_daily_stats 補回）
TRUNCATE TABLE
  webhook_events,
  leaderboard_bot_daily_stats
RESTART IDENTITY CASCADE;

-- ── 5. 使用者帳號：只保留機器人，其餘全刪 ────────────────────
DELETE FROM users
WHERE is_bot IS NULL OR is_bot = false;

-- ── 6. 寫入 dev_logs 記錄此次清除操作 ─────────────────────────
INSERT INTO dev_logs (version, title, description, type, status, priority)
VALUES (
  'DB-RESET',
  '全站資料清除',
  '執行 migration 288 清除全站測試資料。清除：商品/品項/廠商/輪播圖/首頁彈窗/機台/活動頁(保留抽獎公平性)、所有真人交易與行為資料、真人帳號。保留：管理員、功能開關、平台設定、dev_logs、AI 記憶、機器人帳號及其抽獎記錄、情報文章、抽獎公平性活動頁。',
  'improvement',
  'released',
  'high'
);

-- ── 7. 確認結果（清除後的各表筆數） ───────────────────────────
SELECT 'users（全部）'        AS tbl, COUNT(*) AS remaining FROM users
UNION ALL SELECT 'users（真人）',     COUNT(*) FROM users WHERE is_bot IS NULL OR is_bot = false
UNION ALL SELECT 'users（機器人）',   COUNT(*) FROM users WHERE is_bot = true
UNION ALL SELECT 'draw_records',      COUNT(*) FROM draw_records
UNION ALL SELECT 'draw_records（bot）',COUNT(*) FROM draw_records dr JOIN users u ON u.id = dr.user_id WHERE u.is_bot = true
UNION ALL SELECT 'recharge_records',  COUNT(*) FROM recharge_records
UNION ALL SELECT 'orders',            COUNT(*) FROM orders
UNION ALL SELECT 'token_adjustments', COUNT(*) FROM token_adjustments
UNION ALL SELECT 'action_logs',       COUNT(*) FROM action_logs
UNION ALL SELECT 'line_conversations',COUNT(*) FROM line_conversations
UNION ALL SELECT 'agent_events',      COUNT(*) FROM agent_events
UNION ALL SELECT '--- KEPT ---',      0
UNION ALL SELECT 'admins',            COUNT(*) FROM admins
UNION ALL SELECT 'dev_logs',          COUNT(*) FROM dev_logs
UNION ALL SELECT 'feature_flags',     COUNT(*) FROM feature_flags
UNION ALL SELECT 'platform_settings', COUNT(*) FROM platform_settings;

COMMIT;
