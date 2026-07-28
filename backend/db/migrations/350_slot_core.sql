-- Migration 350: 挑戰機台核心架構
-- slot_machines / slot_pool_items / slot_sessions + 吉吉比廠商 seed

-- ──────────────────────────────────────────────
-- 1. slot_machines — 機台設定
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.slot_machines (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  image_url       TEXT,
  price_per_spin  INT  NOT NULL DEFAULT 100,        -- 每次挑戰消耗 G幣
  trigger_rate    NUMERIC(5,4) NOT NULL DEFAULT 0.15, -- 觸發 RUSH 機率（正常模式）
  continue_rate   NUMERIC(5,4) NOT NULL DEFAULT 0.60, -- RUSH 延續機率
  min_rush_hits   INT  NOT NULL DEFAULT 3,           -- RUSH 最少連中次數
  floor_spin_count INT NOT NULL DEFAULT 30,          -- 連續未觸發 RUSH 後保底
  is_active       BOOL NOT NULL DEFAULT TRUE,
  supplier_id     BIGINT REFERENCES public.suppliers(id),
  sort_order      INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- 2. slot_pool_items — 獎池品項
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.slot_pool_items (
  id                BIGSERIAL PRIMARY KEY,
  machine_id        BIGINT NOT NULL REFERENCES public.slot_machines(id) ON DELETE CASCADE,
  product_prize_id  BIGINT NOT NULL REFERENCES public.product_prizes(id),
  weight            INT  NOT NULL DEFAULT 100,   -- 相對權重（越大越容易出現）
  is_floor          BOOL NOT NULL DEFAULT FALSE, -- true = 保底品，不計入一般抽選
  rush_only         BOOL NOT NULL DEFAULT FALSE, -- 僅 RUSH 模式可抽到
  normal_only       BOOL NOT NULL DEFAULT FALSE, -- 僅正常模式可抽到
  remaining         INT  NULL,                   -- NULL = 無限庫存
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slot_pool_items_machine ON public.slot_pool_items (machine_id);
CREATE INDEX IF NOT EXISTS idx_slot_pool_items_floor   ON public.slot_pool_items (machine_id, is_floor);

-- ──────────────────────────────────────────────
-- 3. slot_sessions — 每位玩家的挑戰進度
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.slot_sessions (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID    NOT NULL REFERENCES public.users(id),
  machine_id          BIGINT  NOT NULL REFERENCES public.slot_machines(id),
  state               TEXT    NOT NULL DEFAULT 'normal' CHECK (state IN ('normal','rush')),
  rush_hits_remaining INT     NOT NULL DEFAULT 0,   -- RUSH 剩餘連中次數
  spins_since_rush    INT     NOT NULL DEFAULT 0,   -- 距上次 RUSH 累計轉數（保底計數器）
  total_spins         INT     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_sessions_user ON public.slot_sessions (user_id);

-- RLS
ALTER TABLE public.slot_machines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_pool_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_sessions   ENABLE ROW LEVEL SECURITY;

-- 前台玩家可讀上架機台
CREATE POLICY "slot_machines read active" ON public.slot_machines
  FOR SELECT USING (is_active = TRUE);

-- 後台 service_role 全權限（繞過 RLS）
-- 前台玩家只能看自己的 session
CREATE POLICY "slot_sessions own" ON public.slot_sessions
  FOR ALL USING (user_id = auth.uid());

-- pool items — 前台只需能讀（透過 RPC，不需直接查）
CREATE POLICY "slot_pool_items read" ON public.slot_pool_items
  FOR SELECT USING (TRUE);

-- ──────────────────────────────────────────────
-- 4. Seed：吉吉比 平台虛擬廠商
-- ──────────────────────────────────────────────
INSERT INTO public.suppliers (name, contact_name, contact_email, is_active, notes)
VALUES ('吉吉比', '平台', 'platform@ggb.com.tw', TRUE, '平台自有虛擬廠商，用於挑戰機保底獎品')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────
-- 5. Seed：保底獎品 product（內部品項，不對外販售）
-- ──────────────────────────────────────────────
-- 先把 'slot' 加入 type 允許值
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_type_check;
ALTER TABLE public.products ADD CONSTRAINT products_type_check
  CHECK (type = ANY (ARRAY['ichiban','gacha','blindbox','card','custom','ticket','slot']));

WITH ggb AS (SELECT id FROM public.suppliers WHERE name = '吉吉比' LIMIT 1)
INSERT INTO public.products (
  name, supplier_id, type, product_type, price, status,
  is_active, total_count, remaining, description
)
SELECT
  '吉吉比感謝貼紙庫', ggb.id, 'slot', 'slot_floor', 0, 'hidden',
  FALSE, 999999, 999999, '挑戰機保底專用品項，不對外販售'
FROM ggb
WHERE NOT EXISTS (
  SELECT 1 FROM public.products WHERE name = '吉吉比感謝貼紙庫'
);

-- ──────────────────────────────────────────────
-- 6. Seed：保底品獎品明細
-- ──────────────────────────────────────────────
WITH floor_product AS (
  SELECT id FROM public.products WHERE name = '吉吉比感謝貼紙庫' LIMIT 1
)
INSERT INTO public.product_prizes (
  product_id, level, name, image_url, total, remaining, probability, recycle_value
)
SELECT
  floor_product.id,
  'C',
  '吉吉比感謝貼紙',
  '/images/prizes/ggb_sticker.png',
  999999, 999999,
  100.0,  -- 100% 機率（保底品只有這一項）
  1       -- 1 G幣回收價值
FROM floor_product
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_prizes pp
  JOIN public.products p ON p.id = pp.product_id
  WHERE p.name = '吉吉比感謝貼紙庫' AND pp.name = '吉吉比感謝貼紙'
);
