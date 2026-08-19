-- 594_account_deletion.sql
-- 帳號刪除（Apple App Store Review Guideline 5.1.1(v) 強制要求）
--
-- ⚠️ 為什麼是「匿名化」而不是真的 DELETE：
--   public.users.id → auth.users(id) ON DELETE CASCADE，
--   而 token_adjustments / user_badges / user_coupons / daily_check_ins … 又對 users CASCADE，
--   recharge_records / draw_records / orders 則是 SET NULL。
--   也就是說只要刪掉 auth.users 一列，會同時發生：
--     1. token_adjustments 整批消失 → 財務對帳公式的 manual_total 少一塊，帳永遠對不起來
--     2. recharge_records.user_id 變 NULL → ECPay 對帳失去歸屬
--     3. draw_records.user_id 變 NULL → /fairness 公平性驗證的逐籤比對斷鏈
--   加上商業會計法要求憑證保存五年，交易紀錄本來就不能刪。
--
--   Apple 的規範允許這樣做：「Follow applicable legal requirements for storing and
--   retaining user account information」。我們刪的是「個資 + 登入能力」，
--   保留的只有法定必須的交易憑證，且不可回復 —— 不是 Apple 禁止的「暫時停用」。

-- ── 1. 標記欄位 ────────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deleted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at
  ON public.users (deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.users.deleted_at IS
  '帳號刪除時間。非 NULL 代表個資已匿名化、無法登入；交易紀錄仍保留供對帳與公平性驗證。';


-- ── 2. 前置檢查：告訴前台「現在能不能刪、刪了會失去什麼」 ──────────────────
CREATE OR REPLACE FUNCTION public.account_deletion_preflight(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_at    timestamptz;
  v_tokens        bigint;
  v_platform      int;
  v_sell_buy      int;
  v_sell_sell     int;
  v_shop          int;
  v_warehouse     int;
  v_listings      int;
BEGIN
  SELECT deleted_at, COALESCE(tokens, 0)
    INTO v_deleted_at, v_tokens
    FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- 平台自營訂單（轉蛋／一番賞抽中後的出貨單）
  SELECT count(*) INTO v_platform FROM orders
   WHERE user_id = p_user_id
     AND status IN ('submitted', 'processing', 'picked_up', 'shipping');

  -- 玩家商城 C2C：買家端與賣家端都要看（現金交易，牽涉對方權益）
  SELECT count(*) INTO v_sell_buy FROM sell_orders
   WHERE buyer_id = p_user_id AND cancelled = false AND completed_at IS NULL;
  SELECT count(*) INTO v_sell_sell FROM sell_orders
   WHERE seller_id = p_user_id AND cancelled = false AND completed_at IS NULL;

  -- 官方商城 B2C
  SELECT count(*) INTO v_shop FROM shop_orders
   WHERE buyer_id = p_user_id
     AND completed_at IS NULL AND refunded_at IS NULL
     AND payment_status <> 'failed';

  -- 倉庫裡抽到但還沒申請出貨的獎品。這些是玩家已經付過錢、我們還欠他的實體商品，
  -- 帳號刪掉之後沒有收件人、也沒有人能來申請 —— 等同平台私吞，一定要擋。
  SELECT count(*) INTO v_warehouse FROM draw_records
   WHERE user_id = p_user_id AND status = 'in_warehouse';

  SELECT count(*) INTO v_listings FROM sell_listings
   WHERE seller_id = p_user_id AND status IN ('pending', 'active');

  RETURN json_build_object(
    'ok',                v_deleted_at IS NULL
                           AND (v_platform + v_sell_buy + v_sell_sell + v_shop) = 0
                           AND v_warehouse = 0
                           AND v_tokens = 0,
    'already_deleted',   v_deleted_at IS NOT NULL,
    'tokens',            v_tokens,
    'pending_orders',    v_platform + v_sell_buy + v_sell_sell + v_shop,
    'pending_platform',  v_platform,
    'pending_sell_buy',  v_sell_buy,
    'pending_sell_sell', v_sell_sell,
    'pending_shop',      v_shop,
    'warehouse_prizes',  v_warehouse,
    'active_listings',   v_listings
  );
END;
$$;


-- ── 3. 執行刪除 ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_user_account(
  p_user_id uuid,
  p_reason  text DEFAULT NULL,
  -- 代幣餘額的擋門是「請先用完或聯繫客服」。p_force 就是客服那條路：
  -- 後台代為執行時可略過餘額檢查（訂單與倉庫獎品的擋門任何情況都不放行）。
  p_force   boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pre     json;
  v_tokens  bigint;
  v_tag     text;
BEGIN
  v_pre := account_deletion_preflight(p_user_id);

  IF (v_pre ->> 'error') IS NOT NULL THEN
    RETURN v_pre;
  END IF;
  IF (v_pre ->> 'already_deleted')::boolean THEN
    RETURN json_build_object('ok', false, 'error', 'already_deleted');
  END IF;
  -- 有進行中訂單一律擋下：牽涉物流、廠商與交易對象，刪了之後出貨／退款／客訴都無從處理
  IF (v_pre ->> 'pending_orders')::int > 0 THEN
    RETURN json_build_object('ok', false, 'error', 'pending_orders', 'detail', v_pre);
  END IF;
  -- 倉庫還有沒申請出貨的獎品也擋：那是已付款、我們還沒交付的實體商品
  IF (v_pre ->> 'warehouse_prizes')::int > 0 THEN
    RETURN json_build_object('ok', false, 'error', 'warehouse_prizes', 'detail', v_pre);
  END IF;
  -- 代幣餘額：請玩家先用完，或由客服走 p_force 代辦
  IF NOT p_force AND (v_pre ->> 'tokens')::bigint > 0 THEN
    RETURN json_build_object('ok', false, 'error', 'tokens_remaining', 'detail', v_pre);
  END IF;

  v_tokens := (v_pre ->> 'tokens')::bigint;
  -- 每個被刪帳號一個穩定的代稱，讓後台看得出「這些紀錄屬於同一個已刪帳號」
  v_tag := 'deleted_' || replace(p_user_id::text, '-', '');

  -- 3a. 代幣餘額視同放棄，但要在帳上留一筆對沖，否則 token_ledger 會出現無來源的差額。
  --     （對帳公式：expected = recharge_total + manual_total - draw_total - refund_deducted）
  IF v_tokens > 0 THEN
    INSERT INTO token_adjustments (user_id, delta, reason, created_by, category)
    VALUES (p_user_id, -v_tokens, '帳號刪除，餘額依服務條款視同放棄', 'system:account_deletion', 'other');
  END IF;

  -- 3b. 下架所有在售商品，避免刪帳號後還有人下單給一個聯絡不到的賣家
  UPDATE sell_listings
     SET status = 'removed'
   WHERE seller_id = p_user_id AND status IN ('pending', 'active');

  -- 3c. 匿名化個資（不可回復）
  UPDATE users SET
      name              = '已刪除的帳號',
      email             = v_tag || '@deleted.invalid',
      phone             = NULL,
      phone_number      = NULL,
      is_phone_verified = false,
      address           = NULL,
      recipient_name    = NULL,
      recipient_phone   = NULL,
      avatar_url        = NULL,
      birthday          = NULL,
      gender            = NULL,
      line_user_id      = NULL,
      tokens            = 0,
      deleted_at        = now(),
      deleted_reason    = p_reason
    WHERE id = p_user_id;

  -- 3d. 讓帳號永久無法登入。
  --     不能 DELETE auth.users —— 那會 CASCADE 掉 public.users 與整條財務鏈（見檔頭）。
  UPDATE auth.users SET
      email              = v_tag || '@deleted.invalid',
      phone              = NULL,
      encrypted_password = NULL,          -- 密碼登入失效
      email_confirmed_at = NULL,
      phone_confirmed_at = NULL,
      email_change       = '',
      phone_change       = '',
      raw_user_meta_data = '{}'::jsonb,   -- OAuth 帶回來的姓名／頭像
      banned_until       = 'infinity'::timestamptz
    WHERE id = p_user_id;

  -- 斷掉第三方登入（LINE／Google），否則同一個社群帳號再登入會接回這列
  DELETE FROM auth.identities     WHERE user_id = p_user_id;
  -- 立即登出所有裝置
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  DELETE FROM auth.sessions       WHERE user_id = p_user_id;

  RETURN json_build_object('ok', true, 'tokens_forfeited', v_tokens);
END;
$$;


-- ── 4. 權限：只有 service_role 能呼叫（前台 API route 用 service key） ──────
REVOKE ALL ON FUNCTION public.account_deletion_preflight(uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.delete_user_account(uuid, text);
REVOKE ALL ON FUNCTION public.delete_user_account(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_preflight(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid, text, boolean) TO service_role;
