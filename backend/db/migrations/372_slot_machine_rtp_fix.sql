-- 372_slot_machine_rtp_fix.sql
-- 修正 RUSH 機率參數，目標 RTP ≈ 70%
-- 原始：floor=30, trigger=15%, min_hits=3, continue=60% → RTP 96%（虧錢）
-- 修正：floor=80, trigger=15%, min_hits=2, continue=10% → RTP 70.2%

UPDATE slot_machines
SET
  floor_spin_count = 80,
  trigger_rate     = 0.15,
  min_rush_hits    = 2,
  continue_rate    = 0.10
WHERE is_active = true;
