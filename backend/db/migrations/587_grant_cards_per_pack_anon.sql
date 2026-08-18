-- 587_grant_cards_per_pack_anon.sql
--
-- products 對 anon／authenticated 是「逐欄位」授權，不是整張表。
-- migration 584 新增的 cards_per_pack 沒跟著授權，前台只要把它放進 select
-- 就會拿到 42501 permission denied —— 而 PostgREST 是整筆查詢失敗，
-- 於是**每個商品頁都變成「找不到商品」**，不是只有卡包模式的商品。
--
-- 教訓：往 products 加欄位、又要給前台讀時，必須同步 GRANT。

BEGIN;
GRANT SELECT (cards_per_pack) ON public.products TO anon;
GRANT SELECT (cards_per_pack) ON public.products TO authenticated;
COMMIT;
