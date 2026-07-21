-- Migration 318: platform_settings 補公開讀取 policy + free_shipping_threshold 預設值
-- 問題：表建立時啟用 RLS 但無 SELECT policy，導致前台 anon 讀不到設定值
-- 規則頁面（/gacha/rules 等）需要 anon 讀取 free_shipping_threshold

-- 允許任何人讀取 platform_settings（key-value 皆為非敏感公開設定）
CREATE POLICY "allow_public_read_platform_settings"
  ON public.platform_settings
  FOR SELECT
  USING (true);

-- 補上 free_shipping_threshold 預設值（若不存在）
INSERT INTO public.platform_settings (key, value)
VALUES ('free_shipping_threshold', '7')
ON CONFLICT (key) DO NOTHING;
