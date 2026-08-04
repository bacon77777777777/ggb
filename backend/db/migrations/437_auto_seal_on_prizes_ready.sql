-- 437: 自動封存從未成功過 —— 補上 product_prizes 這半邊的 trigger
--
-- 問題：436 之前的 trg_auto_seal_on_publish 只掛在 products，但封存的成立條件
-- 橫跨兩張表（商品已上架 in products、賞項清單完整 in product_prizes）。
-- 後台建立商品的實際寫入順序是：
--     INSERT products              ← trigger 觸發，此時該商品 0 個賞項 → 跳過
--     UPDATE products (product_code) ← 再次觸發，仍 0 個賞項 → 跳過
--     INSERT product_prizes         ← 賞項寫入，但 trigger 不在這張表 → 永不再觸發
-- 結果：STG / PROD 所有 ichiban/card/custom 商品 sealed_at 全為 NULL、
--       product_ticket_seals 全 0 筆，「開賣時公布的驗證碼」永遠是空的。
--
-- 修法：把判斷抽成共用函數，products 與 product_prizes 兩邊都掛 trigger，
--       誰讓條件最後成立、誰就負責封存；靠 NOT EXISTS(seals) 保證只封一次。
--
-- 安全性（已於 STG 交易內實測）：PostgreSQL 的 AFTER ROW trigger 排到「語句結束」
-- 才執行，故多列 INSERT 的每次觸發都看得到完整清單（實測 3 筆插入 → 三次都看到 3）。
-- 新增與編輯兩條路徑皆為多列 .insert()，不會封存到不完整的對照表。

BEGIN;

-- ── 共用判斷：條件齊備才封存，且對重複呼叫免疫 ───────────────────────────
CREATE OR REPLACE FUNCTION public.try_auto_seal(p_product_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM products
         WHERE id = p_product_id
           AND type IN ('ichiban', 'card', 'custom')
           AND is_active
     )
     -- 已封存就不再動：承諾值一旦公布，內容不可更改
     AND NOT EXISTS (SELECT 1 FROM product_ticket_seals WHERE product_id = p_product_id)
     -- 已經有人抽過就不能事後補封，否則「開賣前排定」的承諾是假的
     AND NOT EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id)
     AND EXISTS (SELECT 1 FROM product_prizes WHERE product_id = p_product_id AND total > 0)
  THEN
    PERFORM public.seal_product_tickets(p_product_id, NULL, 'auto:publish');
  END IF;
END $$;

-- ── products 側：上架動作讓條件成立時封存（沿用原本的 trigger 名稱）──────
CREATE OR REPLACE FUNCTION public.auto_seal_on_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.try_auto_seal(NEW.id);
  RETURN NEW;
END $$;

-- ── product_prizes 側：賞項寫入讓條件成立時封存（本次補上的那一半）──────
CREATE OR REPLACE FUNCTION public.auto_seal_on_prizes_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.try_auto_seal(NEW.product_id);
  RETURN NULL;   -- AFTER trigger，回傳值不影響結果
END $$;

DROP TRIGGER IF EXISTS trg_auto_seal_on_prizes ON public.product_prizes;
CREATE TRIGGER trg_auto_seal_on_prizes
  AFTER INSERT OR UPDATE ON public.product_prizes
  FOR EACH ROW EXECUTE FUNCTION public.auto_seal_on_prizes_ready();

COMMIT;
