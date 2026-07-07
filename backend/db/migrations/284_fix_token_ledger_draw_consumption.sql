-- token_ledger VIEW 修正：G幣抽獎消耗從未被記錄
--
-- 根因：play_gacha 僅在 p_use_points=true（積分支付）時設定 points_used；
-- G幣支付時 points_used = 0，導致 token_ledger 的 draw 條目
-- WHERE points_used > 0 過濾後完全沒有 G幣消耗記錄。
-- 修正：G幣 draw (points_used=0) 改用 products.price 補回實際消耗。

DROP VIEW IF EXISTS token_ledger;
CREATE VIEW token_ledger AS

-- 儲值入帳
SELECT
  CASE
    WHEN rr.payment_method = 'test'                                     THEN 'test'
    WHEN rr.payment_method IN ('promotion','compensation')              THEN 'marketing'
    ELSE 'recharge'
  END::text AS type,
  rr.user_id,
  CASE WHEN rr.status = 'success'
    THEN (rr.amount + COALESCE(rr.bonus,0))::bigint
    ELSE 0::bigint
  END AS delta,
  CASE
    WHEN rr.payment_method = 'test'                                     THEN concat('測試 ', rr.order_number)
    WHEN rr.payment_method IN ('promotion','compensation')              THEN concat('行銷贈點 ', rr.order_number)
    ELSE concat('儲值 ', rr.order_number)
  END AS description,
  rr.status,
  rr.amount::bigint          AS recharge_amount,
  COALESCE(rr.bonus,0)::bigint AS recharge_bonus,
  rr.id AS ref_id,
  rr.created_at
FROM recharge_records rr

UNION ALL

-- G幣抽獎消耗（points_used=0，用 product.price 補回）
SELECT
  'draw'::text,
  dr.user_id,
  -(COALESCE(p.price,0))::bigint AS delta,
  concat('抽獎：', COALESCE(dr.prize_name,''::varchar)) AS description,
  dr.status,
  NULL::bigint, NULL::bigint,
  dr.id, dr.created_at
FROM draw_records dr
LEFT JOIN products p ON dr.product_id = p.id
WHERE dr.points_used = 0
  AND dr.status != 'dismantled'

UNION ALL

-- 積分抽獎消耗（points_used>0，保持原邏輯）
SELECT
  'draw'::text,
  dr.user_id,
  -(dr.points_used)::bigint AS delta,
  concat('抽獎：', COALESCE(dr.prize_name,''::varchar)) AS description,
  dr.status,
  NULL::bigint, NULL::bigint,
  dr.id, dr.created_at
FROM draw_records dr
WHERE dr.points_used > 0

UNION ALL

-- G幣拆解退還（points_used=0，退還 product.price）
SELECT
  'dismantle'::text,
  dr.user_id,
  COALESCE(p.price,0)::bigint AS delta,
  concat('拆解退還：', COALESCE(dr.prize_name,''::varchar)) AS description,
  dr.status,
  NULL::bigint, NULL::bigint,
  dr.id, dr.created_at
FROM draw_records dr
LEFT JOIN products p ON dr.product_id = p.id
WHERE dr.status = 'dismantled'
  AND dr.points_used = 0

UNION ALL

-- 積分拆解退還（points_used>0）
SELECT
  'dismantle'::text,
  dr.user_id,
  dr.points_used::bigint AS delta,
  concat('拆解退還：', COALESCE(dr.prize_name,''::varchar)) AS description,
  dr.status,
  NULL::bigint, NULL::bigint,
  dr.id, dr.created_at
FROM draw_records dr
WHERE dr.status = 'dismantled'
  AND dr.points_used > 0

UNION ALL

-- 手動調整
SELECT
  'manual'::text,
  ta.user_id,
  ta.delta,
  concat('手動調整：', ta.reason, '（', ta.created_by, '）') AS description,
  'processed'::varchar AS status,
  NULL::bigint, NULL::bigint,
  ta.id, ta.created_at
FROM token_adjustments ta;
