-- 666: 抽卡不再分「單抽／卡包」兩種模式（老闆 2026-09-01）
--
-- 原本的兩種模式其實是同一件事：都是「開一包卡」，差別只有一包裝幾張。
-- 抽獎引擎早就證明了這點 —— play_ichiban_auto 的整包分支代進「每包 1 張」，
-- 就完全等於單抽分支（第 k 包 = 籤位 k，隨機挑沒被動過的包 = 隨機挑沒抽走的籤）。
--
-- 所以模式這個概念整個拿掉，只留兩個獨立的設定：
--   ・一包幾張（1／3／5／10）
--   ・抽獎模組（三種都能選）
--   ・卡包樣式（內建五款／自訂上傳）
--
-- ⚠️ 引擎那支 RPC 的 IF v_per_pack = 1 分支**沒有動**：它是內部最佳化，
--    兩條路徑數學上等價，為了純整理去動公平性核心不划算。

-- ── 1. 「單抽不可用撕開封口」的限制拿掉 ────────────────────────
-- 撕開封口對一張的包是跑得動的（前台 packSize=1 → 那張就是壓軸），
-- 演出就是「撕開包、翻出唯一那張」，本來就沒有不能用的理由。
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_card_mode_module_check;

-- ── 2. 一包幾張只給四種 ──────────────────────────────────────
-- 老闆指定 1／3／5／10。NULL 等同 1（舊資料沒填的那些）。
-- 現況確認過：兩個環境都只有 1 與 10，沒有會被擋下來的列。
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_cards_per_pack_check;
ALTER TABLE products ADD CONSTRAINT products_cards_per_pack_check
  CHECK (cards_per_pack IS NULL OR cards_per_pack IN (1, 3, 5, 10));

-- ── 3. 卡包樣式：內建五款／自訂上傳 ──────────────────────────
-- 以前是靠「模式」決定：單抽一律內建五款、卡包一律用商品自己的圖。
-- 模式沒了之後改成明講的欄位，而不是「有沒有上傳圖」去猜 ——
-- 猜的話，上傳完想換回內建就只能把圖刪掉，很難用。
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_style TEXT NOT NULL DEFAULT 'builtin';
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_pack_style_check;
ALTER TABLE products ADD CONSTRAINT products_pack_style_check
  CHECK (pack_style IN ('builtin', 'custom'));

COMMENT ON COLUMN products.pack_style IS
  '商品頁上半部那個卡包的外觀：builtin=內建五款輪流、custom=用 pack_front/back_image_url';

-- ⚠️ products 的 SELECT 是**逐欄授權**（anon／authenticated 各拿 51 欄，不是整張表），
--    所以新欄位一定要自己補 GRANT。少了這一行，前台只要把它放進查詢欄位清單，
--    整張 products 就會回 `42501 permission denied for table products` ——
--    不是少一個欄位，是**每一個商品頁與商品列表都掛掉**。
--    （這次就是實測前台才抓到的，加欄位時很容易漏。）
GRANT SELECT (pack_style) ON public.products TO anon, authenticated;

-- 已經上傳過卡包圖的（＝舊的卡包模式商品）就是自訂
UPDATE products
   SET pack_style = 'custom'
 WHERE type = 'card'
   AND pack_front_image_url IS NOT NULL
   AND pack_style <> 'custom';

-- ── 4. 封存之後不准再改一包幾張 ──────────────────────────────
-- 包的定義是「籤位 (k-1)*N+1 … k*N」，而每個籤位開出什麼在封存表裡就固定了。
-- 上架後改 N 會做兩件壞事：
--   ① 重新分組 → 「第 37 包裝了哪十張」跟開賣前公告的不一樣，公平性驗證失效
--   ② 已經抽走的籤會散落在新的分組裡，含它的那幾包永遠賣不掉
-- guard_sealed_product 只掛在 product_prizes（擋賞項異動），擋不到這裡。
CREATE OR REPLACE FUNCTION public.guard_sealed_pack_size()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.cards_per_pack, 1) IS DISTINCT FROM COALESCE(OLD.cards_per_pack, 1)
     AND EXISTS (SELECT 1 FROM public.product_ticket_seals WHERE product_id = NEW.id)
  THEN
    RAISE EXCEPTION 'PRODUCT_SEALED: 此商品已封存排籤，「一包幾張」不可再異動（包的分組與籤號綁在一起）';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sealed_pack_size ON products;
CREATE TRIGGER trg_guard_sealed_pack_size
  BEFORE UPDATE OF cards_per_pack ON products
  FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_pack_size();

-- ── 5. 全站預設模組合併成一列 ────────────────────────────────
-- 以前是 card（單抽預設）與 card_pack_mode（卡包預設）兩列，模式沒了就只剩一列。
-- 老闆指定預設用「撕開封口」。
-- ⚠️ 這會改到現有商品：沒有個別指定模組的抽卡商品會從原本的預設換成撕開封口。
DELETE FROM module_settings WHERE product_type = 'card_pack_mode';

INSERT INTO module_settings (product_type, machine_theme, updated_at)
VALUES ('card', 'card_peel', now())
ON CONFLICT (product_type)
DO UPDATE SET machine_theme = 'card_peel', updated_at = now();
