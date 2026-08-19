-- 589_card_pack_allow_all_modules.sql
--
-- 放寬 migration 586 的模式↔模組耦合（老闆 2026-08-18）：
--   卡包模式現在也可以選「蓄力開卡包」與「過場影片」，不再鎖死 card_peel。
--
-- 保留的規則：
--   單抽模式仍然不可用 card_peel —— 那是整包的演出，一抽一張套上去沒有意義。
--   卡包模式的庫存整除規則（products_pack_stock_check）不動，那是完整性。
--
-- 為什麼原本鎖死：怕兩種模式的演出不通用。實際上蓄力開卡包本來就是
-- 「撕開卡包 → 卡牌一一揭曉」，整包也講得通；過場影片更是與張數無關。

BEGIN;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_card_mode_module_check;
ALTER TABLE public.products ADD CONSTRAINT products_card_mode_module_check CHECK (
  -- 每個分支都用 COALESCE 包起來：NULL 會讓整條 CHECK 變 NULL，而 CHECK 判定 NULL 是「通過」
  type <> 'card'
  -- 單抽模式：不得使用撕開封口（整包專用的演出）
  OR (COALESCE(cards_per_pack, 1) = 1 AND COALESCE(machine_theme, '') <> 'card_peel')
  -- 卡包模式：三種模組都可以
  OR COALESCE(cards_per_pack, 1) >= 2
);

COMMENT ON CONSTRAINT products_card_mode_module_check ON public.products IS
  '抽卡：單抽模式不可用 card_peel；卡包模式三種模組皆可（migration 589 放寬 586）';

COMMIT;
