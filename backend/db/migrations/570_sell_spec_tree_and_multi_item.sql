-- 570_sell_spec_tree_and_multi_item.sql
--
-- 商城接線第一批：資料模型（對齊 v3 定版原型）。
-- 見 frontend/app/sell/proto/ROADMAP.md「接線順序 → 第一批」。
--
-- 五件事：
--   A. 兩層規格樹（賞等／尺寸 → 品項）
--   B. 一單多商品（sell_order_items 明細表）
--   C. 收款方式改複選
--   D. 保證金改用「成交小計」而不是單一最低價
--   E. 商品狀態（未拆／近全新／已拆封）
--
-- ⚠️ 這支會改 sell_listings.items 的形狀，create_sell_order 也要跟著換定位方式，
-- 所以資料轉換與函式改寫必須在同一個 migration 裡，中間不能有可被呼叫的空窗。

BEGIN;

-- ============================================================
-- A. 兩層規格樹
-- ============================================================
--
-- 原型的形狀（mall.ts 的 skus()／minP()／totQ() 都吃這個）：
--   {"n":"賞等","o":[{"v":"A賞","items":[{"n":"索隆","p":2680,"q":1,"img":"…"}]}]}
--     n = 規格群組名稱（賞等／尺寸／口味）
--     o = 選項陣列，v = 選項名（A賞）
--     items = 該選項底下的實際品項，p 價格、q 數量、img 圖
--
-- 舊形狀是扁平的 [{name,price,quantity,image}]，沒有群組概念。
-- 轉換方式：整批包成單一群組「規格」，欄位改成原型的短鍵，
-- 這樣舊資料在新引擎裡照樣顯示得出來（單一群組＝原型的無 specs 情境）。

ALTER TABLE public.sell_listings
  ADD COLUMN IF NOT EXISTS specs jsonb;

COMMENT ON COLUMN public.sell_listings.specs IS
  '兩層規格樹 {n,o:[{v,items:[{n,p,q,img}]}]}。null = 單一規格，價格看 price、庫存看 items';

UPDATE public.sell_listings
SET specs = jsonb_build_object(
      'n', '規格',
      'o', jsonb_build_array(jsonb_build_object(
             'v', '標準',
             'items', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'n', COALESCE(e->>'name', '標準款'),
                        'p', COALESCE(NULLIF(e->>'price','')::int, price, 0),
                        'q', COALESCE(NULLIF(e->>'quantity','')::int, 0),
                        'img', COALESCE(e->>'image', '')
                      ))
               FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) e
             ), '[]'::jsonb)
           ))
    )
WHERE specs IS NULL
  AND jsonb_typeof(COALESCE(items, '[]'::jsonb)) = 'array'
  AND jsonb_array_length(COALESCE(items, '[]'::jsonb)) > 0;

