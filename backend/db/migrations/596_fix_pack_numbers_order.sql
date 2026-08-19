-- 596_fix_pack_numbers_order.sql
-- 修正卡包模式回傳的 pack_numbers 順序
--
-- play_ichiban_auto 挑包時用 ORDER BY random()，但展開成籤位時是 ORDER BY n
-- （籤號全域排序）。因為每包的籤號是連續區間，卡片實際上是照「包號由小到大」
-- 一塊一塊回傳的，而 pack_numbers 卻維持隨機順序 —— 兩者對不起來。
--
-- 例：抽到包號 [37, 5, 12]
--   卡片順序   → 第 5 包(籤 41-50) → 第 12 包(籤 111-120) → 第 37 包(籤 361-370)
--   pack_numbers → [37, 5, 12]   ← 對不上
--
-- 前台目前沒有讀 pack_numbers，所以還沒造成實際問題；但那個欄位的用途是
-- 「玩家拿包號去對封存表驗證」，順序錯了驗證就會失敗。趁還沒有人用先修掉。

CREATE OR REPLACE FUNCTION public.play_ichiban_auto(p_product_id bigint, p_count integer, p_use_points boolean DEFAULT false, p_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id      UUID;
  v_type         TEXT;
  v_total_count  INTEGER;
  v_seal_len     INTEGER;
  v_per_pack     INTEGER;
  v_slot_total   INTEGER;
  v_pack_total   INTEGER;
  v_packs        INTEGER[];
  v_tickets      INTEGER[];
  v_prizes       JSONB;
  v_balance      INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_count IS NULL OR p_count < 1 THEN RAISE EXCEPTION 'Invalid draw count'; END IF;

  -- cards_per_pack：整包模式一抽開幾張（migration 584）。NULL/1 = 單張模式
  SELECT p.type, p.total_count, GREATEST(1, COALESCE(p.cards_per_pack, 1))
  INTO v_type, v_total_count, v_per_pack
  FROM public.products p WHERE p.id = p_product_id;

  IF v_type IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF v_type NOT IN ('card', 'custom') THEN
    RAISE EXCEPTION 'Wrong product type for this draw';
  END IF;

  SELECT array_length(s.assignment, 1) INTO v_seal_len
  FROM public.product_ticket_seals s WHERE s.product_id = p_product_id;
  -- 可配的籤位上限：有封存表就以封存長度為準（超出範圍的籤 play_ichiban 會擋）
  v_slot_total := LEAST(COALESCE(v_seal_len, v_total_count, 0), COALESCE(v_total_count, 0));

  IF v_per_pack = 1 THEN
    ------------------------------------------------------------------
    -- 單張模式：維持原本的隨機配籤
    ------------------------------------------------------------------
    IF p_count > 1000 THEN RAISE EXCEPTION 'Draw count too large'; END IF;

    SELECT array_agg(n) INTO v_tickets FROM (
      SELECT n FROM generate_series(1, v_slot_total) n
      WHERE NOT EXISTS (
        SELECT 1 FROM public.draw_records
        WHERE product_id = p_product_id AND ticket_number = n
      )
      ORDER BY random()
      LIMIT p_count
    ) s;

    IF v_tickets IS NULL OR array_length(v_tickets, 1) < p_count THEN
      RAISE EXCEPTION 'Not enough stock remaining';
    END IF;

    v_prizes := public.play_ichiban(p_product_id, v_tickets, p_use_points, p_coupon_id, p_count);
    v_packs := NULL;
  ELSE
    ------------------------------------------------------------------
    -- 整包模式：玩家買的是「一包」，不是散裝籤位。
    --
    -- 所以包不能在抽的當下臨時抓十個空籤位湊出來 —— 那是「十張散卡綁一起」，
    -- 不是卡包。包在開賣前就固定好了：第 k 包 = 籤位 (k-1)*每包+1 … k*每包，
    -- 而每個籤位開出什麼早就寫在封存表裡。所以「第 37 包裝了哪十張」在開賣前
    -- 就決定且可驗證，玩家事後拿包號去對封存表就知道我們沒有動手腳。
    ------------------------------------------------------------------
    IF p_count * v_per_pack > 1000 THEN RAISE EXCEPTION 'Draw count too large'; END IF;

    v_pack_total := v_slot_total / v_per_pack;   -- 整數除法：不足一包的尾數籤不成包
    IF v_pack_total < 1 THEN
      RAISE EXCEPTION 'Product has no complete pack (slots %, per pack %)', v_slot_total, v_per_pack;
    END IF;

    -- 挑「整包都還沒被動過」的包。只要包裡有任何一張被抽走，整包就不算完整，
    -- 不能再賣 —— 否則玩家付整包的錢卻拿到別人挑剩的
    -- ORDER BY pack_no：包本身仍是隨機挑（內層的 ORDER BY random()），
    -- 但**輸出的陣列要照包號排序**，才會跟下面 v_tickets 的順序一致。
    -- v_tickets 是 ORDER BY n（籤號全域排序），每包的籤號是連續區間，
    -- 所以卡片是照「包號由小到大」一塊一塊回傳的。
    -- 先前這裡沒排序，回傳的 pack_numbers 是隨機順序 —— 拿 pack_numbers[i]
    -- 去對第 i 包的卡會對錯人。前台目前沒讀這個欄位所以還沒出事，
    -- 但它的用途就是「玩家驗證第幾包」，錯了等於驗證機制本身不可信。
    SELECT array_agg(pack_no ORDER BY pack_no) INTO v_packs FROM (
      SELECT g AS pack_no
      FROM generate_series(1, v_pack_total) g
      WHERE NOT EXISTS (
        SELECT 1 FROM public.draw_records d
        WHERE d.product_id = p_product_id
          AND d.ticket_number BETWEEN (g - 1) * v_per_pack + 1 AND g * v_per_pack
      )
      ORDER BY random()
      LIMIT p_count
    ) s;

    IF v_packs IS NULL OR array_length(v_packs, 1) < p_count THEN
      RAISE EXCEPTION 'Not enough stock remaining';
    END IF;

    -- 把包號展開成籤位
    SELECT array_agg(n ORDER BY n) INTO v_tickets
    FROM unnest(v_packs) k, generate_series((k - 1) * v_per_pack + 1, k * v_per_pack) n;

    -- 只收 p_count 包的錢，但發整包的籤
    v_prizes := public.play_ichiban(p_product_id, v_tickets, p_use_points, p_coupon_id, p_count);
  END IF;

  NULL; -- total_draws 改由 track_mission_event 單一維護（migration 465）

  SELECT CASE WHEN p_use_points THEN points ELSE tokens END
  INTO v_balance FROM public.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'prizes', v_prizes,
    'new_balance', v_balance,
    'cards_per_pack', v_per_pack,
    'pack_numbers', to_jsonb(v_packs)   -- 玩家驗證用：第幾包
  );
END;
$function$;
