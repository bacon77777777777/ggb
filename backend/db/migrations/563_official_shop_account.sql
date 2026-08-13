-- 563_official_shop_account.sql
--
-- 官方商城的「賣家」帳號。
--
-- sell_listings.seller_id 是 NOT NULL，官方商品也得掛在某個 user 上。
-- 選項有二：把欄位改成可為 NULL，或建一個系統帳號。
-- 改成 NULL 會讓所有既有的 C2C 邏輯都要多想一次「這裡會不會是 NULL」，
-- 而那些程式碼的前提就是「一定有賣家」。建帳號便宜得多。
--
-- 這個帳號固定 id，兩個環境一樣，方便對照與寫死引用。
-- is_bot = true：所有財務／分析 query 都會把它排除（見 CLAUDE.md），
-- 官方自售的營收要從 shop_orders 算，不該混進玩家統計裡。

BEGIN;

-- public.users.id 有 FK 指向 auth.users，所以要先有 auth 那一列。
-- auth.users 只有 id 是必填無預設，其餘都有預設值。
-- 這個帳號**永遠不會登入**：沒有密碼、沒有確認信、不發 token，
-- 純粹是給官方商品當 owner 用的掛號。
INSERT INTO auth.users (id, email, aud, role)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'official@ggb-internal.io',
  'authenticated',
  'authenticated'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, name, email, invite_code, is_bot, tokens)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '吉吉比官方',
  'official@ggb-internal.io',
  'GGBOFFICIAL',
  true,
  0
)
-- ⚠️ DO UPDATE 必須把 is_bot 一起設。
-- 插入 auth.users 會觸發 Supabase 的 handle_new_user，它**搶先**用預設值
-- （is_bot = false）建好 public.users 這一列，所以下面這句一定走 ON CONFLICT。
-- 只更新 name 的話 is_bot 會留在 false，官方帳號就會被算進玩家統計與排行榜。
ON CONFLICT (id) DO UPDATE
  SET name        = '吉吉比官方',
      email       = 'official@ggb-internal.io',
      invite_code = 'GGBOFFICIAL',
      is_bot      = true;

COMMENT ON TABLE public.users IS '會員。id=00000000-0000-0000-0000-000000000001 為官方商城系統帳號（is_bot=true，不計入任何統計）';

CREATE OR REPLACE FUNCTION public.shop_official_seller_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;

COMMIT;
