-- 423: 彈窗的「對象」與「按下叉叉後」改為全站統一設定
--
-- 這兩項每則各設一次，實務上只會讓每次新增公告都要多想一次，
-- 而且多則排隊時規則不一致更難解釋。改放 platform_settings，
-- 逐則保留的只剩「排序」與內容本身。
--
-- 關閉狀態仍是逐則記錄（記在瀏覽器，以 promo id 為鍵），只有「規則」共用，
-- 所以之後新增的公告不會因為玩家關過舊的就不跳。

-- ── 全站設定（以現有資料為預設值）───────────────────────────────────────
INSERT INTO public.platform_settings (key, value)
VALUES
  ('promo_audience',     'all'),
  ('promo_dismiss_mode', 'always'),
  ('promo_dismiss_days', '7')
ON CONFLICT (key) DO NOTHING;

-- ── 前台要讀得到 ────────────────────────────────────────────────────────
-- platform_settings 有開 RLS 但一條 policy 都沒有，anon 讀出來是空陣列。
-- 這裡只開放 promo_ 開頭的鍵，其餘（運費等）維持不可匿名讀取。
DROP POLICY IF EXISTS "public can read promo settings" ON public.platform_settings;
CREATE POLICY "public can read promo settings"
  ON public.platform_settings FOR SELECT
  TO anon, authenticated
  USING (key LIKE 'promo\_%');

-- ── 逐則的同名欄位移除，避免兩個真實來源 ────────────────────────────────
-- 留著不會有人用，只會讓人改了那欄卻發現前台沒反應。
ALTER TABLE public.site_promos DROP COLUMN IF EXISTS audience;
ALTER TABLE public.site_promos DROP COLUMN IF EXISTS dismiss_mode;
ALTER TABLE public.site_promos DROP COLUMN IF EXISTS dismiss_days;

COMMENT ON COLUMN public.site_promos.sort_order IS '排隊順序，小的先跳';
