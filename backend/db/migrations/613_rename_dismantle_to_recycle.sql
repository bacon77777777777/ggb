-- 613: 全站把「分解／拆解」統一改叫「回收」（老闆 2026-08-24）
--
-- 前後台的字串已在程式碼改完。DB 這邊唯一會被人看到的是 token_ledger 這個 VIEW ——
-- 後台「代幣明細」與會員頁的交易列表直接讀它的 description，裡面寫著「拆解退還：」。
--
-- ⚠️ 只改「給人看的字」。函數名 dismantle_prizes、狀態值 'dismantled'、
-- 欄位 decompose_type／admin_recycle_pool 這些內部代號一律不動 ——
-- 沒有任何玩家或管理員看得到它們，改了只會讓每一個呼叫端跟著壞。

CREATE OR REPLACE VIEW public.token_ledger AS
 SELECT
        CASE
            WHEN ((rr.payment_method)::text = 'test'::text) THEN 'test'::text
            WHEN ((rr.payment_method)::text = ANY (ARRAY[('promotion'::character varying)::text, ('compensation'::character varying)::text])) THEN 'marketing'::text
            ELSE 'recharge'::text
        END AS type,
    rr.user_id,
        CASE
            WHEN ((rr.status)::text = 'success'::text) THEN ((rr.amount + COALESCE(rr.bonus, (0)::numeric)))::bigint
            ELSE (0)::bigint
        END AS delta,
        CASE
            WHEN ((rr.payment_method)::text = 'test'::text) THEN concat('測試 ', rr.order_number)
            WHEN ((rr.payment_method)::text = ANY (ARRAY[('promotion'::character varying)::text, ('compensation'::character varying)::text])) THEN concat('行銷贈點 ', rr.order_number)
            ELSE concat('儲值 ', rr.order_number)
        END AS description,
    rr.status,
    (rr.amount)::bigint AS recharge_amount,
    (COALESCE(rr.bonus, (0)::numeric))::bigint AS recharge_bonus,
    rr.id AS ref_id,
    rr.created_at
   FROM recharge_records rr
UNION ALL
 SELECT 'draw'::text AS type,
    dr.user_id,
    (- (COALESCE((dr.tokens_spent)::numeric, p.price, (0)::numeric))::bigint) AS delta,
    concat('抽獎：', COALESCE(dr.prize_name, ''::character varying)) AS description,
    dr.status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    dr.id AS ref_id,
    dr.created_at
   FROM (draw_records dr
     LEFT JOIN products p ON ((dr.product_id = p.id)))
  WHERE (dr.points_used = 0)
UNION ALL
 SELECT 'draw'::text AS type,
    dr.user_id,
    (- (dr.points_used)::bigint) AS delta,
    concat('抽獎：', COALESCE(dr.prize_name, ''::character varying)) AS description,
    dr.status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    dr.id AS ref_id,
    dr.created_at
   FROM draw_records dr
  WHERE (dr.points_used > 0)
UNION ALL
 SELECT 'dismantle'::text AS type,
    dr.user_id,
    (COALESCE(dr.refund_amount, 0))::bigint AS delta,
    concat('回收退還：', COALESCE(dr.prize_name, ''::character varying)) AS description,
    dr.status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    dr.id AS ref_id,
    dr.created_at
   FROM draw_records dr
  WHERE ((dr.status)::text = 'dismantled'::text)
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
;
