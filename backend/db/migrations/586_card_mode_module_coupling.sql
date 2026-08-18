-- 586_card_mode_module_coupling.sql
--
-- 抽卡兩種模式的規則寫進 DB（老闆 2026-08-18 定案）：
--
--   單抽模式（cards_per_pack IS NULL 或 1）
--     一抽一張，就是原本那樣。**不可以用「撕開封口」模組** —— 那是整包的演出。
--
--   卡包模式（cards_per_pack >= 2）
--     一抽開一整包、玩家選的是包。模組固定為 card_peel（撕開封口），不給選別的。
--     庫存以「包」為單位：總張數必須剛好是每包張數的整數倍，
--     否則會出現湊不成包、永遠賣不掉的尾數籤。
--
-- 只約束抽卡；其他類別完全不受影響。既有商品 cards_per_pack 為 NULL，一律算單抽模式。

BEGIN;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_card_mode_module_check;
ALTER TABLE public.products ADD CONSTRAINT products_card_mode_module_check CHECK (
  -- 每個分支都用 COALESCE 包起來：cards_per_pack 為 NULL 時 `NULL >= 2` 會得到
  -- NULL，讓整條 CHECK 變成 NULL —— 而 CHECK 判定 NULL 是「通過」。
  -- 少了這層，「單抽模式 + 撕開封口」這個該擋的組合會被放行。
  type <> 'card'
  -- 單抽模式：不得使用撕開封口
  OR (COALESCE(cards_per_pack, 1) = 1  AND COALESCE(machine_theme, '') <> 'card_peel')
  -- 卡包模式：模組必須是撕開封口
  OR (COALESCE(cards_per_pack, 1) >= 2 AND COALESCE(machine_theme, '') =  'card_peel')
);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_pack_stock_check;
ALTER TABLE public.products ADD CONSTRAINT products_pack_stock_check CHECK (
  COALESCE(cards_per_pack, 1) = 1
  OR total_count IS NULL
  OR total_count % cards_per_pack = 0
);

COMMENT ON CONSTRAINT products_card_mode_module_check ON public.products IS
  '抽卡：單抽模式不可用 card_peel；卡包模式必須用 card_peel（migration 586）';
COMMENT ON CONSTRAINT products_pack_stock_check ON public.products IS
  '卡包模式庫存以包為單位：總張數必須是每包張數的整數倍（migration 586）';

COMMIT;
