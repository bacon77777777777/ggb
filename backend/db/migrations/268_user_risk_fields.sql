-- 用戶風控欄位：凍結 + 標記可疑
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'inactive', 'frozen'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspicious   boolean   NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspicious_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_at       timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_by       text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_reason   text;
