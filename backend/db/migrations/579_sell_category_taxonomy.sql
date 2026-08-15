-- 579_sell_category_taxonomy.sql
--
-- 商城類別重新定義（老闆 2026-08-15 定案）。
--
-- 舊白名單（一番賞／盒玩／轉蛋／卡牌／公仔模型／周邊商品）是照抽獎那邊的商品類型抄的，
-- 但「一番賞」是抽獎玩法不是商品類別 —— 二手轉讓賣的是那支公仔、那張卡。
-- 新的十類是玩具收藏市場的分類：
--   公仔模型／盲盒盲袋／卡牌收藏／積木拼裝／娃娃玩偶／
--   遙控玩具／益智桌遊／兒童玩具／限定收藏／玩具配件
--
-- 前台「我要上架」的必選類別與商城首頁的分類列都吃這份白名單（platform_settings），
-- 兩邊自然一致；後台「商城設定」仍可增減。
--
-- 既有商品要一併換到新類別：sell_guard_listing 每次 UPDATE 都會核對白名單，
-- 舊類別不在名單裡的話，賣家連下架都會被「這個類別不開放販售」擋掉。
-- 這裡用 row_security=off 讓 sell_is_privileged() 放行，才不會觸發「改內容重新送審」
-- 把上架中的商品全部打回 pending。

BEGIN;

SET LOCAL row_security = off;

UPDATE public.platform_settings
   SET value = '["公仔模型","盲盒盲袋","卡牌收藏","積木拼裝","娃娃玩偶","遙控玩具","益智桌遊","兒童玩具","限定收藏","玩具配件"]',
       updated_at = now()
 WHERE key = 'sell_category_whitelist';

UPDATE public.sell_listings
   SET category = CASE category
         WHEN '一番賞'   THEN '公仔模型'
         WHEN '公仔'     THEN '公仔模型'
         WHEN '盒玩'     THEN '盲盒盲袋'
         WHEN '轉蛋'     THEN '盲盒盲袋'
         WHEN '卡牌'     THEN '卡牌收藏'
         WHEN '周邊商品' THEN '限定收藏'
         WHEN '絨毛'     THEN '娃娃玩偶'
         ELSE category END
 WHERE category IN ('一番賞','公仔','盒玩','轉蛋','卡牌','周邊商品','絨毛');

COMMIT;
