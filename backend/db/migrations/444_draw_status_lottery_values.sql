-- 444: draw_records.status 加入抽籤販售的兩個狀態
--
-- 'lost'    落選。要留紀錄（查得到誰抽過幾次），但不是 in_warehouse 就不會進倉庫。
-- 'expired' 中籤後 30 天內沒申請寄出，保留期限到期。
--
-- 這個 CHECK 沒有列在任何 migration 註解裡，是 play_lottery 實際寫入時才炸出來的。
-- 之後再加狀態記得一起改這裡。

ALTER TABLE public.draw_records DROP CONSTRAINT IF EXISTS draw_records_status_check;
ALTER TABLE public.draw_records ADD CONSTRAINT draw_records_status_check
  CHECK (status = ANY (ARRAY[
    'success', 'in_warehouse', 'pending_delivery', 'shipped',
    'exchanged', 'dismantled', 'listing', 'cancelled', 'coin_return',
    'lost',      -- 抽籤販售：落選
    'expired'    -- 抽籤販售：保留期限到期
  ]));
