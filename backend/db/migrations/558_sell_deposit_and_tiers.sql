-- 558_sell_deposit_and_tiers.sql
--
-- 玩家商城：運費、賣家等級、保證金。
--
-- ── 為什麼要做保證金 ──
-- migration 552 把玩家商城定成「平台完全不碰錢」，代價寫在它自己的註解裡：
-- 平台收不到錢就沒有籌碼，出事只能事後停權，買家的損失補不回來。
-- 557 的逾時規則也誠實承認這點 —— 待出貨逾時「只通知＋提示檢舉」，
-- 因為錢早就在賣家口袋，取消也拿不回來。
--
-- 保證金補的就是這個洞：賣家用 **G幣** 押一筆在平台，出貨完成就退，
-- 不出貨就賠給買家。押的是 G幣不是新台幣，所以平台仍然沒有代收代付
-- （當初砍掉 sell_escrow／藍新代收就是為了避開這件事），
-- 但手上終於有東西可以賠。
--
-- ── 收費時點（刻意這樣設計）──
--   上架       → 不收。上架要收錢會直接勸退賣家，而且沒賣掉也沒有風險
--   買家下單   → 從賣家 G幣扣起來鎖住
--   買家收貨   → 全額退還
--   賣家沒出貨 → 沒收，轉給買家
-- 運費不計入保證金基數：運費是成本不是價金，押它沒有意義。

BEGIN;

-- ============================================================
-- A. 運費
-- ============================================================
-- 原本整條商城沒有運費概念，買家結帳金額 = 單價 × 數量。
-- 賣家實際上都要寄東西，運費只能偷偷灌進售價，價格因此失真。

ALTER TABLE public.sell_listings
  ADD COLUMN IF NOT EXISTS shipping_fee int NOT NULL DEFAULT 60;

-- 訂單要留當下的運費快照 —— 賣家事後改運費不能動到已成立的訂單
ALTER TABLE public.sell_orders
  ADD COLUMN IF NOT EXISTS shipping_fee   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sell_listings.shipping_fee  IS '買家負擔的運費，0 = 賣家吸收（免運）';
COMMENT ON COLUMN public.sell_orders.shipping_fee    IS '下單當下的運費快照';
COMMENT ON COLUMN public.sell_orders.deposit_amount  IS '本筆訂單向賣家收取的保證金（G幣）';

-- ============================================================
-- B. 等級設定（放 platform_settings，老闆可自行調整）
-- ============================================================
-- 寫死在函式裡的話，每次調比例都要改 migration 再推版。
-- 這是營運參數不是程式邏輯，應該可以在後台改。

INSERT INTO public.platform_settings (key, value)
VALUES ('sell_tiers', '[
  {"k":3,"name":"金牌","ratio":30,"max_price":60000,"min_done":100,"min_rate":98,"cond":"≥100 單 · 成交率 ≥98%"},
  {"k":2,"name":"銀牌","ratio":60,"max_price":13000,"min_done":10,"min_rate":95,"cond":"≥10 單 · 成交率 ≥95%"},
  {"k":1,"name":"新手","ratio":100,"max_price":3000,"min_done":0,"min_rate":0,"cond":"完成 <10 單"}
]')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.platform_settings IS '平台設定。sell_tiers 為商城賣家等級（ratio 為保證金百分比，由高到低排列）';

-- ============================================================
-- C. 賣家統計
-- ============================================================
-- 用 view 即時算，不存 counter 欄位：counter 要靠 trigger 維護，
-- 一旦漏更新就會長期偏掉，而且對不回原始資料。商城單量不大，算得動。