-- 規格樹的合計庫存與最低價，給列表卡與守則用（避免每次都在 SQL 裡展開）
CREATE OR REPLACE FUNCTION public.sell_spec_stock(p_specs jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(SUM(COALESCE(NULLIF(i->>'q','')::int, 0)), 0)::int
  FROM jsonb_array_elements(COALESCE(p_specs->'o', '[]'::jsonb)) o,
       jsonb_array_elements(COALESCE(o->'items', '[]'::jsonb)) i;
$$;

CREATE OR REPLACE FUNCTION public.sell_spec_min_price(p_specs jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(MIN(COALESCE(NULLIF(i->>'p','')::int, 0)), 0)::int
  FROM jsonb_array_elements(COALESCE(p_specs->'o', '[]'::jsonb)) o,
       jsonb_array_elements(COALESCE(o->'items', '[]'::jsonb)) i
  WHERE COALESCE(NULLIF(i->>'p','')::int, 0) > 0;
$$;

-- ============================================================
-- B. 一單多商品
-- ============================================================
--
-- 購物車合併結帳：一張訂單可以有多個賣場？不行 —— 平台不碰錢，
-- 買家是直接匯款給賣家，跨賣家合併結帳會變成一次匯款要拆給多人。
-- 所以「一單多商品」限定**同一個賣家**的多件商品（原型的購物車也是照賣場分組結帳）。

CREATE TABLE IF NOT EXISTS public.sell_order_items (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    bigint NOT NULL REFERENCES public.sell_orders(id) ON DELETE CASCADE,
  listing_id  bigint NOT NULL REFERENCES public.sell_listings(id),
  group_index int    NOT NULL DEFAULT 0,   -- specs.o 的索引
  item_index  int    NOT NULL DEFAULT 0,   -- specs.o[g].items 的索引
  spec_label  text,                        -- 下單當下的規格文字快照（A賞 / 索隆）
  title       text,                        -- 商品名快照
  image       text,
  unit_price  int    NOT NULL CHECK (unit_price >= 0),
  quantity    int    NOT NULL CHECK (quantity > 0),
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sell_order_items_order_idx ON public.sell_order_items(order_id);
CREATE INDEX IF NOT EXISTS sell_order_items_listing_idx ON public.sell_order_items(listing_id);

ALTER TABLE public.sell_order_items ENABLE ROW LEVEL SECURITY;

-- 買賣雙方看得到自己那張單的明細
DROP POLICY IF EXISTS "Sell order items - own read" ON public.sell_order_items;
CREATE POLICY "Sell order items - own read" ON public.sell_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sell_orders o
      WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

-- 訂單本身也要記合計（明細加總 + 運費），避免每次都 join 算一次
ALTER TABLE public.sell_orders
  ADD COLUMN IF NOT EXISTS goods_amount int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sell_orders.goods_amount IS '成交小計（明細加總，不含運費）';
COMMENT ON COLUMN public.sell_orders.total_amount IS '買家應付＝成交小計＋運費';

-- 既有訂單補值（單商品時代：unit_price × quantity）
UPDATE public.sell_orders
SET goods_amount = unit_price * quantity,
    total_amount = unit_price * quantity + COALESCE(shipping_fee, 0)
WHERE goods_amount = 0;

-- 既有訂單補一筆明細，讓新舊訂單在前台是同一種形狀
INSERT INTO public.sell_order_items (order_id, listing_id, group_index, item_index, spec_label, title, image, unit_price, quantity)
SELECT o.id, o.listing_id, 0, COALESCE(o.item_index, 0), NULL,
       l.title,
       COALESCE((l.images)[1], ''),
       o.unit_price, o.quantity
FROM public.sell_orders o
JOIN public.sell_listings l ON l.id = o.listing_id
WHERE NOT EXISTS (SELECT 1 FROM public.sell_order_items i WHERE i.order_id = o.id);

-- ============================================================
-- C. 收款方式複選
-- ============================================================
--
-- ⚠️ 這是對 migration 552 的**刻意反轉**。552 當時定成單選（賣家選一種、
-- 買家不能挑），理由是「賣家就想要特定一種收款方式」。
-- v3 原型改成賣家可以同時開銀行轉帳與 LINE Pay、由買家在下單時選，
-- 老闆已確認（ROADMAP 商業規則第 6 條）。
--
-- payout_method 保留不刪：它是既有 create_sell_order 與後台在讀的欄位，
-- 改成「主要方式」，多選存在 payout_methods。兩者由 trigger 保持同步，
-- 避免任何一邊漏改就出現「明明開了 LINE Pay 卻不能選」。

ALTER TABLE public.sell_seller_profiles
  ADD COLUMN IF NOT EXISTS payout_methods text[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN public.sell_seller_profiles.payout_methods IS
  '啟用的收款方式（bank/linepay），至少一種。payout_method 是其中的主要方式，兩者由 trigger 同步';

UPDATE public.sell_seller_profiles
SET payout_methods = ARRAY[COALESCE(payout_method, 'bank')]
WHERE cardinality(payout_methods) = 0;

CREATE OR REPLACE FUNCTION public.sell_sync_payout_methods()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 一種都沒開 → 退回單選那個值，不允許空集合（空的話買家沒地方付錢）
  IF NEW.payout_methods IS NULL OR cardinality(NEW.payout_methods) = 0 THEN
    NEW.payout_methods := ARRAY[COALESCE(NEW.payout_method, 'bank')];
  END IF;

  -- 主要方式必須在複選清單內，否則下單會選到沒開的方式
  IF NEW.payout_method IS NULL OR NOT (NEW.payout_method = ANY (NEW.payout_methods)) THEN
    NEW.payout_method := NEW.payout_methods[1];
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sell_sync_payout_methods ON public.sell_seller_profiles;
CREATE TRIGGER trg_sell_sync_payout_methods
  BEFORE INSERT OR UPDATE ON public.sell_seller_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sell_sync_payout_methods();

-- ============================================================
-- D. 商品狀態
-- ============================================================
-- 原型的商品卡與詳情都有「未拆／近全新／已拆封」，DB 一直沒有這個欄位。

ALTER TABLE public.sell_listings
  ADD COLUMN IF NOT EXISTS condition text;

ALTER TABLE public.sell_listings DROP CONSTRAINT IF EXISTS sell_listings_condition_check;
ALTER TABLE public.sell_listings
  ADD CONSTRAINT sell_listings_condition_check
  CHECK (condition IS NULL OR condition IN ('未拆','近全新','已拆封'));

COMMENT ON COLUMN public.sell_listings.condition IS '商品狀態：未拆／近全新／已拆封。官方商品留 null';

COMMIT;
