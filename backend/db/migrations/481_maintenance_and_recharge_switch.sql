-- 481: 維護模式與儲值開關
--
-- 老闆要兩件事：
--   1. 前台／後台能啟動維護，使用中的玩家會被踢出並看到維護頁
--   2. 功能開關頁加一個「儲值充值」開關，關掉就斷開綠界，儲值頁顯示維護中
--
-- ── 為什麼放 platform_settings 而不是 feature_flags ──
-- feature_flags 是 key/enabled 兩欄的布林開關，適合「這個玩法開不開」。
-- 維護模式還需要文案、預計恢復時間、繞過用的金鑰 —— 那是設定不是開關。
-- 儲值開關則是單純的布林，放 feature_flags 跟其他玩法開關擺一起才好找。

-- ── 儲值開關（布林，放 feature_flags）──
INSERT INTO feature_flags (key, enabled) VALUES ('recharge', true)
ON CONFLICT (key) DO NOTHING;

-- ── 維護模式（有文案與時間，放 platform_settings）──
INSERT INTO platform_settings (key, value) VALUES
  -- 'off' | 'frontend' | 'backend' | 'all'
  ('maintenance_scope',   'off'),
  ('maintenance_message', '系統維護中，我們正在做一些調整，很快就回來。'),
  -- 預計恢復時間，ISO 字串。留空就不顯示
  ('maintenance_until',   ''),
  -- 繞過金鑰：帶 ?__mk=<這個值> 進站會種一個 cookie，之後照常瀏覽。
  -- 維護期間自己要能進去驗證，不然改完也不知道好了沒。
  -- 空字串代表沒人能繞過。
  ('maintenance_bypass_key', encode(gen_random_bytes(12), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 前台要讀得到維護狀態才能顯示維護頁。
-- platform_settings 目前是後台專用，開一個唯讀的公開視圖，只露出必要的三個 key ——
-- 直接開放整張表會連運費設定、健康檢查的時間戳都露出去。
CREATE OR REPLACE VIEW public.public_maintenance AS
  SELECT
    MAX(value) FILTER (WHERE key = 'maintenance_scope')   AS scope,
    MAX(value) FILTER (WHERE key = 'maintenance_message') AS message,
    MAX(value) FILTER (WHERE key = 'maintenance_until')   AS until
  FROM platform_settings
  WHERE key IN ('maintenance_scope', 'maintenance_message', 'maintenance_until');

GRANT SELECT ON public.public_maintenance TO anon, authenticated;

COMMENT ON VIEW public.public_maintenance IS
  '前台可讀的維護狀態。只露出 scope/message/until —— platform_settings 整張表還有運費與內部時間戳，不能直接開放。';

SELECT key, value FROM platform_settings WHERE key LIKE 'maintenance%' ORDER BY key;
SELECT key, enabled FROM feature_flags WHERE key = 'recharge';
