-- 626: 代幣帳本把「積分折抵的抽獎」記成代幣支出（老闆 2026-08-25 問報表準不準時查到）
--
-- token_ledger 的 draw 有兩個分支，points_used > 0 那支寫的是 `- dr.points_used`。
-- 但積分（users.points）與代幣（users.tokens）是兩種幣 ——
-- 用積分抽的獎實際扣的代幣是 tokens_spent（實測全部為 0），不是 points_used。
--
-- 後果：帳本淨額比實際餘額少。PROD crash0514 用 300 積分抽了 3 次，
-- 帳本各記 −300 代幣，整整多扣 900 —— 那就是全站帳本唯一對不上的那 900 G
-- （全站帳本淨額 3,031,219 vs 實際餘額 3,032,119）。
--
-- 修法：改用 tokens_spent，並在說明裡標明折抵了幾點積分，
-- 讓玩家與會計都看得出那一筆是積分付的。

CREATE OR REPLACE VIEW public.token_ledger AS
 SELECT
        CASE
            WHEN rr.payment_method::text = 'test'::text THEN 'test'::text
            WHEN rr.payment_method::text = ANY (ARRAY['promotion'::character varying::text, 'compensation'::character varying::text]) THEN 'marketing'::text
            ELSE 'recharge'::text
        END AS type,
    rr.user_id,
        CASE
            WHEN rr.status::text = 'success'::text THEN (rr.amount + COALESCE(rr.bonus, 0::numeric))::bigint
            ELSE 0::bigint
        END AS delta,
        CASE
            WHEN rr.payment_method::text = 'test'::text THEN concat('測試 ', rr.order_number)
            WHEN rr.payment_method::text = ANY (ARRAY['promotion'::character varying::text, 'compensation'::character varying::text]) THEN concat('行銷贈點 ', rr.order_number)
            ELSE concat('儲值 ', rr.order_number)
        END AS description,
    rr.status,
    rr.amount::bigint AS recharge_amount,
    COALESCE(rr.bonus, 0::numeric)::bigint AS recharge_bonus,
    rr.id AS ref_id,
    rr.created_at
   FROM recharge_records rr
UNION ALL
 SELECT 'draw'::text AS type,
    dr.user_id,
    - COALESCE(dr.tokens_spent::numeric, p.price, 0::numeric)::bigint AS delta,
    concat('抽獎：', COALESCE(dr.prize_name, ''::character varying)) AS description,
    dr.status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    dr.id AS ref_id,
    dr.created_at
   FROM draw_records dr
     LEFT JOIN products p ON dr.product_id = p.id
  WHERE dr.points_used = 0
UNION ALL
 SELECT 'draw'::text AS type,
    dr.user_id,
    -- 積分折抵的抽獎，代幣異動是 tokens_spent（通常為 0），不是 points_used。
    -- 積分是另一種幣，把它記成代幣支出會讓帳本比實際餘額少。
    - COALESCE(dr.tokens_spent, 0)::bigint AS delta,
    concat('抽獎：', COALESCE(dr.prize_name, ''::character varying),
           '（積分折抵 ', dr.points_used, ' 點）') AS description,
    dr.status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    dr.id AS ref_id,
    dr.created_at
   FROM draw_records dr
  WHERE dr.points_used > 0
UNION ALL
 SELECT 'dismantle'::text AS type,
    dr.user_id,
    COALESCE(dr.refund_amount, 0)::bigint AS delta,
    concat('回收退還：', COALESCE(dr.prize_name, ''::character varying)) AS description,
    dr.status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    dr.id AS ref_id,
    dr.created_at
   FROM draw_records dr
  WHERE dr.status::text = 'dismantled'::text
UNION ALL
 SELECT 'manual'::text AS type,
    ta.user_id,
    ta.delta,
    concat('手動調整：', ta.reason, '（', ta.created_by, '）') AS description,
    'processed'::character varying AS status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    ta.id AS ref_id,
    ta.created_at
   FROM token_adjustments ta;