CREATE OR REPLACE VIEW public.sell_seller_stats AS
SELECT
  u.id AS seller_id,
  COUNT(*) FILTER (WHERE o.step = 5 AND o.cancelled = false)                       AS done_count,
  COUNT(*) FILTER (WHERE o.cancelled = true AND o.cancel_reason = 'ship_timeout')  AS failed_count,
  -- 成交率＝完成 ÷（完成＋因賣家沒出貨而取消）。沒有任何紀錄時給 100，
  -- 新賣家不該一開始就頂著難看的數字
  CASE
    WHEN COUNT(*) FILTER (WHERE (o.step = 5 AND o.cancelled = false)
                             OR (o.cancelled = true AND o.cancel_reason = 'ship_timeout')) = 0 THEN 100
    ELSE ROUND(
      COUNT(*) FILTER (WHERE o.step = 5 AND o.cancelled = false)::numeric * 100
      / COUNT(*) FILTER (WHERE (o.step = 5 AND o.cancelled = false)
                            OR (o.cancelled = true AND o.cancel_reason = 'ship_timeout')), 1)
  END AS success_rate,
  -- 平均出貨時間（分鐘）：從賣家確認收款到按下出貨
  COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (o.shipped_at - o.seller_confirmed_at)) / 60)
           FILTER (WHERE o.shipped_at IS NOT NULL AND o.seller_confirmed_at IS NOT NULL))::int, 0) AS avg_ship_minutes
FROM public.users u
LEFT JOIN public.sell_orders o ON o.seller_id = u.id
GROUP BY u.id;

COMMENT ON VIEW public.sell_seller_stats IS '商城賣家即時統計（完成單數、成交率、平均出貨分鐘）';

-- ============================================================
-- D. 等級判定
-- ============================================================

