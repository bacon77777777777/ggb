-- Token Ledger View
-- 代幣帳本：彙整儲值（入）、抽獎（出）、拆解退還（入）三類異動
CREATE OR REPLACE VIEW token_ledger AS

-- 儲值入帳（recharge_records status=success）
SELECT
  'recharge'::text                              AS type,
  user_id,
  (amount + COALESCE(bonus, 0))::bigint         AS delta,
  CONCAT('儲值 ', order_number)                 AS description,
  id                                            AS ref_id,
  created_at
FROM recharge_records
WHERE status = 'success'

UNION ALL

-- 抽獎消費（所有 draw_records，包含後來被拆解的）
SELECT
  'draw'::text                                  AS type,
  user_id,
  -(points_used)::bigint                        AS delta,
  CONCAT('抽獎：', COALESCE(prize_name, ''))     AS description,
  id                                            AS ref_id,
  created_at
FROM draw_records
WHERE points_used > 0

UNION ALL

-- 拆解退還（draw_records status=dismantled → 返還 points_used）
SELECT
  'dismantle'::text                             AS type,
  user_id,
  (points_used)::bigint                         AS delta,
  CONCAT('拆解退還：', COALESCE(prize_name, '')) AS description,
  id                                            AS ref_id,
  created_at
FROM draw_records
WHERE status = 'dismantled' AND points_used > 0;
