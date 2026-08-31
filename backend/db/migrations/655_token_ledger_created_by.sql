-- 655_token_ledger_created_by.sql
--
-- 代幣帳本補上「操作者」欄，跟積分帳本對齊（老闆 2026-08-31：兩邊欄位要一致）。
--
-- 只有 token_adjustments 有 created_by（手動補幣、帳務更正）；儲值、抽獎、回收退
-- 是玩家自己的行為，回 NULL，畫面上顯示「系統」。
--
-- 順手把手動調整的說明裡那段 `（<操作者>）` 拿掉 —— 有了獨立欄位再塞進說明，
-- 同一個資訊會在同一列出現兩次。
--
-- ⚠️ CREATE OR REPLACE VIEW 只能在**最後面**加欄位，不能插在中間、不能改順序也不能改型別。
-- 所以 created_by 放在 created_at 後面。

BEGIN;

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
    rr.created_at,
    NULL::text AS created_by
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
    dr.created_at,
    NULL::text AS created_by
   FROM draw_records dr
     LEFT JOIN products p ON dr.product_id = p.id
  WHERE dr.points_used = 0
UNION ALL
 SELECT 'draw'::text AS type,
    dr.user_id,
    - COALESCE(dr.tokens_spent, 0)::bigint AS delta,
    concat('抽獎：', COALESCE(dr.prize_name, ''::character varying), '（積分折抵 ', dr.points_used, ' 點）') AS description,
    dr.status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    dr.id AS ref_id,
    dr.created_at,
    NULL::text AS created_by
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
    dr.created_at,
    NULL::text AS created_by
   FROM draw_records dr
  WHERE dr.status::text = 'dismantled'::text
UNION ALL
 SELECT 'manual'::text AS type,
    ta.user_id,
    ta.delta,
    concat('手動調整：', ta.reason) AS description,
    'processed'::character varying AS status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    ta.id AS ref_id,
    ta.created_at,
    ta.created_by::text AS created_by
   FROM token_adjustments ta;;

COMMIT;
