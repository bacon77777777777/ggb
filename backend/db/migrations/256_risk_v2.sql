-- W3-2：風控 v2 設定 + IP 日誌表

-- 新增風控設定項
INSERT INTO risk_alert_settings (key, value, description) VALUES
  ('multi_ip_window_hours',    '24',   '同IP多帳號偵測視窗（小時）'),
  ('multi_ip_min_users',       '3',    '同IP多帳號警報門檻（帳號數）'),
  ('recharge_rate_count',      '5',    '短時間大量儲值門檻（筆數）'),
  ('recharge_rate_window_min', '60',   '短時間大量儲值視窗（分鐘）'),
  ('logistics_overdue_days',   '7',    '物流逾期警報（天數，無更新）')
ON CONFLICT (key) DO NOTHING;

-- IP 日誌表（記錄登入/抽蛋/儲值的 IP，供風控分析）
CREATE TABLE IF NOT EXISTS user_ip_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip         TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'draw' | 'recharge' | 'login'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_ip_log_ip_created ON user_ip_log (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS user_ip_log_user_created ON user_ip_log (user_id, created_at DESC);
