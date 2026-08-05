-- 465: 抽獎次數只認「花了代幣、拿到品項」的那一抽
--
-- 起因是老闆問「機台的每一轉要算抽獎次數嗎（任務跟成就）」。查下來，
-- 同一件事現在有三種答案，而且兩個方向都在傷人：
--
--   draw_records 落列          → 每轉都算（退幣也寫一列）
--   排行榜抽獎榜               → 每轉都算（沒濾退幣）
--   火力全開「單日100抽」勳章  → 每轉都算（沒濾退幣）
--   users.total_draws          → 只有中品項那轉算
--   draw_count 任務            → 完全不算（/api/slot 沒推任何事件）
--
-- 實測數字（STG）：機台最低檔 10 代幣/轉，轉蛋單抽中位 150 —— 15 倍差；
-- 轉過的 235 轉裡 202 轉是退幣（86%），單一玩家單日最高 196 轉。
-- 也就是說機台玩家單日隨手就吃掉「火力全開 單日100抽」的 1200 積分，
-- 抽獎榜當天 196 分，轉蛋玩家要花 29,400 代幣才追得上。
-- 反過來純機台玩家的每日任務「完成1次抽獎」永遠停在 0/1。
--
-- 定案（老闆拍板）：**抽到 RUSH 獎池品項才算一抽，退幣不算。**
-- 退幣是找零，不是抽獎結果。折算後平均約 7 轉中 1 次品項 = 70 代幣/抽，
-- 跟轉蛋的 150 同一個量級，不再是 15 倍。
--
-- ── 順帶修掉的：total_draws 被重複累加 ──
-- 查的過程發現 total_draws 根本就是錯的。play_gacha 在迴圈裡自己 +1，
-- 而 /api/gacha 又呼叫 track_mission_event('draw_count')，那裡面也 +count。
-- STG 實測：玩家「123」欄位記 5411，實際只有 3475 筆紀錄（其中 404 筆退幣）。
-- 也就是小卡的「累計轉蛋 N 次」灌水 1.5 倍，抽獎勳章（draw_30 / 100 / 500 /
-- 1000 / 5000）在真實抽數的一半就解鎖了。
--
-- 改成單一來源：**只有 track_mission_event('draw_count') 能動 total_draws**。
-- 它本來就同時管 draw_streak 和 single_day_draws，是任務的正門；
-- play_* 函數裡的那幾行自己加是後來各自補上去的，才會撞在一起。

-- ── 1. 拔掉 play_* 裡自己加 total_draws 的那行 ──
DO $$
DECLARE
  v_fn    TEXT;
  v_def   TEXT;
  v_new   TEXT;
  -- play_gacha / play_slot_locked 是 + 1，play_ichiban_auto 是 + p_count
  v_pat   TEXT := 'UPDATE\s+public\.users\s+SET\s+total_draws\s*=\s*'
                  || 'COALESCE\(total_draws,\s*0\)\s*\+\s*(1|p_count)\s+WHERE\s+id\s*=\s*v_user_id;';
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['play_gacha', 'play_ichiban_auto', 'play_slot_locked'] LOOP
    SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = v_fn;

    IF v_def IS NULL THEN
      RAISE EXCEPTION '找不到函數 %', v_fn;
    END IF;

    -- 換成 NULL;（PL/pgSQL 的空指令）而不是直接刪掉：
    -- 有些是 IF/ELSE 分支裡的敘述，整行拿掉可能讓區塊變空而語法錯誤
    v_new := regexp_replace(
      v_def, v_pat,
      'NULL; -- total_draws 改由 track_mission_event 單一維護（migration 465）',
      'gi'
    );

    IF v_new = v_def THEN
      -- 沒改到就要炸。靜默跳過的話這支 migration 印了成功卻什麼都沒做，
      -- 而 total_draws 繼續灌水 —— 這種錯最難查
      RAISE EXCEPTION '% 裡找不到 total_draws 累加敘述，未修改', v_fn;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE '已拔除 % 的 total_draws 累加', v_fn;
  END LOOP;
END $$;

