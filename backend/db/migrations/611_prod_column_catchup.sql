-- 611: PROD 缺欄位補課（老闆 2026-08-24：宅配點確認支付還是報錯）
--
-- 真因：**PROD 的 `orders` 表沒有 `shipping_fee` 欄位**，而 `create_delivery_order()`
-- 的 INSERT 會寫它 → 每一筆宅配／超商申請都在最後一步炸掉：
--   ERROR: column "shipping_fee" of relation "orders" does not exist
-- 這跟 605／606 無關（PROD 的函數本體與 STG md5 相同，一直都在寫這個欄位），
-- 也就是說**宅配從 425/426 那批上線以來在 PROD 就沒成功過**。
--
-- ⚠️ 教訓：做 605 函數補課時我寫「表結構兩邊本來就一致」，那句沒有驗證過。
-- 這次對 information_schema.columns 做了欄位級 diff，找出 22 個 STG 有、PROD 沒有的欄位，
-- 全部照 STG 的定義補上（型別／預設／可空一致）。純 ADD COLUMN IF NOT EXISTS，不動既有資料。
-- 另有 18 個欄位只是型別寫法不同（text vs varchar、numeric vs integer）——無害，不動。
-- `small_items.id` 在 PROD 是 bigint、STG 是 uuid，是真正的結構差異，**刻意不碰**
-- （改主鍵型別風險遠大於收益，那張表兩邊各自運作正常）。
--
-- 影響到的功能（PROD 上原本都是壞的或不完整）：
--   orders.shipping_fee / updated_at        → 宅配、超商申請整條流程
--   users.cvs_*（5 個）                      → 會員的「常用超商門市」預填
--   exchange_orders.*（6 個）                → 卡片交換的評價、收貨備註、物流單號
--   user_coupons.expiry_reminder_sent        → 折價券到期提醒（重複寄信防護）
--   search_logs.user_id / metadata           → 搜尋紀錄的來源標記
--   small_items.category / description / level → 小物管理欄位
--   products.start_time / end_time / release_date → 舊的檔期欄位（保留一致）

ALTER TABLE public.orders          ADD COLUMN IF NOT EXISTS shipping_fee integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders          ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.users           ADD COLUMN IF NOT EXISTS cvs_store_id text;
ALTER TABLE public.users           ADD COLUMN IF NOT EXISTS cvs_store_name text;
ALTER TABLE public.users           ADD COLUMN IF NOT EXISTS cvs_store_address text;
ALTER TABLE public.users           ADD COLUMN IF NOT EXISTS cvs_recipient_name text;
ALTER TABLE public.users           ADD COLUMN IF NOT EXISTS cvs_recipient_phone text;

ALTER TABLE public.exchange_orders ADD COLUMN IF NOT EXISTS tracking_number text;
ALTER TABLE public.exchange_orders ADD COLUMN IF NOT EXISTS receipt_action text;
ALTER TABLE public.exchange_orders ADD COLUMN IF NOT EXISTS receipt_note text;
ALTER TABLE public.exchange_orders ADD COLUMN IF NOT EXISTS rating_stars smallint;
ALTER TABLE public.exchange_orders ADD COLUMN IF NOT EXISTS rating_comment text;
ALTER TABLE public.exchange_orders ADD COLUMN IF NOT EXISTS rating_submitted boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_coupons    ADD COLUMN IF NOT EXISTS expiry_reminder_sent boolean DEFAULT false;

ALTER TABLE public.search_logs     ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.search_logs     ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.small_items     ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.small_items     ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.small_items     ADD COLUMN IF NOT EXISTS level text;

ALTER TABLE public.products        ADD COLUMN IF NOT EXISTS start_time timestamptz;
ALTER TABLE public.products        ADD COLUMN IF NOT EXISTS end_time timestamptz;
ALTER TABLE public.products        ADD COLUMN IF NOT EXISTS release_date text;

-- 新欄位要補逐欄授權：products／users 對 anon 是白名單制（見 604 的教訓，
-- 漏授權會讓前台整個 select 被拒），但這幾個都不是公開欄位，故只給 service_role 用。
-- users.cvs_* 由前台以登入身分讀寫自己的那一列（RLS 已限定 auth.uid() = id）。
GRANT SELECT, UPDATE (cvs_store_id, cvs_store_name, cvs_store_address, cvs_recipient_name, cvs_recipient_phone)
  ON public.users TO authenticated;
