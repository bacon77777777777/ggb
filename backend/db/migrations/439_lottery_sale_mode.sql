-- 439: 抽卡新增「抽籤販售」模式
--
-- 玩法：0 元可抽，抽到才有資格買。中籤的品項在申請寄出時才付該品項的販售金額。
-- 沒中就是沒中，當場顯示落選、不進倉庫，但仍留抽獎紀錄（要能查誰抽過幾次）。
-- 中籤品項不可分解（本來就沒付錢，分解等於平白拿 G 幣），30 天內沒申請寄出就消失。
--
-- ── 為什麼不另開一個 type ──
-- 這是抽卡（card）底下的一種販售模式，不是新玩法類型。另開 type 會讓
-- 前台的 MACHINE_COMPONENTS、後台的模組設定、殺率頁、封存排籤全部要各加一份判斷。
-- 用 products.sale_mode 區分，其餘機制原封不動沿用。
--
-- ── 落選怎麼進封存表 ──
-- card 本來就走封存排籤（開賣前排定籤號）。落選籤用一個 level = '未中獎' 的
-- product_prizes 資料列表示，數量 = 總抽獎次數 − 各獎項數量加總。
-- 這樣封存、驗證、逐籤對照三套機制完全不用改，而且玩家在驗證頁看得到
-- 「這一檔 500 張裡有 460 張是未中獎」—— 對抽籤販售來說這反而是該公開的資訊。

BEGIN;

-- ── 商品欄位 ────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_mode TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS lottery_total_draws   INTEGER,
  ADD COLUMN IF NOT EXISTS lottery_per_user_draws INTEGER;

COMMENT ON COLUMN public.products.sale_mode IS
  'normal = 一般販售；lottery = 抽籤販售（0 元抽，中籤後寄出時才付款）';
COMMENT ON COLUMN public.products.lottery_total_draws IS
  '抽籤販售：整檔總抽獎次數（= 封存表的籤數）';
COMMENT ON COLUMN public.products.lottery_per_user_draws IS
  '抽籤販售：每個帳號最多可抽幾次';

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sale_mode_chk;
ALTER TABLE public.products ADD CONSTRAINT products_sale_mode_chk
  CHECK (sale_mode IN ('normal', 'lottery'));

-- 抽籤販售只給抽卡用，且兩個上限都必須設 —— 少設一個就等於沒有上限
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_lottery_cfg_chk;
ALTER TABLE public.products ADD CONSTRAINT products_lottery_cfg_chk
  CHECK (
    sale_mode <> 'lottery' OR (
      type = 'card'
      AND lottery_total_draws    IS NOT NULL AND lottery_total_draws    > 0
      AND lottery_per_user_draws IS NOT NULL AND lottery_per_user_draws > 0
    )
  );

-- ── 品項販售金額 ────────────────────────────────────────────────────────
ALTER TABLE public.product_prizes
  ADD COLUMN IF NOT EXISTS sale_price INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.product_prizes.sale_price IS
  '抽籤販售：中籤後申請寄出時要付的金額（G幣）。一般販售不使用。';

-- ── 中籤品項的保留期限 ──────────────────────────────────────────────────
ALTER TABLE public.draw_records
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
COMMENT ON COLUMN public.draw_records.expires_at IS
  '抽籤販售中籤品項的保留到期時間。逾期未申請寄出就失效（0 元抽來的，不退幣）。';

CREATE INDEX IF NOT EXISTS idx_draw_records_expires
  ON public.draw_records(expires_at) WHERE expires_at IS NOT NULL;

-- 落選紀錄：不進倉庫但要留存
-- status 沿用既有欄位，多一個值 'lost'（既有值：in_warehouse / pending_delivery
-- / shipped / dismantled / coin_return，倉庫查詢一律只看 in_warehouse，所以不會漏出去）

COMMIT;
