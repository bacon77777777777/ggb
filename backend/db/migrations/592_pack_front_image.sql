-- 592_pack_front_image.sql
--
-- 卡包正面獨立成自己的欄位（老闆 2026-08-19）。
--
-- migration 588 當時把「卡包正面」直接沿用商品主圖（image_url），但那兩張的用途不同：
--   image_url            商品列表／小卡／分享縮圖看到的那張，要能一眼認出這是什麼商品
--   pack_front_image_url 商品頁輪播與開包演出裡那個立體卡包的正面貼圖，要是直式卡包構圖
-- 混用等於逼老闆二選一：主圖挑得好看，卡包就貼不對；卡包貼對了，列表就變成一張卡包照。
--
-- 沒設時前台仍退回 image_url，既有商品不會突然變空白。
--
-- ⚠️ products 對 anon 是逐欄位授權，新欄位一定要同步 GRANT
--    （migration 587 踩過：沒授權就放進前台 select，會讓每個商品頁都變「找不到商品」）。

BEGIN;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pack_front_image_url text;

COMMENT ON COLUMN public.products.pack_front_image_url IS
  '抽卡：卡包正面圖。沒設時前台退回 image_url（商品主圖）';

GRANT SELECT (pack_front_image_url) ON public.products TO anon;
GRANT SELECT (pack_front_image_url) ON public.products TO authenticated;

COMMIT;
