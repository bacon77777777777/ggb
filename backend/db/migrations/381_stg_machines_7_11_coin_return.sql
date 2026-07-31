-- 381_stg_machines_7_11_coin_return.sql
-- STG only: 修補 machines 7-11 缺少普通旋轉獎池品項的問題
-- 每台機器的 32 個品項全是 rush_only=TRUE，導致非 RUSH 狀態下每次轉動都報錯
-- "No prizes configured for this machine"，與 PROD 機器不符
--
-- PROD 每台機器均有 4 個 coin_return 品項（rush_only=FALSE）供普通旋轉使用
-- STG slot_prizes id 74=神域共鳴 75=命運之瞳 76=緋色幸運 77=黃金序章 （已存在）

INSERT INTO public.slot_pool_items
  (machine_id, slot_prize_id, weight, coin_return, return_multiplier,
   is_floor, rush_only, normal_only, display_name)
VALUES
  -- Machine 7
  (7, 77, 520, TRUE, 0.25, FALSE, FALSE, FALSE, '黃金序章'),
  (7, 76, 200, TRUE, 0.80, FALSE, FALSE, FALSE, '緋色幸運'),
  (7, 75, 100, TRUE, 1.50, FALSE, FALSE, FALSE, '命運之瞳'),
  (7, 74,  50, TRUE, 2.40, FALSE, FALSE, FALSE, '神域共鳴'),
  -- Machine 8
  (8, 77, 520, TRUE, 0.25, FALSE, FALSE, FALSE, '黃金序章'),
  (8, 76, 200, TRUE, 0.80, FALSE, FALSE, FALSE, '緋色幸運'),
  (8, 75, 100, TRUE, 1.50, FALSE, FALSE, FALSE, '命運之瞳'),
  (8, 74,  50, TRUE, 2.40, FALSE, FALSE, FALSE, '神域共鳴'),
  -- Machine 9
  (9, 77, 520, TRUE, 0.25, FALSE, FALSE, FALSE, '黃金序章'),
  (9, 76, 200, TRUE, 0.80, FALSE, FALSE, FALSE, '緋色幸運'),
  (9, 75, 100, TRUE, 1.50, FALSE, FALSE, FALSE, '命運之瞳'),
  (9, 74,  50, TRUE, 2.40, FALSE, FALSE, FALSE, '神域共鳴'),
  -- Machine 10
  (10, 77, 520, TRUE, 0.25, FALSE, FALSE, FALSE, '黃金序章'),
  (10, 76, 200, TRUE, 0.80, FALSE, FALSE, FALSE, '緋色幸運'),
  (10, 75, 100, TRUE, 1.50, FALSE, FALSE, FALSE, '命運之瞳'),
  (10, 74,  50, TRUE, 2.40, FALSE, FALSE, FALSE, '神域共鳴'),
  -- Machine 11
  (11, 77, 520, TRUE, 0.25, FALSE, FALSE, FALSE, '黃金序章'),
  (11, 76, 200, TRUE, 0.80, FALSE, FALSE, FALSE, '緋色幸運'),
  (11, 75, 100, TRUE, 1.50, FALSE, FALSE, FALSE, '命運之瞳'),
  (11, 74,  50, TRUE, 2.40, FALSE, FALSE, FALSE, '神域共鳴');
