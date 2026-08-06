-- 487：合併重複的平台廠商，並讓它刪不掉
--
-- PROD 有兩筆「吉吉比」（id 2、3）。後台列表上兩筆長得一模一樣分不出來，
-- 而且刪不掉 —— 廠商的外鍵有四張表是擋住不給刪的
--（admins RESTRICT，settlement_snapshots / slot_machines / slot_themes NO ACTION），
-- 但刪除 API 只清 products 的關聯，也沒把錯誤往上報，所以按下去就是沒反應。
--
-- is_platform 這個旗標是 474 建的（決定誰拿得到機台的 CSV 範本）。
-- 這裡做兩件事：把重複的併回同一筆，然後讓那一筆刪不掉 ——
-- 平台自營的商品都掛在它底下，被刪掉會變成一堆沒有廠商的孤兒。

-- 保留哪一筆：以已經標記 is_platform 的那筆為準，不是以建立時間為準。
-- 旗標決定誰拿得到機台範本，搬動它等於默默改掉權限。
-- 都沒標記時才退回用最早建立的那筆。
DO $$
DECLARE
  v_keep bigint;
  v_dup  bigint;
BEGIN
  SELECT id INTO v_keep FROM public.suppliers
   WHERE name = '吉吉比'
   ORDER BY is_platform DESC, created_at, id
   LIMIT 1;

  IF v_keep IS NULL THEN
    RAISE NOTICE '這個環境沒有名為「吉吉比」的廠商，只補約束';
    RETURN;
  END IF;

  FOR v_dup IN
    SELECT id FROM public.suppliers WHERE name = '吉吉比' AND id <> v_keep
  LOOP
    -- 補齊保留那筆缺的聯絡資訊（重複的那筆可能才有填）
    UPDATE public.suppliers k SET
      tax_id          = COALESCE(NULLIF(k.tax_id, ''),          NULLIF(d.tax_id, '')),
      contact_name    = COALESCE(NULLIF(k.contact_name, ''),    NULLIF(d.contact_name, '')),
      contact_phone   = COALESCE(NULLIF(k.contact_phone, ''),   NULLIF(d.contact_phone, '')),
      contact_email   = COALESCE(NULLIF(k.contact_email, ''),   NULLIF(d.contact_email, '')),
      address         = COALESCE(NULLIF(k.address, ''),         NULLIF(d.address, '')),
      sender_name     = COALESCE(NULLIF(k.sender_name, ''),     NULLIF(d.sender_name, '')),
      sender_zip_code = COALESCE(NULLIF(k.sender_zip_code, ''), NULLIF(d.sender_zip_code, '')),
      sender_address  = COALESCE(NULLIF(k.sender_address, ''),  NULLIF(d.sender_address, ''))
    FROM public.suppliers d
    WHERE k.id = v_keep AND d.id = v_dup;

    -- 八張表全部指回保留的那一筆。少改一張就會在刪除時被外鍵擋下來
    UPDATE public.admins               SET supplier_id = v_keep WHERE supplier_id = v_dup;
    UPDATE public.products             SET supplier_id = v_keep WHERE supplier_id = v_dup;
    UPDATE public.orders               SET supplier_id = v_keep WHERE supplier_id = v_dup;
    UPDATE public.settlement_snapshots SET supplier_id = v_keep WHERE supplier_id = v_dup;
    UPDATE public.slot_machines        SET supplier_id = v_keep WHERE supplier_id = v_dup;
    UPDATE public.slot_prizes          SET supplier_id = v_keep WHERE supplier_id = v_dup;
    UPDATE public.slot_themes          SET supplier_id = v_keep WHERE supplier_id = v_dup;
    -- 匯入設定是每個廠商各自的欄位對應，併過去會撞 unique，直接刪掉
    DELETE FROM public.supplier_import_profiles WHERE supplier_id = v_dup;

    DELETE FROM public.suppliers WHERE id = v_dup;
    RAISE NOTICE '已把廠商 % 併入 %', v_dup, v_keep;
  END LOOP;

  UPDATE public.suppliers SET is_platform = true WHERE id = v_keep;
END $$;

-- 474 是用 `WHERE name = '吉吉比'` 標記的，名字重複時會標到好幾筆。
-- 補一個唯一索引，之後不會再長出第二個平台廠商。
-- 一定要在上面的合併之後才建，否則現有的重複資料會讓它建不起來
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_single_platform
  ON public.suppliers ((true)) WHERE is_platform;

COMMENT ON COLUMN public.suppliers.is_platform IS
  '平台自營廠商。可以使用機台（slot）等平台專屬品類；同時也代表不可刪除 —— 平台自營的商品都掛在它底下。';
