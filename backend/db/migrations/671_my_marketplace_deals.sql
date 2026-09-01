-- 671：玩家自己的交易所交易紀錄（老闆 2026-09-01 交易所改版，前台「交易紀錄」分頁）
--
-- marketplace_transactions 的 RLS 讓買賣雙方讀得到自己的那幾筆，這沒問題。
-- problem 出在「這筆買賣的是什麼東西」：獎項名稱與圖要 join draw_records，
-- 而 draw_records 的 RLS 是「只看得到自己的」，成交後那件獎品已經換手 ——
--   ・買到的：draw_record 現在屬於我 → join 得到
--   ・賣掉的：draw_record 已經是買家的 → **join 回來全是 NULL**
-- 也就是說賣家永遠看不到自己賣掉了什麼，只看得到一個金額。
--
-- 這支開一個 SECURITY DEFINER 函數把兩邊都補齊。只回 auth.uid() 自己的紀錄，
-- 且不吐交易對象的 email／uuid 以外的東西 —— 對方的暱稱與頭像本來就在
-- public_marketplace_listings 露過，屬於逛街看得到的範圍。

CREATE OR REPLACE FUNCTION public.my_marketplace_deals(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id             bigint,
  side           text,          -- 'buy' | 'sell'
  price          integer,
  fee            integer,
  seller_receive integer,
  created_at     timestamptz,
  prize_name     text,
  prize_level    text,
  prize_image    text,
  product_name   text,
  counterparty   text           -- 對方的暱稱
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    CASE WHEN t.buyer_id = auth.uid() THEN 'buy' ELSE 'sell' END AS side,
    t.price,
    t.fee,
    t.seller_receive,
    t.created_at,
    COALESCE(pp.name, '未知品項') AS prize_name,
    COALESCE(pp.level, '')        AS prize_level,
    pp.image_url                  AS prize_image,
    COALESCE(p.name, '')          AS product_name,
    COALESCE(
      CASE WHEN t.buyer_id = auth.uid() THEN su.name ELSE bu.name END,
      '玩家'
    ) AS counterparty
  FROM marketplace_transactions t
  LEFT JOIN draw_records   dr ON dr.id = t.draw_record_id
  LEFT JOIN product_prizes pp ON pp.id = dr.product_prize_id
  LEFT JOIN products       p  ON p.id  = dr.product_id
  LEFT JOIN users          bu ON bu.id = t.buyer_id
  LEFT JOIN users          su ON su.id = t.seller_id
  WHERE auth.uid() IS NOT NULL
    AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
  ORDER BY t.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;

REVOKE ALL ON FUNCTION public.my_marketplace_deals(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.my_marketplace_deals(integer) TO authenticated;

COMMENT ON FUNCTION public.my_marketplace_deals(integer) IS
  '玩家自己的交易所成交紀錄（買進＋賣出）。賣掉的獎品已經換手、draw_records 的 RLS 讀不到，所以走 SECURITY DEFINER 補齊品項資料。';