-- ── 2. 退幣不算一抽：單日抽數（勳章「火力全開」） ──
DO $$
DECLARE v_def TEXT; v_new TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'check_achievements';
  IF v_def IS NULL THEN RAISE EXCEPTION '找不到 check_achievements'; END IF;

  IF v_def ILIKE '%coin_return%' THEN
    RAISE NOTICE 'check_achievements 已含退幣過濾，略過';
  ELSE
    v_new := replace(
      v_def,
      'AND created_at >= date_trunc(''day'', NOW());',
      'AND created_at >= date_trunc(''day'', NOW())' || E'\n'
        || '    AND COALESCE(prize_level, '''') <> ''coin_return'';'
    );
    IF v_new = v_def THEN RAISE EXCEPTION 'check_achievements 找不到錨點，未修改'; END IF;
    EXECUTE v_new;
    RAISE NOTICE '已為 check_achievements 加上退幣過濾';
  END IF;
END $$;

-- ── 3. 退幣不算一抽：single_day_draws 任務 ──
DO $$
DECLARE v_def TEXT; v_new TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'track_mission_event';
  IF v_def IS NULL THEN RAISE EXCEPTION '找不到 track_mission_event'; END IF;

  IF v_def ILIKE '%coin_return%' THEN
    RAISE NOTICE 'track_mission_event 已含退幣過濾，略過';
  ELSE
    v_new := replace(
      v_def,
      'AND created_at >= date_trunc(''day'', NOW() AT TIME ZONE ''Asia/Taipei'') AT TIME ZONE ''Asia/Taipei'';',
      'AND created_at >= date_trunc(''day'', NOW() AT TIME ZONE ''Asia/Taipei'') AT TIME ZONE ''Asia/Taipei''' || E'\n'
        || '      AND COALESCE(prize_level, '''') <> ''coin_return'';'
    );
    IF v_new = v_def THEN RAISE EXCEPTION 'track_mission_event 找不到錨點，未修改'; END IF;
    EXECUTE v_new;
    RAISE NOTICE '已為 track_mission_event 加上退幣過濾';
  END IF;
END $$;

-- ── 4. 退幣不算一抽：排行榜抽獎榜 ──
-- 這支函數兩環境版本不同（PROD 有補機器人日分數那段、STG 沒有），
-- 所以是讀各自的定義就地插條件，不是覆蓋成同一份
DO $$
DECLARE v_def TEXT; v_new TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'get_leaderboard_draws';
  IF v_def IS NULL THEN RAISE EXCEPTION '找不到 get_leaderboard_draws'; END IF;

  IF v_def ILIKE '%coin_return%' THEN
    RAISE NOTICE 'get_leaderboard_draws 已含退幣過濾，略過';
  ELSE
    v_new := replace(
      v_def,
      'WHERE dr.created_at >= v_start',
      'WHERE dr.created_at >= v_start' || E'\n'
        || '      AND COALESCE(dr.prize_level, '''') <> ''coin_return'''
    );
    IF v_new = v_def THEN RAISE EXCEPTION 'get_leaderboard_draws 找不到錨點，未修改'; END IF;
    EXECUTE v_new;
    RAISE NOTICE '已為 get_leaderboard_draws 加上退幣過濾';
  END IF;
END $$;

-- ── 5. 回填被灌水的 total_draws ──
-- 只動真實玩家。機器人的 total_draws 是排行榜/稱號/膜拜加權用的展示值，
-- 它們沒有 draw_records（seed_bot_draws.ts 已於 2026-08-05 移除），
-- 一起回填會把 200 隻全部歸零，排行榜直接空掉
UPDATE users u
SET total_draws = COALESCE(d.n, 0)
FROM (SELECT id FROM users WHERE is_bot IS NULL OR is_bot = false) t
LEFT JOIN (
  SELECT user_id, count(*) n FROM draw_records
  WHERE COALESCE(prize_level, '') <> 'coin_return'
  GROUP BY user_id
) d ON d.user_id = t.id
WHERE u.id = t.id
  AND COALESCE(u.total_draws, 0) <> COALESCE(d.n, 0);

SELECT '回填後的真實玩家抽數' AS 項目, u.name, u.total_draws,
       (SELECT count(*) FROM draw_records d
         WHERE d.user_id = u.id AND COALESCE(d.prize_level,'') <> 'coin_return') AS 實際
FROM users u WHERE (u.is_bot IS NULL OR u.is_bot = false) AND COALESCE(u.total_draws,0) > 0
ORDER BY u.total_draws DESC LIMIT 5;
