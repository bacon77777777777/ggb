-- 653_lottery_rpcs.sql
--
-- 抽籤販售的四支 RPC：登記、開獎、公開名單、逾期遞補。
--
-- ## 開獎為什麼可以自己驗
--
-- 登記截止前先產生 seed，只公布 `commitment = sha256(seed)`；開獎時把每一筆登記的
-- `entry_no` 跟 seed 串起來取 sha256 當排序鍵，由小到大排，前面的中籤。開獎後公開
-- seed 與完整名單 —— 任何人拿 seed 重算一次就知道有沒有被動手腳，而 commitment
-- 早在截止前就公布了，事後改 seed 對不上。
--
-- 用 `sha256(seed || ':' || entry_no)` 而不是 `random()`：後者在開獎那一刻才決定，
-- 沒有任何人能驗證。整站在講 commit-reveal，這裡用 random() 等於自己打臉。
--
-- ⚠️ `digest`／`gen_random_bytes` 一律寫成 `extensions.xxx`：pgcrypto 裝在
-- `extensions` schema，而這幾支是 SECURITY DEFINER + `SET search_path = public`，
-- 不限定會在執行期找不到函數（而且是上線後第一次開獎才炸）。

BEGIN;

/* ── 目前階段：一律由時間推導，不存狀態欄位 ───────────────────────── */
CREATE OR REPLACE FUNCTION public.lottery_phase(e lottery_events)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN e.status = 'cancelled'          THEN 'cancelled'
    WHEN e.status <> 'published'         THEN 'draft'
    WHEN e.drawn_at IS NOT NULL          THEN 'drawn'
    WHEN now() < e.register_start_at     THEN 'upcoming'
    WHEN now() < e.register_end_at       THEN 'registering'
    ELSE 'pending_draw'
  END;
$$;


/* ── ① 登記 ─────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.enter_lottery(p_event_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_ev    lottery_events;
  v_used  integer;
  v_no    integer;
  v_bal   integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  -- 鎖住檔期：序號配發與名額檢查不能有人插隊
  SELECT * INTO v_ev FROM lottery_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這個抽籤活動');
  END IF;

  IF public.lottery_phase(v_ev) <> 'registering' THEN
    RETURN jsonb_build_object('success', false, 'message', '目前不在登記期間');
  END IF;

  SELECT count(*) INTO v_used
  FROM lottery_entries WHERE event_id = p_event_id AND user_id = v_uid
    AND status <> 'refunded';
  IF v_used >= v_ev.per_user_entries THEN
    RETURN jsonb_build_object('success', false, 'message',
      '每人最多登記 ' || v_ev.per_user_entries || ' 次');
  END IF;

  /*
   * 扣積分。餘額不足時 spend_points 會丟例外，這裡接住轉成友善訊息 ——
   * 前台要能顯示「還差多少積分」而不是一個資料庫錯誤。
   *
   * 冪等鍵帶「這是第幾次登記」：玩家連點兩下，第二次會拿到同一把鍵、
   * 不會重複扣，但下面的 INSERT 仍會因為序號不同而多插一筆 ——
   * 所以真正擋重複的是上面的 per_user_entries 檢查（同一個交易內序列化）。
   */
  BEGIN
    v_bal := public.spend_points(
      v_uid, v_ev.entry_points, 'lottery_entry',
      '抽籤登記：' || COALESCE(v_ev.title, '#' || v_ev.id),
      'lottery_events', v_ev.id::text,
      'lottery:' || v_ev.id::text || ':' || v_uid::text || ':' || (v_used + 1)::text);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', '積分不足',
      'need', v_ev.entry_points);
  END;

  SELECT COALESCE(MAX(entry_no), 0) + 1 INTO v_no
  FROM lottery_entries WHERE event_id = p_event_id;

  INSERT INTO lottery_entries (event_id, user_id, entry_no, points_spent)
  VALUES (p_event_id, v_uid, v_no, v_ev.entry_points);

  RETURN jsonb_build_object(
    'success', true, 'entry_no', v_no, 'points_left', v_bal,
    'entries_used', v_used + 1, 'per_user_entries', v_ev.per_user_entries);
END;
$$;


/* ── ② 開獎（由 cron 或後台觸發）──────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.draw_lottery(p_event_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ev      lottery_events;
  v_seed    text;
  v_total   integer;
  v_backup  integer;
BEGIN
  SELECT * INTO v_ev FROM lottery_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到檔期 %', p_event_id; END IF;
  IF v_ev.drawn_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '這一檔已經開過獎了');
  END IF;
  IF v_ev.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'message', '檔期未發布');
  END IF;
  IF now() < v_ev.register_end_at THEN
    RETURN jsonb_build_object('success', false, 'message', '登記還沒截止');
  END IF;

  /*
   * seed 正常情況下在登記開始時就產好了（見 ensure_lottery_commitment），
   * 這裡只是保險：真的沒有就現產一把。現產的 commitment 等於沒有事前承諾，
   * 所以會在回傳裡標記出來，後台要看得到。
   */
  v_seed := v_ev.seed;
  IF v_seed IS NULL THEN
    v_seed := encode(extensions.gen_random_bytes(32), 'hex');
  END IF;

  SELECT count(*) INTO v_total FROM lottery_entries
  WHERE event_id = p_event_id AND status = 'entered';

  /*
   * 確定性洗牌：sha256(seed || ':' || entry_no) 由小到大。
   * 同一個 seed 與同一批 entry_no 一定得到同一個順序 —— 這就是可驗證的來源。
   */
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             ORDER BY encode(extensions.digest(v_seed || ':' || entry_no::text, 'sha256'), 'hex'), entry_no
           ) AS rk
    FROM lottery_entries
    WHERE event_id = p_event_id AND status = 'entered'
  )
  UPDATE lottery_entries le
  SET rank = r.rk,
      status = CASE
        WHEN r.rk <= v_ev.winners_count THEN 'won'
        WHEN r.rk <= v_ev.winners_count + v_ev.backup_count THEN 'backup'
        ELSE 'lost' END,
      pay_deadline = CASE
        WHEN r.rk <= v_ev.winners_count
          THEN now() + (v_ev.pay_deadline_hours || ' hours')::interval
        ELSE NULL END
  FROM ranked r
  WHERE le.id = r.id;


  UPDATE lottery_events
  SET seed = v_seed,
      commitment = COALESCE(commitment, encode(extensions.digest(v_seed, 'sha256'), 'hex')),
      drawn_at = now(),
      updated_at = now()
  WHERE id = p_event_id;

  SELECT count(*) INTO v_backup FROM lottery_entries
  WHERE event_id = p_event_id AND status = 'backup';

  RETURN jsonb_build_object(
    'success', true,
    'entries', v_total,
    'winners', LEAST(v_total, v_ev.winners_count),
    'backups', v_backup,
    'late_seed', v_ev.seed IS NULL);
