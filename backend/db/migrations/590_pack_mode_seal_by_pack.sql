-- 590_pack_mode_seal_by_pack.sql
--
-- 卡包模式的排籤規則（老闆 2026-08-19）：
--   **一包最多一張大賞，而且只會出現在每包的最後一張。**
--   前 n-1 張一律是 B賞以下；第 n 張才可能排進 A賞。
--
-- 為什麼要改：原本 seal_product_tickets 是「全域隨機」，完全不知道包的存在 ——
-- 同一包可能出現兩張 A賞，A賞也可能落在第 3 張。真實卡包不是這樣。
--
-- 一併修掉「大賞」的判定（這是排對的前提）：
--   原本用「單一品項張數 ÷ 總張數 ≤ 5%」自動判大賞。抽卡商品動輒 40 個品項，
--   每個都遠低於 5% —— 等於**全部都被當成大賞**，這條規則在卡包模式完全失效。
--   卡包模式改成看**賞等**（A賞／SSR／超稀有）。
--   其他玩法（一番賞／自製賞／單抽）維持原本的 5% 判定，行為完全不變。
--
-- 殺率在卡包模式改成作用於「包的順序」：前段的包不放大賞，後段才有。
-- 語意跟原本「把大獎往後推」一致，只是單位從籤號換成包。
--
-- 公平性驗證不受影響：封存表照樣公開、逐籤可驗。排列規則從全域隨機變成
-- 按包結構化，反而更好向玩家說明（「每包最後一張才有機會是大賞」）。

BEGIN;

-- 賞等 → 是否為大賞。集中在一個地方，之後要加等級只改這裡
CREATE OR REPLACE FUNCTION public.is_major_prize_level(p_level text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    upper(COALESCE(p_level, '')) LIKE '%SSR%'
    OR COALESCE(p_level, '') LIKE '%A賞%'
    OR COALESCE(p_level, '') LIKE '%超稀有%'
    OR COALESCE(p_level, '') LIKE '%SP賞%',
    false)
$$;

COMMENT ON FUNCTION public.is_major_prize_level(text) IS
  '卡包模式的大賞判定（migration 590）：A賞／SSR／超稀有／SP賞。每包最後一張才放得下';

