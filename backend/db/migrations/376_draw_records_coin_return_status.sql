-- 補 draw_records status check constraint 加入 'coin_return'
-- play_slot_locked 函數在普通旋轉時 INSERT status='coin_return'，但原 constraint 缺此值

ALTER TABLE public.draw_records
  DROP CONSTRAINT IF EXISTS draw_records_status_check;

ALTER TABLE public.draw_records
  ADD CONSTRAINT draw_records_status_check
  CHECK (status = ANY (ARRAY[
    'success', 'in_warehouse', 'pending_delivery', 'shipped',
    'exchanged', 'dismantled', 'listing', 'cancelled', 'coin_return'
  ]));
