-- 471: 補開沒啟用的 RLS，並用欄位級授權藏起三個秘密欄位
--
-- 470 只處理了「RLS 有開但政策寬鬆」的表。之後才發現還有兩類洞：
--
-- ── 洞一：RLS 根本沒啟用 ──
-- PROD 7 張、STG 25 張表的 relrowsecurity = false。
-- RLS 沒開的話，就算寫了政策也完全不會生效 —— STG 的 public.users 就是這樣：
-- 明明有 `auth.uid() = id` 的政策，實測用 anon key 打 REST API 照樣讀得到
-- 全站會員的 email 與代幣餘額。
--
-- STG 受影響的還有 refund_requests、settlement_snapshots（廠商月結）、
-- line_conversations（GB哥對話）、user_ip_log 等。
--
-- ── 洞二：SELECT 政策是整列開放，沒有欄位概念 ──
-- 470 給 products 加了 `FOR SELECT USING (true)`，那是整列 —— 包含：
--
--   seed         抽獎種子。commit-reveal 的秘密值。公開等於玩家可以預先算出
--                每一抽的結果，整套公平性設計失效（txid_hash 才是該公開的 commitment）
--   profit_rate  殺率。平台商業機密
--   cost         進貨成本。商業機密，廠商之間也不該互相看到
--
-- 實測 anon key 這三欄全讀得到。RLS 不做欄位過濾，要用 PostgreSQL 的
-- 欄位級 GRANT —— PostgREST 會遵守，選到沒授權的欄位直接 42501。
--
-- 副作用：`select('*')` 會展開成所有欄位，撞到沒授權的就整個查詢失敗。
-- 前台 10 處 `select('*')` 已改成明確欄位清單（lib/productColumns.ts）。
--
-- product_prizes.probability 刻意不擋 —— 轉蛋／盒玩是「每抽當下獨立隨機」，
-- 機率對玩家有意義，PrizeDetailSheet 本來就會顯示（籤號制才不顯示）。

-- ── 1. 補開 RLS ──
DO $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    n := n + 1;
    RAISE NOTICE '啟用 RLS: %', r.relname;
  END LOOP;
  RAISE NOTICE '共啟用 % 張表', n;
END $$;

-- ── 2. 前台真的需要讀寫的，補回政策 ──
-- 啟用 RLS 之後沒有政策 = 一列都讀不到。service_role 會繞過 RLS，
-- 所以後台不受影響；要補的只有前台會碰的表。
--
-- 全站掃過一遍，那批表裡前台只用到 cvs_pending_selections
-- （超商取貨的暫存選擇，2 處）。其餘（design_scan_*、agent_events、
-- line_conversations、competitor_*、settlement_snapshots…）前台完全不碰。

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cvs_pending_selections') THEN
    DROP POLICY IF EXISTS cvs_pending_own ON public.cvs_pending_selections;
    -- 這張表是取貨流程的暫存，用 token 當 key、沒有 user_id 欄位。
    -- 綁不了 auth.uid()，但內容只有門市代號與名稱（不含姓名電話地址），
    -- 而且 token 猜不到，所以維持可讀寫、僅限已登入者。
    CREATE POLICY cvs_pending_own ON public.cvs_pending_selections
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    RAISE NOTICE 'cvs_pending_selections → 僅限已登入者';
  END IF;

  -- 前台的機台主題（slot_themes / slot_theme_prizes）目前是後台在讀，
  -- 前台走 slot_machines。先只給讀，之後前台真要用再放寬。
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='slot_themes') THEN
    DROP POLICY IF EXISTS slot_themes_public_read ON public.slot_themes;
    CREATE POLICY slot_themes_public_read ON public.slot_themes
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='slot_theme_prizes') THEN
    DROP POLICY IF EXISTS slot_theme_prizes_public_read ON public.slot_theme_prizes;
    CREATE POLICY slot_theme_prizes_public_read ON public.slot_theme_prizes
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ── 3. 欄位級授權：藏起 seed / cost / profit_rate ──
DO $$
DECLARE
  cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products'
    AND column_name NOT IN ('seed', 'cost', 'profit_rate');

  EXECUTE 'REVOKE SELECT ON public.products FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.products TO anon, authenticated', cols);

  RAISE NOTICE 'products: 已撤回 seed / cost / profit_rate 的匿名讀取權';
END $$;

-- ── 驗收 ──
SELECT 'RLS 仍未啟用的表' AS 項目,
       COALESCE(string_agg(c.relname, ', ' ORDER BY c.relname), '無 ✓') AS 結果
FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
WHERE ns.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;

SELECT 'anon 讀得到 products 的秘密欄位' AS 項目,
       COALESCE(string_agg(column_name, ', '), '無 ✓') AS 結果
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='products' AND grantee='anon'
  AND privilege_type='SELECT' AND column_name IN ('seed', 'cost', 'profit_rate');
