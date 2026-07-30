-- 383_machine_occupancy.sql
-- 機台佔用系統：追蹤哪個玩家正在使用機台，支援 99 秒緩衝寬限期

ALTER TABLE public.slot_machines
  ADD COLUMN IF NOT EXISTS occupant_id          UUID,
  ADD COLUMN IF NOT EXISTS occupant_active_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS occupancy_expires_at  TIMESTAMPTZ;

-- 狀態邏輯（client 端計算）：
--   occupant_id IS NULL OR occupancy_expires_at < NOW()  → 空閒，任何人可進入
--   occupant_id = ME                                      → 我的機台，顯示「回到機台」
--   occupant_id = OTHER AND occupant_active_until > NOW() → 使用中（顯示「使用中」）
--   occupant_id = OTHER AND occupancy_expires_at  > NOW() → 寬限中（顯示「X秒後可進入」倒數）
