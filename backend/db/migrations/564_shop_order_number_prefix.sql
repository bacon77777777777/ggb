-- 564_shop_order_number_prefix.sql
--
-- 官方訂單編號前綴 S → SH。
--
-- 綠界 callback 是靠 MerchantTradeNo 的前綴決定這筆錢要記到哪裡
-- （TP=儲值、SO=玩家商城、SH=官方商城）。561 給官方訂單的前綴是單一個 'S'，
-- 而玩家商城的 _gen_sell_order_number 用的是 'SO' —— 'SO...' 也符合
-- startsWith('S')，兩種訂單會在 callback 裡撞在一起，錢可能記到錯的單上。
--
-- 目前兩個環境都還沒有任何 shop_orders，直接換前綴不影響既有資料。

BEGIN;

CREATE OR REPLACE FUNCTION public.shop_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'SH' || to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'YYMMDD')
                        || lpad(NEW.id::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.shop_order_number() IS
  '官方商城訂單編號。前綴 SH 不可與玩家商城的 SO、儲值的 TP 混淆 —— 綠界 callback 靠前綴分派';

COMMIT;
