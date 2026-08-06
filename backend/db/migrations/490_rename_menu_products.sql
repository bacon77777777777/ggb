-- 490：menu_products → product_categories
--
-- 這張表原本叫「菜單」，後來 UI 改名成「分類」，但資料層沒跟著改：
-- 資料表叫 menu_products、欄位叫 menu_id，可是它連的是 categories 表。
-- 讀 code 的人得先知道「menu 就是 category」才看得懂，而後台的錯誤訊息
-- 到現在還在講「此菜單下仍有 N 個商品」。
--
-- ── 為什麼留一個同名的 view ──
-- migration 是我手動跑的，程式碼是 git push 之後才部署，中間有一段時間
-- 舊程式會打到已經改名的表。留一個 menu_products 的 view 把那段時間補起來，
-- 等程式部署完再用另一支 migration 拿掉。
-- 單純投影的 view 在 Postgres 是可寫的，所以舊程式的 insert / delete 照樣有效。

ALTER TABLE IF EXISTS public.menu_products RENAME TO product_categories;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_categories' AND column_name = 'menu_id'
  ) THEN
    ALTER TABLE public.product_categories RENAME COLUMN menu_id TO category_id;
  END IF;
END $$;

COMMENT ON TABLE public.product_categories IS
  '商品與分類的關聯（多對多）。category_id 對到 categories，決定商品出現在首頁哪個自訂分類頁籤下。';

CREATE OR REPLACE VIEW public.menu_products AS
SELECT category_id AS menu_id, product_id, sort_order, created_at
FROM public.product_categories;

COMMENT ON VIEW public.menu_products IS
  '過渡用的相容 view（migration 490）。程式全部改用 product_categories 之後可以拿掉。';

-- 前台要讀關聯才知道某個分類頁籤底下有哪些商品
GRANT SELECT ON public.product_categories TO anon, authenticated;
GRANT SELECT ON public.menu_products      TO anon, authenticated;
