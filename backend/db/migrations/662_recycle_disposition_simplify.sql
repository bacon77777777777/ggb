-- 662: 回收品處置簡化成「待處理／已處理」，且非平台廠商自動視為已處理
--
-- 老闆 2026-08-31：
--   ①「回收紀錄不該有待處理這種狀態」—— 那頁是玩家已拿到退幣的完成式流水帳，
--     處置屬於「回收商品管理」的實體盤點。前台那一欄已移除。
--   ② 處置只要兩種：已處理／待處理（原本的「已再利用／已報廢」分不出實益，
--     真正要回答的只是「這批貨還要不要我們動手」）。
--   ③ 吉吉比以外的廠商預設顯示已處理 —— 實體本來就在廠商自己的倉庫，
--     平台沒有任何事情要做。
--
-- 為什麼順便把轉蛋／盒玩也標成已處理：那兩類回收後 remaining +1 直接回到原商品，
-- 設計上永遠不需要處置，卻佔了 PROD 1,918 筆待處理裡的 915 筆（48%），
-- 讓「待處理」這個數字整個失真。

-- ── 1. 允許 'handled' ──────────────────────────────────────────────
ALTER TABLE public.admin_recycle_pool
  DROP CONSTRAINT IF EXISTS admin_recycle_pool_status_check;

ALTER TABLE public.admin_recycle_pool
  ADD CONSTRAINT admin_recycle_pool_status_check
  CHECK (status IN ('pending', 'handled', 'reused', 'scrapped'));

COMMENT ON COLUMN public.admin_recycle_pool.status IS
  'pending 待處理（平台要動手）／handled 已處理。reused／scrapped 是 migration 617 的舊值，已不再寫入，保留只為不擋既有資料。';

-- ── 2. 新進的回收品：不需要平台處置的直接標 handled ────────────────
CREATE OR REPLACE FUNCTION public.set_recycle_pool_initial_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type        text;
  v_is_platform boolean;
BEGIN
  -- 只在沒有人明確指定狀態時才介入
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT p.type, COALESCE(s.is_platform, false)
    INTO v_type, v_is_platform
  FROM public.products p
  LEFT JOIN public.suppliers s ON s.id = p.supplier_id
  WHERE p.id = NEW.product_id;

  IF v_type IN ('gacha', 'blindbox') THEN
    NEW.status       := 'handled';
    NEW.handled_at   := now();
    NEW.handled_by   := 'system';
    NEW.handled_note := '轉蛋／盒玩回收後已還回原商品庫存，無須處置';
  ELSIF NOT v_is_platform THEN
    NEW.status       := 'handled';
    NEW.handled_at   := now();
    NEW.handled_by   := 'system';
    NEW.handled_note := '非平台廠商，實體在廠商倉庫，平台無須處置';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recycle_pool_initial_status ON public.admin_recycle_pool;
CREATE TRIGGER trg_recycle_pool_initial_status
  BEFORE INSERT ON public.admin_recycle_pool
  FOR EACH ROW EXECUTE FUNCTION public.set_recycle_pool_initial_status();

-- ── 3. 既有資料照同一條規則回填 ────────────────────────────────────
UPDATE public.admin_recycle_pool arp
SET status       = 'handled',
    handled_at   = COALESCE(arp.handled_at, now()),
    handled_by   = COALESCE(arp.handled_by, 'system'),
    handled_note = COALESCE(arp.handled_note, '轉蛋／盒玩回收後已還回原商品庫存，無須處置')
FROM public.products p
WHERE p.id = arp.product_id
  AND arp.status = 'pending'
  AND p.type IN ('gacha', 'blindbox');

UPDATE public.admin_recycle_pool arp
SET status       = 'handled',
    handled_at   = COALESCE(arp.handled_at, now()),
    handled_by   = COALESCE(arp.handled_by, 'system'),
    handled_note = COALESCE(arp.handled_note, '非平台廠商，實體在廠商倉庫，平台無須處置')
FROM public.products p
LEFT JOIN public.suppliers s ON s.id = p.supplier_id
WHERE p.id = arp.product_id
  AND arp.status = 'pending'
  AND p.type NOT IN ('gacha', 'blindbox')
  AND COALESCE(s.is_platform, false) = false;

-- 舊的 reused／scrapped 一律併進 handled（PROD／STG 目前都是 0 筆，寫著以防萬一）
UPDATE public.admin_recycle_pool
SET status = 'handled'
WHERE status IN ('reused', 'scrapped');

-- ── 4. 彙總改成 待處理／已處理 兩欄，另外給總件數 ──────────────────
--
-- 回傳欄位變了，CREATE OR REPLACE 換不掉，必須先 DROP。
DROP FUNCTION IF EXISTS public.recycle_inventory_summary(boolean, bigint);

CREATE FUNCTION public.recycle_inventory_summary(
  p_include_restocked boolean DEFAULT false,
  p_supplier_id       bigint  DEFAULT NULL
)
RETURNS TABLE (
  supplier_id        bigint,
  supplier_name      text,
  is_platform        boolean,
  product_id         bigint,
  product_name       text,
  product_type       text,
  product_prize_id   bigint,
  prize_name         text,
  prize_level        text,
  unit_price         numeric,
  qty_total          bigint,
  qty_pending        bigint,
  qty_handled        bigint,
  refund_cost        bigint,
  restocked          boolean,
  first_recycled_at  timestamptz,
  last_recycled_at   timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.supplier_id::bigint,
    COALESCE(s.name, '—')::text,
    COALESCE(s.is_platform, false),
    p.id::bigint,
    p.name::text,
    p.type::text,
    arp.product_prize_id::bigint,
    COALESCE(pp.name, arp.prize_name, '—')::text,
    COALESCE(pp.level, arp.prize_level, '—')::text,
    p.price,
    COUNT(*),
    COUNT(*) FILTER (WHERE arp.status = 'pending'),
    COUNT(*) FILTER (WHERE arp.status <> 'pending'),
    -- 平台為了收回這些實體付出去的退幣，談處置與調回收比例時的成本基準。
    -- 算全部而不是只算待處理 —— 已處理不代表那筆錢沒付出去。
    COALESCE(SUM(arp.recycle_value), 0)::bigint,
    (p.type IN ('gacha', 'blindbox')),
    MIN(arp.created_at),
    MAX(arp.created_at)
  FROM public.admin_recycle_pool arp
  JOIN public.products       p  ON p.id  = arp.product_id
  LEFT JOIN public.product_prizes pp ON pp.id = arp.product_prize_id
  LEFT JOIN public.suppliers s  ON s.id  = p.supplier_id
  LEFT JOIN public.users     u  ON u.id  = arp.user_id
  WHERE (u.is_bot IS NULL OR u.is_bot = false)
    AND (p_include_restocked OR p.type NOT IN ('gacha', 'blindbox'))
    AND (p_supplier_id IS NULL OR p.supplier_id = p_supplier_id)
  GROUP BY p.supplier_id, s.name, s.is_platform, p.id, p.name, p.type,
           arp.product_prize_id, pp.name, pp.level, arp.prize_name, arp.prize_level, p.price
  ORDER BY COUNT(*) FILTER (WHERE arp.status = 'pending') DESC, COUNT(*) DESC, p.name, 9;
$$;

COMMENT ON FUNCTION public.recycle_inventory_summary IS
  '回收品實體庫存彙總（後台「回收商品管理」）。排除轉蛋／盒玩 —— 那些回收後已還回原商品庫存，不在平台手上。';

GRANT EXECUTE ON FUNCTION public.recycle_inventory_summary(boolean, bigint) TO service_role;
