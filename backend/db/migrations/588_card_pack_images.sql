-- 588_card_pack_images.sql
--
-- 抽卡商品的三張圖（老闆 2026-08-18）：
--   1. 卡包正面 = 既有的 products.image_url（商品主圖），不另開欄位
--   2. 卡包背面 = pack_back_image_url  ← 新增
--   3. 卡牌背面 = card_back_image_url  ← 新增
--
-- 為什麼需要：卡包模式的商品頁輪播與開包演出，先前用的是內建的六款卡包圖
-- （getRandomPackStyles 隨機挑），每次進頁面看到的卡包長得都不一樣 ——
-- 但玩家買的是「這一檔商品的卡包」，樣式必須固定且由商品自己決定。
--
-- ⚠️ 逐欄位授權：products 對 anon/authenticated 不是整張表 GRANT，
--    新欄位沒授權的話，前台只要 select 到它就整筆 42501，
--    結果是**每個商品頁都變成「找不到商品」**（migration 587 剛踩過這個坑）。

BEGIN;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pack_back_image_url text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS card_back_image_url text;

COMMENT ON COLUMN public.products.pack_back_image_url IS '抽卡：卡包背面圖（正面用 image_url）';
COMMENT ON COLUMN public.products.card_back_image_url IS '抽卡：卡牌背面圖（開包演出的牌背）';

GRANT SELECT (pack_back_image_url, card_back_image_url) ON public.products TO anon;
GRANT SELECT (pack_back_image_url, card_back_image_url) ON public.products TO authenticated;

COMMIT;
