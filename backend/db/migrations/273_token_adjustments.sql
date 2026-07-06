-- token_adjustments 表 + 更新 token_ledger view 加入 manual 類型
-- 已在生產環境套用，此檔用於版控追蹤（使用 IF NOT EXISTS 保持冪等）

CREATE TABLE IF NOT EXISTS public.token_adjustments (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id),
  delta      bigint NOT NULL,
  reason     text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.token_ledger AS

SELECT
  'recharge'::text                              AS type,
  rr.user_id,
  CASE WHEN rr.status = 'success'
    THEN (rr.amount + COALESCE(rr.bonus, 0))::bigint
    ELSE 0::bigint
  END                                           AS delta,
  CONCAT('儲值 ', rr.order_number)              AS description,
  rr.status,
  (rr.amount)::bigint                           AS recharge_amount,
  (COALESCE(rr.bonus, 0)::numeric)::bigint      AS recharge_bonus,
  rr.id                                         AS ref_id,
  rr.created_at
FROM recharge_records rr

UNION ALL

SELECT
  'draw'::text                                  AS type,
  dr.user_id,
  -(dr.points_used)::bigint                     AS delta,
  CONCAT('抽獎：', COALESCE(dr.prize_name, '')) AS description,
  dr.status,
  NULL::bigint                                  AS recharge_amount,
  NULL::bigint                                  AS recharge_bonus,
  dr.id                                         AS ref_id,
  dr.created_at
FROM draw_records dr
WHERE dr.points_used > 0

UNION ALL

SELECT
  'dismantle'::text                                AS type,
  dr.user_id,
  (dr.points_used)::bigint                         AS delta,
  CONCAT('拆解退還：', COALESCE(dr.prize_name, '')) AS description,
  dr.status,
  NULL::bigint                                     AS recharge_amount,
  NULL::bigint                                     AS recharge_bonus,
  dr.id                                            AS ref_id,
  dr.created_at
FROM draw_records dr
WHERE dr.status = 'dismantled' AND dr.points_used > 0

UNION ALL

SELECT
  'manual'::text                                                             AS type,
  ta.user_id,
  ta.delta,
  CONCAT('手動調整：', ta.reason, '（', ta.created_by, '）') AS description,
  'processed'::character varying(50)                                         AS status,
  NULL::bigint                                                               AS recharge_amount,
  NULL::bigint                                                               AS recharge_bonus,
  ta.id                                                                      AS ref_id,
  ta.created_at
FROM token_adjustments ta;
