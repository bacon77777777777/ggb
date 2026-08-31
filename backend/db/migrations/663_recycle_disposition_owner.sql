-- 663: 處置改成「負責方制」——誰的貨誰處理
--
-- 662 把「非平台廠商」一律自動標成已處理，前提是**只有平台看得到這頁**，
-- 意思是「平台沒事要做」。老闆 2026-08-31 決定開放廠商帳號看自己的回收品，
-- 這個預設就讓廠商永遠無事可做（一登入全部已經是已處理）。
--
-- 語意改成「負責方處理了沒」：
--   吉吉比的貨      → 平台負責（重組自製賞／進官方商城／報廢）→ 預設待處理
--   第三方廠商的貨  → 廠商自己負責（重組成一檔自製賞）        → 預設待處理
--   轉蛋／盒玩      → 回收後已還回原商品庫存，沒人要處理      → 自動已處理
--
-- 只有第三條保留自動標記。

CREATE OR REPLACE FUNCTION public.set_recycle_pool_initial_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT p.type INTO v_type FROM public.products p WHERE p.id = NEW.product_id;

  -- 轉蛋／盒玩回收時 remaining +1 已經回到原商品，之後還會再被抽走，
  -- 沒有任何人要對這件實體做什麼。其餘一律待處理，由負責方自己標。
  IF v_type IN ('gacha', 'blindbox') THEN
    NEW.status       := 'handled';
    NEW.handled_at   := now();
    NEW.handled_by   := 'system';
    NEW.handled_note := '轉蛋／盒玩回收後已還回原商品庫存，無須處置';
  END IF;

  RETURN NEW;
END;
$$;

-- 662 自動標掉的第三方廠商那批退回待處理（只退它自己標的，不動人工標記的）
UPDATE public.admin_recycle_pool
SET status       = 'pending',
    handled_at   = NULL,
    handled_by   = NULL,
    handled_note = NULL
WHERE status = 'handled'
  AND handled_by = 'system'
  AND handled_note = '非平台廠商，實體在廠商倉庫，平台無須處置';
