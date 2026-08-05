-- 470: 收回匿名金鑰的寫入權限
--
-- ── 問題 ──
-- 前後台的瀏覽器都用 anon key 連 Supabase，而那把金鑰是 NEXT_PUBLIC_ 開頭，
-- 公開在前台的 JS bundle 裡 —— 任何人打開 devtools 就拿得到。
--
-- 而 23 張表（STG 是 31 張）的 RLS 政策是 `ALL ... USING (true)`，
-- 也就是拿到那把金鑰的人可以：
--   * 改全站商品價格、刪光商品與品項
--   * 刪除廠商、改輪播圖、竄改文章
--   * （STG 更誇張）直接寫 admins / roles，自己開一個超級管理員帳號
--
-- STG 實測（用不存在的 id，沒動到真資料）：
--   匿名 PATCH  /products  → HTTP 200（允許）
--   匿名 DELETE /products  → HTTP 204（允許）
--   匿名 DELETE /suppliers → HTTP 204（允許）
--   匿名 PATCH  /banners   → HTTP 204（允許）
--
-- ── 改法 ──
-- 讀取照舊（前台要顯示商品），寫入一律收回給 service_role。
-- service_role 會繞過 RLS，所以後台的 getSupabaseAdmin() 不受影響 ——
-- 只要把「用瀏覽器 anon key 直接寫」的路徑改成後台 API 就行，那部分已經改完：
--   settings/rates、users、news、coupons、categories 五個頁面

-- ── 1. 純參考資料：前台要讀，但只有後台能寫 ──
DO $$
DECLARE
  t TEXT;
  -- 前台會讀的：保留匿名 SELECT
  read_public TEXT[] := ARRAY[
    'products', 'product_prizes', 'banners', 'categories',
    'module_settings', 'menu_products', 'suppliers', 'news'
  ];
  -- 前台不讀的：連讀都收掉
  admin_only TEXT[] := ARRAY[
    'tags', 'product_tag_links', 'slot_prizes',
    'product_ticket_plan', 'dev_logs'
  ];
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY read_public || admin_only LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      RAISE NOTICE '跳過不存在的表 %', t;
      CONTINUE;
    END IF;

    -- 先清掉所有 public 角色的政策，再依需要重建。
    -- 逐條 DROP 而不是 DISABLE RLS —— 關掉 RLS 等於門戶大開
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND 'public' = ANY(roles)
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF t = ANY(read_public) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        t || '_public_read', t);
    END IF;

    RAISE NOTICE '% → %', t, CASE WHEN t = ANY(read_public) THEN '匿名可讀、僅後台可寫' ELSE '僅後台可讀寫' END;
  END LOOP;
END $$;

-- ── 2. 玩家自己的資料：只能碰自己的那幾筆 ──
DO $$
DECLARE
  t TEXT;
  pol RECORD;
  -- 表名 → 對應到玩家的欄位
  owned TEXT[][] := ARRAY[
    ARRAY['notifications', 'user_id'],
    ARRAY['cs_tickets',    'user_id'],
    ARRAY['order_items',   NULL],      -- 沒有 user_id，由 orders 關聯；一律不給前台寫
    ARRAY['draw_records',  'user_id'],
    ARRAY['action_logs',   NULL],      -- 稽核軌跡，只有後台能寫
    ARRAY['user_events',   NULL],
    ARRAY['search_logs',   NULL],
    ARRAY['visit_logs',    NULL]
  ];
  i INT;
  col TEXT;
BEGIN
  FOR i IN 1 .. array_length(owned, 1) LOOP
    t   := owned[i][1];
    col := owned[i][2];

    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      CONTINUE;
    END IF;

    -- 只清掉「無條件」的政策。有 auth.uid() 條件的本來就是對的，留著
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND 'public' = ANY(roles)
        AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
        AND COALESCE(qual,'true')='true' AND COALESCE(with_check,'true')='true'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      RAISE NOTICE '% 移除無條件寫入政策 %', t, pol.policyname;
    END LOOP;

    -- 玩家真的需要自己寫的（通知已讀、開客服單），改成綁 auth.uid()
    IF col IS NOT NULL AND t IN ('notifications', 'cs_tickets') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = %I)',
        t || '_own_insert', t, col);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = %I) WITH CHECK (auth.uid() = %I)',
        t || '_own_update', t, col, col);
      RAISE NOTICE '% → 玩家只能寫自己的（%）', t, col;
    END IF;
  END LOOP;
END $$;

-- ── 3. STG 專屬的額外洞 ──
-- STG 比 PROD 多開了 admins / roles / coupons / small_items / users:INSERT。
-- admins 與 roles 全開等於任何人都能自己建一個超級管理員帳號。
DO $$
DECLARE
  t TEXT;
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['admins', 'roles', 'coupons', 'small_items', 'users'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      CONTINUE;
    END IF;
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND 'public' = ANY(roles)
        AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
        AND COALESCE(qual,'true')='true' AND COALESCE(with_check,'true')='true'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      RAISE NOTICE '% 移除無條件寫入政策 %', t, pol.policyname;
    END LOOP;
  END LOOP;
END $$;

-- ── 4. 前台的文章瀏覽數 ──
-- news 的匿名 UPDATE 收掉之後，前台的 view_count 累加就寫不進去了。
-- 開一支 SECURITY DEFINER 的函數，只讓它動 view_count 這一欄。
CREATE OR REPLACE FUNCTION public.increment_news_view(p_news_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE news SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_news_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_news_view(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.increment_news_view IS
  '前台文章瀏覽數 +1。news 的匿名 UPDATE 政策已收回（migration 470），改由這支代勞，避免整張表被開放寫入。';

-- ── 驗收 ──
SELECT '仍對匿名開放無條件寫入的表' AS 項目,
       COALESCE(string_agg(DISTINCT tablename, ', '), '無 ✓') AS 結果
FROM pg_policies
WHERE schemaname='public' AND cmd IN ('ALL','INSERT','UPDATE','DELETE') AND 'public' = ANY(roles)
  AND COALESCE(qual,'true')='true' AND COALESCE(with_check,'true')='true';
