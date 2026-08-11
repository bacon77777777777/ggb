-- 522: 🔴 殺率調低時封存會靜靜吃掉大獎，籤號還會超出封存範圍
--
-- PROD 事故：《新世紀福音戰士》30th Anniversary（id 653）玩家選到籤號 56 就報
--   INVALID_TICKET: 籤號 56 不在封存範圍 1~55 內
-- 商品總數 60、封存卻只有 55 張，而且 B賞1、C賞2、D賞2 共 5 張整個消失。
--
-- ── 怎麼發生的
--
-- seal_product_tickets 先把品項分成「大獎」（占比 ≤ 5%）與「小獎」，再依殺率
-- 算出一條底線 v_floor，大獎只能放在 v_floor 之後的槽位：
--
--   v_floor := FLOOR(v_total * (100 - 殺率*100) / 100)
--
-- 殺率 0.01 時 v_floor = FLOOR(60 * 99/100) = 59，大獎槽位只剩
-- generate_series(60, 60) —— **一格**。但這檔的大獎有 6 張
-- （A1+B1+C2+D2），JOIN ... USING (rn) 對不到的那 5 張就被安靜丟掉。
--
-- 更糟的是最後 `UPDATE products SET total_count = v_total`（60）寫的是
-- 「應該有幾張」而不是「真的排了幾張」（55），於是商品開賣 60 張、封存表只有
-- 55 張，56~60 號永遠抽不了。
--
-- ── 修法
--
-- 1. v_floor 夾一層上限：槽位數（v_total - v_floor）至少要等於大獎張數。
--    殺率再低也不會擠不下 —— 殺率的用意是「把大獎往後推」，不是把大獎丟掉。
-- 2. 排完後驗證張數，對不上就 RAISE。這種錯誤要當場炸掉，不能靜靜寫進資料庫
--    再讓玩家在結帳時撞到。
-- 3. total_count 改用實際排出的張數，多一層保險。

CREATE OR REPLACE FUNCTION public.seal_product_tickets(p_product_id bigint, p_seed text DEFAULT NULL::text, p_sealed_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_seed TEXT; v_salt TEXT; v_rate NUMERIC; v_total INTEGER; v_drawn INTEGER;
  v_major_ids BIGINT[]; v_minor_ids BIGINT[]; v_floor INTEGER; v_major_n INTEGER;
  v_assignment BIGINT[]; v_text TEXT; v_commitment TEXT; v_placed INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_drawn FROM draw_records WHERE product_id = p_product_id;
  IF v_drawn > 0 THEN
    RAISE EXCEPTION 'ALREADY_SOLD: 已有 % 筆抽獎紀錄，封存後不可重排', v_drawn;
  END IF;
  SELECT COALESCE(profit_rate, 1.0) INTO v_rate FROM products WHERE id = p_product_id;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  v_seed := COALESCE(p_seed, encode(gen_random_bytes(32), 'hex'));
  v_salt := encode(gen_random_bytes(8), 'hex');
  WITH pool AS (
    SELECT pp.id, pp.total, SUM(pp.total) OVER () AS all_total FROM product_prizes pp
    WHERE pp.product_id = p_product_id AND pp.level NOT IN ('Last One','LAST ONE','最後賞') AND pp.total > 0
  ), expanded AS (
    SELECT id, (total::numeric / all_total) <= 0.05 AS is_major FROM pool, generate_series(1, total)
  )
  SELECT array_agg(id) FILTER (WHERE is_major), array_agg(id) FILTER (WHERE NOT is_major)
  INTO v_major_ids, v_minor_ids FROM expanded;
  v_major_n := COALESCE(array_length(v_major_ids,1),0);
  v_total := v_major_n + COALESCE(array_length(v_minor_ids,1),0);
  IF v_total = 0 THEN RAISE EXCEPTION 'NO_PRIZES'; END IF;

  v_floor := FLOOR(v_total * GREATEST(0, 100 - LEAST(v_rate*100, 100)) / 100.0);
  -- 大獎槽位（v_total - v_floor）至少要放得下所有大獎。殺率的用意是把大獎
  -- 往後推，不是把放不下的丟掉 —— 沒有這一夾，低殺率會靜靜吃掉大獎
  v_floor := GREATEST(0, LEAST(v_floor, v_total - v_major_n));

  PERFORM setseed(('x' || substr(md5(v_seed),1,8))::bit(32)::int / 2147483648.0);
  WITH minor_shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS rn FROM unnest(COALESCE(v_minor_ids,'{}')) AS id
  ), major_slots AS (
    SELECT pos, row_number() OVER (ORDER BY random()) AS rn FROM generate_series(v_floor+1, v_total) AS pos
  ), major_placed AS (
    SELECT m.id, s.pos FROM (SELECT id, row_number() OVER (ORDER BY random()) AS rn
      FROM unnest(COALESCE(v_major_ids,'{}')) AS id) m JOIN major_slots s USING (rn)
  ), free_slots AS (
    SELECT pos, row_number() OVER (ORDER BY pos) AS rn FROM generate_series(1, v_total) AS pos
    WHERE pos NOT IN (SELECT pos FROM major_placed)
  ), minor_placed AS (
    SELECT m.id, f.pos FROM minor_shuffled m JOIN free_slots f USING (rn)
  )
  SELECT array_agg(id ORDER BY pos) INTO v_assignment
  FROM (SELECT * FROM major_placed UNION ALL SELECT * FROM minor_placed) x;

  -- 排出來的張數必須等於品項張數總和。對不上代表有籤被丟掉了，當場炸掉；
  -- 靜靜寫進去的話會變成「商品賣 60 張、封存只有 55 張」，玩家結帳才撞到
  v_placed := COALESCE(array_length(v_assignment,1),0);
  IF v_placed <> v_total THEN
    RAISE EXCEPTION 'SEAL_INCOMPLETE: 只排出 % 張、應為 % 張（大獎 % 張、底線 %）',
      v_placed, v_total, v_major_n, v_floor;
  END IF;

  v_text := public.build_seal_text(p_product_id, v_salt, v_assignment);
  v_commitment := encode(digest(convert_to(v_text,'utf8'),'sha256'),'hex');
  INSERT INTO product_ticket_seals (product_id, salt, assignment, commitment, profit_rate, sealed_by)
  VALUES (p_product_id, v_salt, v_assignment, v_commitment, v_rate, p_sealed_by)
  ON CONFLICT (product_id) DO UPDATE SET salt=EXCLUDED.salt, assignment=EXCLUDED.assignment,
    commitment=EXCLUDED.commitment, profit_rate=EXCLUDED.profit_rate, sealed_at=now(), sealed_by=EXCLUDED.sealed_by;
  -- total_count 對齊「實際排出的籤數」（433 的校正，522 改成用 v_placed）
  UPDATE products SET seed=v_seed, txid_hash=v_commitment, sealed_at=now(),
                      total_count=v_placed, remaining=v_placed
   WHERE id = p_product_id;
  RETURN jsonb_build_object('success', true, 'tickets', v_placed, 'commitment', v_commitment,
    'major_count', v_major_n, 'major_floor', v_floor);
END;
$function$;
