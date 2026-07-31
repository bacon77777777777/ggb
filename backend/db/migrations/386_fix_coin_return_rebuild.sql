-- 386_fix_coin_return_rebuild.sql
-- 修正退幣獎池被靜默清空的地雷：
--
-- 後台主題儲存時會重建 coin_return pool items（display_name only，無獎品連結），
-- 但 slot_pool_items_prize_source_check 要求必須連結 product_prize 或 slot_prize
-- → insert 靜默失敗（route 未檢查 error），而 delete 已成功 → 退幣池全滅。
-- 這也是先前 STG「No prizes configured」退幣池消失的根因。
--
-- 1. CHECK 放寬：coin_return 項目可不連結獎品
-- 2. 依主題 spin_returns 重建所有掛主題機台的 coin_return 項目

ALTER TABLE public.slot_pool_items
  DROP CONSTRAINT IF EXISTS slot_pool_items_prize_source_check;

ALTER TABLE public.slot_pool_items
  ADD CONSTRAINT slot_pool_items_prize_source_check
  CHECK (
    COALESCE(coin_return, FALSE) = TRUE
    OR product_prize_id IS NOT NULL
    OR slot_prize_id   IS NOT NULL
  );

-- 重建掛主題機台的退幣項目（來源：slot_themes.spin_returns）
DELETE FROM public.slot_pool_items spi
USING public.slot_machines m
WHERE spi.machine_id = m.id
  AND m.theme_id IS NOT NULL
  AND COALESCE(spi.coin_return, FALSE) = TRUE;

INSERT INTO public.slot_pool_items
  (machine_id, display_name, coin_return, return_multiplier, weight, normal_only, rush_only, is_floor)
SELECT
  m.id,
  r->>'name',
  TRUE,
  (r->>'multiplier')::NUMERIC,
  (r->>'weight')::INT,
  TRUE, FALSE, FALSE
FROM public.slot_machines m
JOIN public.slot_themes t ON t.id = m.theme_id
CROSS JOIN LATERAL jsonb_array_elements(t.spin_returns) r
WHERE m.theme_id IS NOT NULL;
