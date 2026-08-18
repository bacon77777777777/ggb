-- 582_token_adjustments_category.sql
--
-- token_adjustments 加分類欄 category —— 給會計對帳／報稅用。
--
-- 之前這張表只有 delta／自由文字 reason／created_by，GB哥補幣、會員頁直接改代幣、
-- 出貨運費扣款、商城保證金、交易所買賣、直撃 RUSH 全混在 token_ledger 的 `manual` 一桶，
-- 會計師只能靠 reason 文字人工分。現在：
--
--   1. 加 category 欄（CHECK 限定值）
--   2. classify_token_adjustment(created_by, reason)：照既有每條寫入路徑的前綴分類
--      （每條前綴都不同，可確定性回填）
--   3. BEFORE INSERT trigger：程式沒帶 category 時自動套同一套規則
--      —— 8 支寫這張表的 DB 函數（buy_listing／create_delivery_order／enter_slot_rush_direct／
--      sell_*）不用逐支改；程式端明確帶 category 的以程式為準
--   4. 回填舊資料
--
-- 分類值：
--   real_payment  實收（銀行轉帳／現金／LINE Pay 手動入帳；本次起停用，僅保留舊資料）
--   marketing     行銷贈點／補償（GB哥補幣預設）
--   correction    帳務更正（後台直接改代幣數字、GB哥修正錯帳）
--   internal      內部測試／自用（新增會員初始代幣、內部帳號）
--   shipping_fee  出貨運費扣款
--   sell          商城（廣告／保證金鎖定／退還／賣家未出貨補償／官方認證月費）
--   marketplace   交易所買賣
--   slot          挑戰機台（直撃 RUSH）
--   other         其他（分不出來的保底，報表上會醒目標示）

BEGIN;

ALTER TABLE public.token_adjustments ADD COLUMN IF NOT EXISTS category text;

CREATE OR REPLACE FUNCTION public.classify_token_adjustment(p_created_by text, p_reason text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_created_by = 'marketplace' OR p_reason LIKE '交易所%'                      THEN 'marketplace'
    WHEN p_created_by = 'system:delivery' OR p_reason LIKE '出貨運費%'               THEN 'shipping_fee'
    WHEN p_created_by = 'system_direct_rush' OR p_reason LIKE '直撃進入 RUSH%'        THEN 'slot'
    WHEN p_reason LIKE '商城%'                                                        THEN 'sell'
    WHEN p_reason ~ '^(manual_transfer|cash|line_pay)(：|:|$)'                        THEN 'real_payment'
    WHEN p_reason LIKE '%新增會員時給的初始代幣%'                                       THEN 'internal'
    WHEN p_reason LIKE '後台編輯會員直接調整代幣%' OR p_reason LIKE '帳務更正%'          THEN 'correction'
    WHEN p_created_by = 'GB哥' OR p_created_by LIKE 'admin#%'                         THEN 'marketing'
    ELSE 'other'
  END
$$;

COMMENT ON FUNCTION public.classify_token_adjustment(text, text) IS
  'token_adjustments 分類規則：照 created_by 與 reason 前綴判斷 category。trigger 與回填共用';

CREATE OR REPLACE FUNCTION public.trg_token_adjustments_set_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.category IS NULL OR NEW.category = '' THEN
    NEW.category := public.classify_token_adjustment(NEW.created_by, NEW.reason);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_token_adjustments_set_category ON public.token_adjustments;
CREATE TRIGGER trg_token_adjustments_set_category
  BEFORE INSERT ON public.token_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.trg_token_adjustments_set_category();

-- 回填
UPDATE public.token_adjustments
SET category = public.classify_token_adjustment(created_by, reason)
WHERE category IS NULL OR category = '';

ALTER TABLE public.token_adjustments
  DROP CONSTRAINT IF EXISTS token_adjustments_category_check;
ALTER TABLE public.token_adjustments
  ADD CONSTRAINT token_adjustments_category_check
  CHECK (category IN ('real_payment','marketing','correction','internal',
                      'shipping_fee','sell','marketplace','slot','other'));
ALTER TABLE public.token_adjustments ALTER COLUMN category SET NOT NULL;

CREATE INDEX IF NOT EXISTS token_adjustments_category_idx ON public.token_adjustments (category);

COMMENT ON COLUMN public.token_adjustments.category IS
  '會計分類：real_payment 實收｜marketing 行銷／補償｜correction 帳務更正｜internal 內部測試｜shipping_fee 運費｜sell 商城｜marketplace 交易所｜slot 機台｜other';

COMMIT;
