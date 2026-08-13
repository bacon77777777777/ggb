-- 556_sell_settings_public_read.sql
--
-- 讓前台讀得到 `sell_*` 的商城設定。
--
-- 原本的政策只放行 `promo_%` / `shipping_%` / `free_shipping_threshold`，
-- 所以前台讀 `sell_disclaimer` 會**靜默回空陣列**（RLS 擋掉不會報錯），
-- 免責聲明就永遠不顯示 —— 而那段文字正是平台不碰錢時唯一的界線，不能少。
--
-- `sell_*` 這幾個 key 全都是本來就要給玩家看的規則：
-- 開放哪些類別、要不要手機驗證、上架上限、付款/出貨/收貨期限、免責聲明。
-- 沒有一個是機密，公開讀沒有風險。

BEGIN;

DROP POLICY IF EXISTS "public can read public settings" ON public.platform_settings;

CREATE POLICY "public can read public settings" ON public.platform_settings
  FOR SELECT USING (
    key LIKE 'promo\_%'
    OR key LIKE 'shipping\_%'
    OR key LIKE 'sell\_%'
    OR key = 'free_shipping_threshold'
  );

COMMIT;
