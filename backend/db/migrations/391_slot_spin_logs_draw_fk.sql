-- 391: slot_spin_logs.draw_record_id 補 FK + 索引
-- 讓後台消費紀錄（draw_records）可透過 PostgREST embedding 帶出老虎機投注金額與機台資訊

ALTER TABLE public.slot_spin_logs
  DROP CONSTRAINT IF EXISTS slot_spin_logs_draw_record_id_fkey;
ALTER TABLE public.slot_spin_logs
  ADD CONSTRAINT slot_spin_logs_draw_record_id_fkey
  FOREIGN KEY (draw_record_id) REFERENCES public.draw_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_slot_spin_logs_draw_record
  ON public.slot_spin_logs (draw_record_id) WHERE draw_record_id IS NOT NULL;