CREATE OR REPLACE FUNCTION public.seal_product_tickets(p_product_id bigint, p_seed text DEFAULT NULL::text, p_sealed_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_seed TEXT; v_salt TEXT; v_rate NUMERIC; v_total INTEGER; v_drawn INTEGER;
  v_major_ids BIGINT[]; v_minor_ids BIGINT[]; v_floor INTEGER; v_major_n INTEGER;
  v_assignment BIGINT[]; v_text TEXT; v_commitment TEXT; v_placed INTEGER;
  v_per_pack INTEGER; v_packs INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_drawn FROM draw_records WHERE product_id = p_product_id;
  IF v_drawn > 0 THEN
    RAISE EXCEPTION 'ALREADY_SOLD: 已有 % 筆抽獎紀錄，封存後不可重排', v_drawn;
  END IF;
  SELECT COALESCE(profit_rate, 1.0), GREATEST(1, COALESCE(cards_per_pack, 1))
    INTO v_rate, v_per_pack FROM products WHERE id = p_product_id;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  v_seed := COALESCE(p_seed, encode(gen_random_bytes(32), 'hex'));
  v_salt := encode(gen_random_bytes(8), 'hex');
  WITH pool AS (
    SELECT pp.id, pp.total, pp.level AS lvl, SUM(pp.total) OVER () AS all_total FROM product_prizes pp
    WHERE pp.product_id = p_product_id AND pp.level NOT IN ('Last One','LAST ONE','最後賞') AND pp.total > 0
  ), expanded AS (
    SELECT id,
           CASE WHEN v_per_pack >= 2
                THEN public.is_major_prize_level(lvl)      -- 卡包模式：看賞等
                ELSE (total::numeric / all_total) <= 0.05  -- 其餘：沿用數量佔比
           END AS is_major
      FROM pool, generate_series(1, total)
  )
  SELECT array_agg(id) FILTER (WHERE is_major), array_agg(id) FILTER (WHERE NOT is_major)
  INTO v_major_ids, v_minor_ids FROM expanded;
  v_major_n := COALESCE(array_length(v_major_ids,1),0);
  v_total := v_major_n + COALESCE(array_length(v_minor_ids,1),0);
  IF v_total = 0 THEN RAISE EXCEPTION 'NO_PRIZES'; END IF;

  PERFORM setseed(('x' || substr(md5(v_seed),1,8))::bit(32)::int / 2147483648.0);

  IF v_per_pack >= 2 THEN
    ----------------------------------------------------------------------
    -- 卡包模式：一包最多一張大賞，而且只會出現在「每包的最後一張」
    --   第 k 包的籤位是 (k-1)*n+1 … k*n，大賞槽＝ k*n
    --   前 n-1 張一律從一般池（B賞以下）取
    -- 殺率在這裡作用於「包的順序」而不是籤號：前段的包不放大賞。
    ----------------------------------------------------------------------
    IF v_total % v_per_pack <> 0 THEN
      RAISE EXCEPTION 'PACK_MODE_UNEVEN: 總張數 % 不是每包 % 張的整數倍', v_total, v_per_pack;
    END IF;
    v_packs := v_total / v_per_pack;

    v_floor := FLOOR(v_packs * GREATEST(0, 100 - LEAST(v_rate*100, 100)) / 100.0);
    v_floor := GREATEST(0, LEAST(v_floor, v_packs - v_major_n));

    IF v_major_n > (v_packs - v_floor) THEN
      RAISE EXCEPTION 'PACK_MODE_TOO_MANY_MAJOR: 大賞 % 張，但可放的包只有 % 包（總 % 包、殺率保留 % 包）',
        v_major_n, v_packs - v_floor, v_packs, v_floor;
    END IF;

    WITH major_slots AS (
      SELECT k * v_per_pack AS pos, row_number() OVER (ORDER BY random()) AS rn
      FROM generate_series(v_floor + 1, v_packs) AS k
    ), major_placed AS (
      SELECT m.id, s.pos FROM (SELECT id, row_number() OVER (ORDER BY random()) AS rn
        FROM unnest(COALESCE(v_major_ids,'{}')) AS id) m JOIN major_slots s USING (rn)
    ), minor_shuffled AS (
      SELECT id, row_number() OVER (ORDER BY random()) AS rn FROM unnest(COALESCE(v_minor_ids,'{}')) AS id
    ), free_slots AS (
      SELECT pos, row_number() OVER (ORDER BY pos) AS rn FROM generate_series(1, v_total) AS pos
      WHERE pos NOT IN (SELECT pos FROM major_placed)
    ), minor_placed AS (
      SELECT m.id, f.pos FROM minor_shuffled m JOIN free_slots f USING (rn)
    )
    SELECT array_agg(id ORDER BY pos) INTO v_assignment
    FROM (SELECT * FROM major_placed UNION ALL SELECT * FROM minor_placed) x;

  ELSE
    ----------------------------------------------------------------------
    -- 單抽／一番賞／自製賞：維持原本的全域隨機（行為完全不變）
    ----------------------------------------------------------------------
    v_floor := FLOOR(v_total * GREATEST(0, 100 - LEAST(v_rate*100, 100)) / 100.0);
    -- 大獎槽位（v_total - v_floor）至少要放得下所有大獎。殺率的用意是把大獎
    -- 往後推，不是把放不下的丟掉 —— 沒有這一夾，低殺率會靜靜吃掉大獎
    v_floor := GREATEST(0, LEAST(v_floor, v_total - v_major_n));

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
  END IF;

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

GRANT EXECUTE ON FUNCTION public.is_major_prize_level(text) TO anon, authenticated;

COMMIT;
