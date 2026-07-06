-- Migration 248: 風控警報設定表
-- 儲存可調閾值，讓管理員能在後台修改，不需改 code

CREATE TABLE IF NOT EXISTS public.risk_alert_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 預設閾值
INSERT INTO public.risk_alert_settings (key, value, description) VALUES
  ('token_burn_1h_threshold', '5000',  '單一帳號 1 小時內消耗代幣警報閾值（G）'),
  ('low_inventory_threshold', '5',     '商品剩餘數量警報閾值（remaining ≤ 此值）'),
  ('risk_alert_enabled',      'true',  '風控警報總開關')
ON CONFLICT (key) DO NOTHING;

-- RLS：service_role 可讀寫，authenticated 只讀（後台管理員透過 service_key 操作）
ALTER TABLE public.risk_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role all" ON public.risk_alert_settings
  USING (auth.role() = 'service_role');
CREATE POLICY "authenticated read" ON public.risk_alert_settings
  FOR SELECT USING (auth.role() = 'authenticated');
