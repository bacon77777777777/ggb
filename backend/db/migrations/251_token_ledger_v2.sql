-- token_ledger v2：加入 amount/bonus 欄位，並納入所有儲值狀態
CREATE OR REPLACE VIEW token_ledger AS

-- 儲值（全狀態，success 才有 delta）
SELECT
  'recharge'::text                              AS type,
  user_id,
  CASE WHEN status = 'success'
    THEN (amount + COALESCE(bonus, 0))::bigint
    ELSE 0
  END                                           AS delta,
  CONCAT('儲值 ', order_number)                 AS description,
  status,
  amount::bigint                                AS recharge_amount,
  COALESCE(bonus, 0)::bigint                    AS recharge_bonus,
  id                                            AS ref_id,
  created_at
FROM recharge_records

UNION ALL

-- 抽獎消費
SELECT
  'draw'::text                                  AS type,
  user_id,
  -(points_used)::bigint                        AS delta,
  CONCAT('抽獎：', COALESCE(prize_name, ''))     AS description,
  status,
  NULL::bigint                                  AS recharge_amount,
  NULL::bigint                                  AS recharge_bonus,
  id                                            AS ref_id,
  created_at
FROM draw_records
WHERE points_used > 0

UNION ALL

-- 拆解退還
SELECT
  'dismantle'::text                             AS type,
  user_id,
  (points_used)::bigint                         AS delta,
  CONCAT('拆解退還：', COALESCE(prize_name, '')) AS description,
  status,
  NULL::bigint                                  AS recharge_amount,
  NULL::bigint                                  AS recharge_bonus,
  id                                            AS ref_id,
  created_at
FROM draw_records
WHERE status = 'dismantled' AND points_used > 0;
