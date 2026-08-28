-- 636：同網段多帳號「同時在線」警報（老闆 2026-08-28）
--
-- 判準改成「IP 前三段相同就算同一個人」，並從「24 小時內」改成「同時在線」：
-- 多開是整批同時上線，用一天當視窗會把不同時段的正常玩家也算進來。
--
-- 舊的 multi_ip_window_hours 停用（程式已不讀），改用分鐘視窗；
-- 門檻依老闆指定改成 10 個帳號。

INSERT INTO risk_alert_settings (key, value, description)
VALUES ('multi_ip_window_minutes', '30', '同網段多帳號「同時在線」認定視窗（分鐘）')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

UPDATE risk_alert_settings
SET value = '10',
    description = '同網段多帳號警報門檻（帳號數，IP 前三段相同視為同一網段）'
WHERE key = 'multi_ip_min_users';

DELETE FROM risk_alert_settings WHERE key = 'multi_ip_window_hours';
