-- 640：收斂 suppliers 對前台的欄位權限（2026-08-29）
--
-- 起因：老闆要做「搜尋關鍵字也能搜廠商名」，查權限時發現
-- **anon 目前讀得到 suppliers 的每一個欄位**，包含：
--
--   profit_share_percent        分潤比例
--   withholding_rate_percent    扣繳率
--   tax_id                      統編
--   contact_name/phone/email    聯絡人個資
--   address / sender_address    地址
--   notes                       內部備註
--
-- 任何人拿公開的 anon key 打 /rest/v1/suppliers?select=* 就全部拿得到。
-- 目前 PROD 這些欄位都還是空的，所以沒有實際外洩 —— 但只要後台把分潤或
-- 聯絡電話填進去，當下就變成公開資料。
--
-- 這跟 migration 471 對 products 做的是同一件事（撤掉 anon 對 seed／
-- profit_rate／cost 的 SELECT），只是當初沒把同樣的紀律套到 suppliers。
--
-- 前台實際只用到 name（frontend/lib/queries/product.ts 與
-- components/shop/GachaCollectionList.tsx 都是 .select('name')），
-- 所以只留識別用的四欄。
--
-- 後台不受影響：backend 一律走 getSupabaseAdmin()（service_role 繞過權限）。

REVOKE SELECT ON public.suppliers FROM anon, authenticated;

GRANT SELECT (id, name, is_active, is_platform) ON public.suppliers TO anon, authenticated;
