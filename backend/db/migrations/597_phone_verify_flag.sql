-- 手機驗證的功能開關（2026-08-20）
--
-- 為什麼要有這個旗標：
-- 會員中心的手機驗證走 Supabase Auth 內建的簡訊 OTP，但專案沒接任何簡訊供應商
-- （API 回 phone_provider_disabled），所以按下去必然失敗 —— 玩家看到的是
-- 「Unsupported phone provider」這種英文技術訊息，而且未驗證還會讓設定齒輪
-- 一直掛紅點催他去點。等於系統持續催玩家去撞一道撞不開的門。
--
-- 老闆 2026-08-20 決定：先不接，之後會接台灣本地簡訊商（比 Twilio 便宜一半以上）。
-- 用途是玩家商城與交易所的准入條件 —— 牽涉真錢往來，驗手機能擋一人多帳號。
--
-- 所以預設 false（前台把入口收起來，不再催）。接好簡訊商之後，
-- 後台「設定 → 功能開關」按一下就開，不必改程式。

INSERT INTO feature_flags (key, enabled, state)
VALUES ('phone_verify', false, 'off')
ON CONFLICT (key) DO NOTHING;
