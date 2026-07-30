-- STG only: sync machine 7 coin_return pool items from PROD
-- PROD has 4 coin_return items for machine 7 (normal spin rewards); STG was missing them
-- Without these, every non-RUSH spin throws "No prizes configured for this machine"

-- First insert the corresponding slot_prizes
INSERT INTO public.slot_prizes (name, level, image_url, recycle_value)
VALUES
  ('神域共鳴', 'normal', '/images/slot/coin.png', 0),
  ('命運之瞳', 'normal', '/images/slot/coin.png', 0),
  ('緋色幸運', 'normal', '/images/slot/coin.png', 0),
  ('黃金序章', 'normal', '/images/slot/coin.png', 0);

-- Then insert pool items referencing the new prizes
INSERT INTO public.slot_pool_items
  (machine_id, slot_prize_id, min_bet, weight, coin_return, return_multiplier, is_floor, rush_only, normal_only, display_name)
SELECT
  7,
  sp.id,
  NULL,
  CASE sp.name
    WHEN '黃金序章' THEN 520
    WHEN '緋色幸運' THEN 200
    WHEN '命運之瞳' THEN 100
    WHEN '神域共鳴' THEN  50
  END,
  true,
  CASE sp.name
    WHEN '黃金序章' THEN 0.25
    WHEN '緋色幸運' THEN 0.80
    WHEN '命運之瞳' THEN 1.50
    WHEN '神域共鳴' THEN 2.40
  END,
  false, false, false,
  sp.name
FROM public.slot_prizes sp
WHERE sp.name IN ('黃金序章', '緋色幸運', '命運之瞳', '神域共鳴')
  AND sp.image_url = '/images/slot/coin.png'
ORDER BY sp.id DESC
LIMIT 4;