CREATE OR REPLACE FUNCTION public.sell_seller_tier(p_seller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tiers jsonb;
  v_stat  RECORD;
  v_t     jsonb;
BEGIN
  SELECT COALESCE(value::jsonb, '[]'::jsonb) INTO v_tiers
  FROM public.platform_settings WHERE key = 'sell_tiers';

  SELECT done_count, success_rate INTO v_stat
  FROM public.sell_seller_stats WHERE seller_id = p_seller_id;

  -- 沒有任何訂單紀錄 → 當新手（陣列最後一筆）
  IF v_stat IS NULL THEN
    RETURN v_tiers -> (jsonb_array_length(v_tiers) - 1);
  END IF;

  -- 由高到低找第一個達標的
  FOR v_t IN SELECT * FROM jsonb_array_elements(v_tiers)
  LOOP
    IF v_stat.done_count >= COALESCE((v_t ->> 'min_done')::int, 0)
       AND v_stat.success_rate >= COALESCE((v_t ->> 'min_rate')::numeric, 0) THEN
      RETURN v_t;
    END IF;
  END LOOP;

  RETURN v_tiers -> (jsonb_array_length(v_tiers) - 1);
END;
$$;

-- 保證金金額：售價 × 比例，無條件進位。運費不計入
CREATE OR REPLACE FUNCTION public.sell_deposit_for(p_seller_id uuid, p_goods_amount int)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CEIL(p_goods_amount::numeric
              * COALESCE((public.sell_seller_tier(p_seller_id) ->> 'ratio')::numeric, 100)
              / 100)::int;
$$;

-- ============================================================
-- E. 保證金帳
-- ============================================================
-- 為什麼要獨立一張表而不是只靠 sell_orders.deposit_amount：
-- 金額要能對帳（誰押的、押多少、退了沒、賠給誰），
-- 而且退還與沒收都要留時間與原因，出爭議時這張表就是證據。

CREATE TABLE IF NOT EXISTS public.sell_deposits (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    bigint NOT NULL REFERENCES public.sell_orders(id) ON DELETE CASCADE,
  seller_id   uuid   NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  buyer_id    uuid   NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount      int    NOT NULL CHECK (amount >= 0),
  status      text   NOT NULL DEFAULT 'locked'
              CHECK (status IN ('locked','released','forfeited')),
  released_at timestamptz,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

-- 一筆訂單只會有一筆保證金，重複收就是 bug
CREATE UNIQUE INDEX IF NOT EXISTS sell_deposits_order_uniq ON public.sell_deposits(order_id);
CREATE INDEX IF NOT EXISTS sell_deposits_seller_idx ON public.sell_deposits(seller_id, status);

ALTER TABLE public.sell_deposits ENABLE ROW LEVEL SECURITY;

-- 買賣雙方都看得到自己那筆：買家要知道「這筆有押多少保障」
DROP POLICY IF EXISTS "Sell deposits - own read" ON public.sell_deposits;
CREATE POLICY "Sell deposits - own read" ON public.sell_deposits
  FOR SELECT USING (seller_id = auth.uid() OR buyer_id = auth.uid());

-- 寫入一律走 SECURITY DEFINER 函式，前台不給直接動
DROP POLICY IF EXISTS "Sell deposits - no client write" ON public.sell_deposits;

-- ============================================================
-- F. 收 / 退 / 賠
-- ============================================================
-- 三支都直接動 users.tokens 並寫 token_adjustments。
-- ⚠️ 不可以寫 recharge_records —— 那是 ECPay 對帳基礎（見 CLAUDE.md）。

-- 收：從賣家扣。餘額不足回 false，由呼叫端決定怎麼講
CREATE OR REPLACE FUNCTION public.sell_deposit_charge(
  p_order_id bigint, p_seller_id uuid, p_buyer_id uuid, p_amount int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_bal int;
BEGIN
  IF p_amount <= 0 THEN
    INSERT INTO public.sell_deposits (order_id, seller_id, buyer_id, amount, status)
    VALUES (p_order_id, p_seller_id, p_buyer_id, 0, 'released')
    ON CONFLICT (order_id) DO NOTHING;
    RETURN true;
  END IF;

  SELECT tokens INTO v_bal FROM public.users WHERE id = p_seller_id FOR UPDATE;
  IF COALESCE(v_bal, 0) < p_amount THEN
    RETURN false;
  END IF;

  UPDATE public.users SET tokens = tokens - p_amount WHERE id = p_seller_id;

  INSERT INTO public.token_adjustments (user_id, delta, reason, created_by)
  VALUES (p_seller_id, -p_amount, '商城保證金鎖定（訂單 #' || p_order_id || '）', 'system');

  INSERT INTO public.sell_deposits (order_id, seller_id, buyer_id, amount, status)
  VALUES (p_order_id, p_seller_id, p_buyer_id, p_amount, 'locked')
  ON CONFLICT (order_id) DO NOTHING;

  RETURN true;
END;
$$;

-- 退：還給賣家。只有 locked 能退，重複呼叫不會退兩次
CREATE OR REPLACE FUNCTION public.sell_deposit_release(p_order_id bigint, p_note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE d RECORD;
BEGIN
  SELECT * INTO d FROM public.sell_deposits
  WHERE order_id = p_order_id AND status = 'locked' FOR UPDATE;
  IF d IS NULL THEN RETURN false; END IF;

  UPDATE public.users SET tokens = tokens + d.amount WHERE id = d.seller_id;

  INSERT INTO public.token_adjustments (user_id, delta, reason, created_by)
  VALUES (d.seller_id, d.amount, '商城保證金退還（訂單 #' || p_order_id || '）', 'system');

  UPDATE public.sell_deposits
  SET status = 'released', released_at = NOW(), note = COALESCE(p_note, note)
  WHERE id = d.id;

  RETURN true;
END;
$$;

-- 賠：轉給買家。賣家的錢在下單時就扣掉了，這裡只是把它交出去
CREATE OR REPLACE FUNCTION public.sell_deposit_forfeit(p_order_id bigint, p_note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE d RECORD;
BEGIN
  SELECT * INTO d FROM public.sell_deposits
  WHERE order_id = p_order_id AND status = 'locked' FOR UPDATE;
  IF d IS NULL THEN RETURN false; END IF;

  IF d.amount > 0 THEN
    UPDATE public.users SET tokens = tokens + d.amount WHERE id = d.buyer_id;
    INSERT INTO public.token_adjustments (user_id, delta, reason, created_by)
    VALUES (d.buyer_id, d.amount, '商城賣家未出貨補償（訂單 #' || p_order_id || '）', 'system');
  END IF;

  UPDATE public.sell_deposits
  SET status = 'forfeited', released_at = NOW(),
      note = COALESCE(p_note, '賣家逾時未出貨')
  WHERE id = d.id;

  INSERT INTO public.notifications (user_id, type, title, body, link, meta)
  VALUES (d.buyer_id, 'sell_order', '商城訂單',
          '賣家逾時未出貨，已補償 ' || d.amount || ' G幣到你的帳戶',
          '/sell-orders/' || p_order_id::text,
          jsonb_build_object('order_id', p_order_id, 'compensation', d.amount));

  RETURN true;
END;
$$;

COMMIT;
