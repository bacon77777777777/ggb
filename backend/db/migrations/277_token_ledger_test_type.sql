-- 更新 token_ledger view：payment_method='test' 獨立為 type='test'（而非 'marketing'）
-- 讓測試記錄在帳本顯示「測試」標籤，與「行銷贈點」區分

CREATE OR REPLACE VIEW public.token_ledger AS

SELECT
  CASE
    WHEN rr.payment_method = 'test'                         THEN 'test'::text
    WHEN rr.payment_method IN ('promotion', 'compensation') THEN 'marketing'::text
    ELSE 'recharge'::text
  END AS type,
  rr.user_id,
  CASE WHEN rr.status = 'success'
    THEN (rr.amount + COALESCE(rr.bonus, 0))::bigint
    ELSE 0::bigint
  END AS delta,
  CASE
    WHEN rr.payment_method = 'test'                         THEN CONCAT('測試 ', rr.order_number)
    WHEN rr.payment_method IN ('promotion', 'compensation') THEN CONCAT('行銷贈點 ', rr.order_number)
    ELSE CONCAT('儲值 ', rr.order_number)
  END AS description,
  rr.status,
  (rr.amount)::bigint                        AS recharge_amount,
  (COALESCE(rr.bonus, 0)::numeric)::bigint   AS recharge_bonus,
  rr.id                                      AS ref_id,
  rr.created_at
FROM recharge_records rr

UNION ALL

SELECT
  'draw'::text AS type,
  dr.user_id,
  -(dr.points_used)::bigint AS delta,
  CONCAT('抽獎：', COALESCE(dr.prize_name, '')) AS description,
  dr.status,
  NULL::bigint AS recharge_amount,
  NULL::bigint AS recharge_bonus,
  dr.id AS ref_id,
  dr.created_at
FROM draw_records dr
WHERE dr.points_used > 0

UNION ALL

SELECT
  'dismantle'::text AS type,
  dr.user_id,
  (dr.points_used)::bigint AS delta,
  CONCAT('拆解退還：', COALESCE(dr.prize_name, '')) AS description,
  dr.status,
  NULL::bigint AS recharge_amount,
  NULL::bigint AS recharge_bonus,
  dr.id AS ref_id,
  dr.created_at
FROM draw_records dr
WHERE dr.status = 'dismantled' AND dr.points_used > 0

UNION ALL

SELECT
  'manual'::text AS type,
  ta.user_id,
  ta.delta,
  CONCAT('手動調整：', ta.reason, '（', ta.created_by, '）') AS description,
  'processed'::character varying(50) AS status,
  NULL::bigint AS recharge_amount,
  NULL::bigint AS recharge_bonus,
  ta.id AS ref_id,
  ta.created_at
FROM token_adjustments ta;
