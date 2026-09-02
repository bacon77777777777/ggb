-- 673: 交易所詳情頁「近期走勢」——同款近 90 天的逐筆成交（價格＋時間）
--
-- 670 的 public_marketplace_price_stats 只有聚合值（最近/平均/筆數），
-- 畫不出走勢。這支回逐筆，但只露價格與時間 —— 買賣雙方是誰不關路人的事。
-- 老闆 2026-09-02：「有成交紀錄我要看你怎麼呈現的？可以看商品近期走勢？」

CREATE OR REPLACE VIEW public.public_marketplace_recent_deals AS
SELECT dr.product_prize_id,
       t.price,
       t.created_at
FROM marketplace_transactions t
JOIN draw_records dr ON dr.id = t.draw_record_id
WHERE dr.product_prize_id IS NOT NULL
  AND t.created_at > now() - interval '90 days';

GRANT SELECT ON public.public_marketplace_recent_deals TO anon, authenticated;
