-- ============================================================
-- Migration 288: 正式上線前完全清除測試資料
-- ============================================================
-- 執行前確認：只有在收到老闆指令「清全站資料」後才執行。
-- 此腳本在 transaction 中執行；執行後請確認輸出無誤再 COMMIT。
--
-- 保留：products, product_prizes, suppliers, admins,
--        feature_flags, platform_settings, categories,
--        banners, risk_alert_settings, series_keywords,
--        roles, titles, badges（系統定義），tags
-- ============================================================

BEGIN;

-- ── 1. 使用者交易/行為資料（全清） ────────────────────────────
-- 使用 CASCADE 確保 FK 依賴表也一起清除
TRUNCATE TABLE
  order_items,
  draw_records,
  recharge_records,
  orders,
  token_adjustments,
  user_event_logs,
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

-- ── 2. AI / 系統生成資料（全清） ───────────────────────────────
TRUNCATE TABLE
  line_conversations,
  agent_events,
  webhook_events,
  action_logs,
  content_drafts,
  gb_pending_actions,
  capability_gaps,
  settlement_snapshots,
  leaderboard_bot_daily_stats,
  market_intel_analysis,
  competitor_posts,
  competitor_reports,
  competitor_watchlist,
  dev_logs,
  tag_daily_stats,
  meeting_logs,
  tasks
RESTART IDENTITY CASCADE;

-- ── 3. 使用者帳號（刪 bot + 測試帳號，保留真人） ─────────────
DELETE FROM users
WHERE is_bot = true
   OR email IN ('test001@gmail.com', 'test002@gmail.com');

-- 保留的真人帳號（老闆本人）重置代幣為 0
UPDATE users
SET tokens = 0
WHERE email IN ('bacon731@gmail.com', 'bacon731jp@gmail.com');

-- ── 4. 確認結果（清除後的各表筆數） ───────────────────────────
SELECT 'users'              AS tbl, COUNT(*) AS remaining FROM users
UNION ALL SELECT 'recharge_records', COUNT(*) FROM recharge_records
UNION ALL SELECT 'draw_records',     COUNT(*) FROM draw_records
UNION ALL SELECT 'orders',           COUNT(*) FROM orders
UNION ALL SELECT 'token_adjustments',COUNT(*) FROM token_adjustments
UNION ALL SELECT 'action_logs',      COUNT(*) FROM action_logs
UNION ALL SELECT 'line_conversations',COUNT(*) FROM line_conversations
UNION ALL SELECT 'agent_events',     COUNT(*) FROM agent_events
UNION ALL SELECT '--- KEPT ---',     0
UNION ALL SELECT 'products',         COUNT(*) FROM products
UNION ALL SELECT 'product_prizes',   COUNT(*) FROM product_prizes
UNION ALL SELECT 'suppliers',        COUNT(*) FROM suppliers
UNION ALL SELECT 'admins',           COUNT(*) FROM admins
UNION ALL SELECT 'feature_flags',    COUNT(*) FROM feature_flags
UNION ALL SELECT 'platform_settings',COUNT(*) FROM platform_settings;

COMMIT;
