-- 485：主題色盤
--
-- 前台的主色原本寫死在 tailwind.config.js（編譯期常數），改一次要重新建置。
-- 改成 CSS 變數之後，這裡負責存後台設定的值。
--
-- 為什麼四個階都存，不是只存主色：現在這四個值是當初手調的，
-- 彼此不是同一條公式推出來的（dark 降的飽和度比 light 升的多）。
-- 只存主色的話預設主題就跟現在的畫面對不起來。
-- 後台挑一個主色、前端推導出另外三階，存進來的是四個結果。
--
-- 沒有設定過就是沒有這幾筆資料，前台會沿用 globals.css 裡的預設值 ——
-- 所以這個 migration 跑完當下畫面不會有任何變化。

CREATE OR REPLACE VIEW public.public_theme AS
SELECT
  max(value) FILTER (WHERE key = 'theme_primary')       AS primary,
  max(value) FILTER (WHERE key = 'theme_primary_dark')  AS dark,
  max(value) FILTER (WHERE key = 'theme_primary_light') AS light,
  max(value) FILTER (WHERE key = 'theme_primary_soft')  AS soft
FROM public.platform_settings
WHERE key IN ('theme_primary', 'theme_primary_dark', 'theme_primary_light', 'theme_primary_soft');

-- 前台在 root layout 用 anon key 讀這個 view，才有辦法在第一次繪製就套上顏色。
-- 直接開放 platform_settings 不行 —— 那張表裡還有維護模式的繞過金鑰
GRANT SELECT ON public.public_theme TO anon, authenticated;

COMMENT ON VIEW public.public_theme IS
  '前台主題色。只曝露四個顏色，不曝露 platform_settings 的其他欄位（含繞過金鑰）。';
