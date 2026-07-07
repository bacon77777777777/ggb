-- Migration 289: 正式上線 Bot 種子帳號（30 個）
-- ─────────────────────────────────────────────────────────────────────────────
-- 目的：讓排行榜和跑馬燈在零真實用戶時仍有視覺內容。
--
-- 設計原則：
--   1. Bot 只存在於 users 表（is_bot = true），不寫 draw_records / recharge_records
--   2. 排行榜統計由 ensure_bot_daily_stats() 自動依 created_at 排序生成
--      → 最先建立 = 分數最高，依序遞減，前 20 名 bot 佔據排行榜頂端
--   3. 跑馬燈當 draw_records < 20 時自動 fallback 至 get_winning_records 的
--      hardcoded mock，無需 bot 寫入 draw_records
--   4. tokens 欄位為展示用，不影響任何財務報表（is_bot = true 已全程排除）
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO users (id, name, email, tokens, is_bot, avatar_url, created_at)
VALUES
  -- ── 排行榜明星（前 20，分數由高到低）───────────────────────────────────
  (gen_random_uuid(), '志明＊＊',   'bot01@ggb.internal', 28400, true, '/images/avatar/01.png', NOW() - INTERVAL '180 days'),
  (gen_random_uuid(), '阿哲＊＊',   'bot02@ggb.internal', 19200, true, '/images/avatar/02.png', NOW() - INTERVAL '179 days'),
  (gen_random_uuid(), '小芸＊＊',   'bot03@ggb.internal', 15600, true, '/images/avatar/03.png', NOW() - INTERVAL '178 days'),
  (gen_random_uuid(), '承翰＊＊',   'bot04@ggb.internal', 12800, true, '/images/avatar/04.png', NOW() - INTERVAL '177 days'),
  (gen_random_uuid(), '依婷＊＊',   'bot05@ggb.internal',  9300, true, '/images/avatar/05.png', NOW() - INTERVAL '176 days'),
  (gen_random_uuid(), 'GachaKing',  'bot06@ggb.internal',  8100, true, '/images/avatar/06.png', NOW() - INTERVAL '175 days'),
  (gen_random_uuid(), '皓宇＊＊',   'bot07@ggb.internal',  7200, true, '/images/avatar/07.png', NOW() - INTERVAL '174 days'),
  (gen_random_uuid(), '怡君＊＊',   'bot08@ggb.internal',  6500, true, '/images/avatar/08.png', NOW() - INTERVAL '173 days'),
  (gen_random_uuid(), '宜蓁＊＊',   'bot09@ggb.internal',  5800, true, '/images/avatar/09.png', NOW() - INTERVAL '172 days'),
  (gen_random_uuid(), '阿凱＊＊',   'bot10@ggb.internal',  5100, true, '/images/avatar/10.png', NOW() - INTERVAL '171 days'),
  (gen_random_uuid(), '小葉＊＊',   'bot11@ggb.internal',  4600, true, '/images/avatar/11.png', NOW() - INTERVAL '170 days'),
  (gen_random_uuid(), '梁小＊＊',   'bot12@ggb.internal',  4100, true, '/images/avatar/12.png', NOW() - INTERVAL '169 days'),
  (gen_random_uuid(), '春嬌＊＊',   'bot13@ggb.internal',  3700, true, '/images/avatar/01.png', NOW() - INTERVAL '168 days'),
  (gen_random_uuid(), 'Lucky777',   'bot14@ggb.internal',  3300, true, '/images/avatar/02.png', NOW() - INTERVAL '167 days'),
  (gen_random_uuid(), '豪哥＊＊',   'bot15@ggb.internal',  2900, true, '/images/avatar/03.png', NOW() - INTERVAL '166 days'),
  (gen_random_uuid(), '欣怡＊＊',   'bot16@ggb.internal',  2500, true, '/images/avatar/04.png', NOW() - INTERVAL '165 days'),
  (gen_random_uuid(), '御宅一號',   'bot17@ggb.internal',  2200, true, '/images/avatar/05.png', NOW() - INTERVAL '164 days'),
  (gen_random_uuid(), '轉蛋達人',   'bot18@ggb.internal',  1900, true, '/images/avatar/06.png', NOW() - INTERVAL '163 days'),
  (gen_random_uuid(), '阿龍＊＊',   'bot19@ggb.internal',  1700, true, '/images/avatar/07.png', NOW() - INTERVAL '162 days'),
  (gen_random_uuid(), '幸運星星',   'bot20@ggb.internal',  1500, true, '/images/avatar/08.png', NOW() - INTERVAL '161 days'),
  -- ── 補位帳號（後 10，維持會員列表多樣性）────────────────────────────────
  (gen_random_uuid(), '夜晚的貓',   'bot21@ggb.internal',  1300, true, '/images/avatar/09.png', NOW() - INTERVAL '160 days'),
  (gen_random_uuid(), 'MiniMaster', 'bot22@ggb.internal',  1100, true, '/images/avatar/10.png', NOW() - INTERVAL '159 days'),
  (gen_random_uuid(), '轉蛋勇者',   'bot23@ggb.internal',   950, true, '/images/avatar/11.png', NOW() - INTERVAL '158 days'),
  (gen_random_uuid(), '小林＊＊',   'bot24@ggb.internal',   800, true, '/images/avatar/12.png', NOW() - INTERVAL '157 days'),
  (gen_random_uuid(), '田中＊＊',   'bot25@ggb.internal',   680, true, '/images/avatar/01.png', NOW() - INTERVAL '156 days'),
  (gen_random_uuid(), '佐藤＊＊',   'bot26@ggb.internal',   560, true, '/images/avatar/02.png', NOW() - INTERVAL '155 days'),
  (gen_random_uuid(), '大橋＊＊',   'bot27@ggb.internal',   440, true, '/images/avatar/03.png', NOW() - INTERVAL '154 days'),
  (gen_random_uuid(), '木村＊＊',   'bot28@ggb.internal',   320, true, '/images/avatar/04.png', NOW() - INTERVAL '153 days'),
  (gen_random_uuid(), '山本＊＊',   'bot29@ggb.internal',   220, true, '/images/avatar/05.png', NOW() - INTERVAL '152 days'),
  (gen_random_uuid(), '神秘玩家',   'bot30@ggb.internal',   150, true, '/images/avatar/06.png', NOW() - INTERVAL '151 days')
ON CONFLICT (email) DO NOTHING;

-- 預先生成今天 + 過去 7 天的 bot 每日統計，讓排行榜開局就有歷史數據
SELECT ensure_bot_daily_stats(CURRENT_DATE - n)
FROM generate_series(0, 6) AS n;

-- 確認結果
SELECT COUNT(*) AS bot_count FROM users WHERE is_bot = true;
SELECT COUNT(*) AS bot_stats_rows FROM leaderboard_bot_daily_stats;
