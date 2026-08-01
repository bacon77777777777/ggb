-- 410: 還原返還池為定版數值（修 RTP 超過 100% 的倒賠設定）
--
-- 問題：後台主題編輯頁把返還池硬編碼為 FIXED_COIN_RETURNS，且每次存檔都會
--       用該常數覆蓋 DB 的 spin_returns。但該常數停留在 migration 396 之前的
--       舊值（50/100/200/520、黃金序章 0.25），與定版（20/50/130/800、0.2）不符。
--       只要有人打開主題頁按存檔（例如調整檔期），返還池就被靜默改回舊值。
--
-- 影響：返還期望 38.7% → 64.4%，RTP 從 ≈82%（毛利 18%）變成 ≈107~110%，
--       即平台每一輪倒賠。單轉返還金額看起來相同（10 檔皆為 2G），
--       差別在機率，從畫面上完全看不出來。
--
-- 修補：本檔還原資料；程式端已同步修正 app/slot/[id]/page.tsx 的常數，
--       使其與 app/api/admin/slot/themes/route.ts 的 DEFAULT_SPIN_RETURNS 一致。

BEGIN;

UPDATE public.slot_themes SET spin_returns = '[
  {"name": "神域共鳴", "weight": 20,  "multiplier": 2.4},
  {"name": "命運之瞳", "weight": 50,  "multiplier": 1.5},
  {"name": "緋色幸運", "weight": 130, "multiplier": 0.8},
  {"name": "黃金序章", "weight": 800, "multiplier": 0.2}
]'::jsonb;

-- 機台沿用主題設定
UPDATE public.slot_machines m
SET spin_returns = t.spin_returns
FROM public.slot_themes t
WHERE m.theme_id = t.id;

-- 重建返還獎池列（coin_return 列為純顯示項，無庫存與獎品連結，可安全重建）
DELETE FROM public.slot_pool_items spi
USING public.slot_machines m
WHERE spi.machine_id = m.id AND spi.coin_return = TRUE;

INSERT INTO public.slot_pool_items
  (machine_id, display_name, coin_return, return_multiplier, weight, normal_only, rush_only, is_floor)
SELECT m.id, r->>'name', TRUE, (r->>'multiplier')::numeric, (r->>'weight')::int, TRUE, FALSE, FALSE
FROM public.slot_machines m
JOIN public.slot_themes t ON t.id = m.theme_id,
     jsonb_array_elements(t.spin_returns) r;

COMMIT;