END;
$$;


/* ── ③ 登記一開始就把承諾值定下來 ─────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.ensure_lottery_commitment(p_event_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seed text;
  v_com  text;
BEGIN
  SELECT seed, commitment INTO v_seed, v_com FROM lottery_events WHERE id = p_event_id FOR UPDATE;
  IF v_com IS NOT NULL THEN RETURN v_com; END IF;
  v_seed := COALESCE(v_seed, encode(extensions.gen_random_bytes(32), 'hex'));
  v_com  := encode(extensions.digest(v_seed, 'sha256'), 'hex');
  UPDATE lottery_events SET seed = v_seed, commitment = v_com, updated_at = now()
  WHERE id = p_event_id;
  RETURN v_com;
END;
$$;


/* ── ④ 公開名單（開獎後才回，且不吐 user_id）───────────────────────── */
CREATE OR REPLACE FUNCTION public.get_lottery_winners(p_event_id bigint)
RETURNS TABLE (rank integer, entry_no integer, nickname text, avatar_url text, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_drawn timestamptz;
BEGIN
  SELECT drawn_at INTO v_drawn FROM lottery_events WHERE id = p_event_id;
  IF v_drawn IS NULL THEN RETURN; END IF;   -- 還沒開獎就什麼都不回

  RETURN QUERY
  SELECT le.rank, le.entry_no,
         -- 暱稱遮罩：公開名單不該把全名攤出來，但要讓本人認得出自己
         CASE WHEN length(COALESCE(u.name, '')) <= 1 THEN COALESCE(u.name, '玩家')
              ELSE left(u.name, 1) || repeat('*', GREATEST(length(u.name) - 2, 1)) || right(u.name, 1)
         END AS nickname,
         u.avatar_url,
         le.status
  FROM lottery_entries le
  JOIN users u ON u.id = le.user_id
  WHERE le.event_id = p_event_id AND le.status IN ('won','backup','paid','expired')
  ORDER BY le.rank;
END;
$$;


/* ── ⑤ 逾期未付 → 遞補（cron 每小時掃）──────────────────────────── */
CREATE OR REPLACE FUNCTION public.expire_lottery_winners()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired integer := 0;
  v_promoted integer := 0;
  v_row RECORD;
BEGIN
  -- 逾期的正取讓位
  UPDATE lottery_entries
  SET status = 'expired'
  WHERE status = 'won' AND pay_deadline IS NOT NULL AND pay_deadline < now();
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  /*
   * 每讓出一個名額，就把該檔期名次最前面的備取遞補上來。
   * 一檔一檔算：不同檔期的名額不能互相流用。
   */
  FOR v_row IN
    SELECT e.id AS event_id, e.pay_deadline_hours,
           e.winners_count - count(*) FILTER (WHERE le.status IN ('won','paid')) AS vacancy
    FROM lottery_events e
    JOIN lottery_entries le ON le.event_id = e.id
    WHERE e.drawn_at IS NOT NULL
    GROUP BY e.id, e.winners_count, e.pay_deadline_hours
    HAVING e.winners_count - count(*) FILTER (WHERE le.status IN ('won','paid')) > 0
  LOOP
    WITH next_up AS (
      SELECT id FROM lottery_entries
      WHERE event_id = v_row.event_id AND status = 'backup'
      ORDER BY rank
      LIMIT v_row.vacancy
    )
    UPDATE lottery_entries le
    SET status = 'won',
        pay_deadline = now() + (v_row.pay_deadline_hours || ' hours')::interval
    FROM next_up n WHERE le.id = n.id;
    v_promoted := v_promoted + v_row.vacancy;
  END LOOP;

  RETURN jsonb_build_object('expired', v_expired, 'promoted', v_promoted);
END;
$$;


-- 權限：登記由玩家呼叫；開獎與遞補只有後台／cron
REVOKE ALL ON FUNCTION public.draw_lottery(bigint)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_lottery_winners()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_lottery_commitment(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.draw_lottery(bigint)             TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_lottery_winners()         TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_lottery_commitment(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enter_lottery(bigint)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_lottery_winners(bigint)      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lottery_phase(lottery_events)    TO anon, authenticated, service_role;

COMMIT;
