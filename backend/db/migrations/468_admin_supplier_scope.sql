-- 468: 廠商帳號綁定到廠商，並修好廠商角色的權限字串
--
-- 上線後要開廠商帳號讓他們自己上架、看自己商品的進銷存。查下來有三個問題：
--
-- 1. `admins` 沒有 supplier_id —— 廠商帳號無從得知「他是哪一家」，
--    所以任何依廠商過濾的邏輯都寫不出來
--
-- 2. 104 支後台 API 沒有一支依登入者的廠商身份過濾資料。
--    middleware 只管頁面（它明確 skip `/api/`），API 層是裸的
--
-- 3. supplier 角色的權限字串是 {dashboard_view, products_manage, orders_manage}，
--    但 lib/permissionPaths.ts 比對的是 {dashboard, products, orders} —— 一個都對不上。
--    所以廠商現在登入會被踢到 /no-access。
--
-- 第 3 點讓現況「壞掉」而不是「外洩」，但只要有人把權限字串修對，
-- 在沒有第 1、2 點的情況下就會直接變成：廠商看得到也改得掉全站所有商品。
-- 所以三件事必須一起做，不能只修權限字串。

-- ── 1. 帳號綁廠商 ──
ALTER TABLE admins ADD COLUMN IF NOT EXISTS supplier_id BIGINT REFERENCES suppliers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_admins_supplier ON admins (supplier_id) WHERE supplier_id IS NOT NULL;

COMMENT ON COLUMN admins.supplier_id IS
  '廠商角色專用：這個帳號屬於哪一家廠商。非廠商角色為 NULL。所有資料查詢會依此限縮範圍。';

-- ── 2. 廠商角色必須綁廠商 ──
-- 沒綁的話 API 層拿不到範圍。程式端是「拿不到範圍就什麼都不給看」（fail closed），
-- 但那會變成帳號建好卻整個後台空白，很難查。在資料層直接擋掉，錯誤訊息才講得清楚。
CREATE OR REPLACE FUNCTION public.assert_supplier_admin_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT name INTO v_role FROM roles WHERE id = NEW.role_id;

  IF v_role = 'supplier' AND NEW.supplier_id IS NULL THEN
    RAISE EXCEPTION '廠商角色的帳號必須指定所屬廠商（supplier_id）';
  END IF;

  -- 反過來也要擋：非廠商角色綁了廠商，代表建帳號時選錯角色，
  -- 放著會讓人以為那個帳號有範圍限制，其實沒有
  IF v_role IS DISTINCT FROM 'supplier' AND NEW.supplier_id IS NOT NULL THEN
    RAISE EXCEPTION '只有廠商角色可以指定所屬廠商，此帳號角色為 %', COALESCE(v_role, '(未設定)');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_supplier_admin_scope ON admins;
CREATE TRIGGER trg_assert_supplier_admin_scope
  BEFORE INSERT OR UPDATE OF role_id, supplier_id ON admins
  FOR EACH ROW EXECUTE FUNCTION public.assert_supplier_admin_scope();

-- ── 3. 修好廠商角色的權限字串 ──
-- 對齊 lib/permissionPaths.ts 的詞彙。刻意只給三項：
--   products  自己的商品（上架、改價、改品項）
--   orders    含自己商品的訂單（出貨進度）
--   reports_products  進銷存
--
-- 不給 dashboard：營運總覽是全站數字（總營收、總會員數），那不是廠商該看的。
-- 不給 recharges / reports_settlement：儲值與對帳是平台的財務資料。
UPDATE roles
SET permissions = ARRAY['products', 'orders', 'reports_products'],
    description = '僅能管理自己供貨的商品、查看含自有商品的訂單與進銷存。看不到全站營運與財務資料。',
    updated_at  = now()
WHERE name = 'supplier';

SELECT name AS 角色, permissions AS 權限 FROM roles WHERE name = 'supplier';
SELECT count(*) AS 已綁廠商的帳號數 FROM admins WHERE supplier_id IS NOT NULL;
