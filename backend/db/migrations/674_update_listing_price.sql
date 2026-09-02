-- 674: 交易所「編輯價格」——賣家改自己架上那件的售價
-- 老闆 2026-09-02：詳情頁自己的上架分兩顆鍵「編輯（可重新編輯金額）」「按住下架」。
-- 驗證跟 create_listing 同一套：本人、還在架上、價格在 platform_settings 的上下限內。

CREATE OR REPLACE FUNCTION public.update_listing_price(p_listing_id bigint, p_price integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lst RECORD;
  v_min integer;
  v_max integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;
  IF p_price IS NULL OR p_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '售價要大於 0');
  END IF;

  SELECT COALESCE((SELECT NULLIF(value,'')::int FROM platform_settings WHERE key='marketplace_min_price'), 1),
         COALESCE((SELECT NULLIF(value,'')::int FROM platform_settings WHERE key='marketplace_max_price'), 2147483647)
    INTO v_min, v_max;

  IF p_price < v_min THEN
    RETURN jsonb_build_object('success', false, 'message', format('售價不能低於 %s G', v_min));
  END IF;
  IF p_price > v_max THEN
    RETURN jsonb_build_object('success', false, 'message', format('售價不能高於 %s G', v_max));
  END IF;

  SELECT * INTO v_lst FROM marketplace_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這筆上架');
  END IF;
  IF v_lst.seller_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', '這不是你的上架');
  END IF;
  IF v_lst.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'message', '這件已經不在架上了');
  END IF;

  UPDATE marketplace_listings SET price = p_price, updated_at = NOW() WHERE id = p_listing_id;

  RETURN jsonb_build_object('success', true, 'message', '價格已更新', 'price', p_price);
END;
$$;
