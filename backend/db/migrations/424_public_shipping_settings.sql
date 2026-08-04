-- 424: 前台讀得到運費設定
--
-- platform_settings 開了 RLS 卻沒有任何 policy，前台以 anon 身分讀出來是空陣列。
-- profile 頁直接查這張表拿運費，讀不到就沿用程式裡寫死的預設值 ——
-- 目前預設值剛好等於 DB 的值所以看不出異常，但後台調整運費前台不會生效。
--
-- 用前綴白名單而不是全表開放：這張表之後可能放不該給玩家看的設定。
-- 目前開放的都是玩家在結帳頁本來就會看到的數字。

DROP POLICY IF EXISTS "public can read promo settings" ON public.platform_settings;
DROP POLICY IF EXISTS "public can read public settings" ON public.platform_settings;

CREATE POLICY "public can read public settings"
  ON public.platform_settings FOR SELECT
  TO anon, authenticated
  USING (
    key LIKE 'promo\_%'
    OR key LIKE 'shipping\_%'
    OR key = 'free_shipping_threshold'
  );
