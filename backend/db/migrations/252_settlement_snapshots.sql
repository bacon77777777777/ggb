-- W2-3：廠商月結快照表
CREATE TABLE settlement_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  supplier_id     INTEGER   NOT NULL REFERENCES suppliers(id),
  supplier_name   TEXT      NOT NULL,
  period_start    DATE      NOT NULL,
  period_end      DATE      NOT NULL,
  settlement_date DATE      NOT NULL,

  -- 計算結果（key numbers，方便查詢）
  total_g             NUMERIC NOT NULL DEFAULT 0,  -- 廠商商品消費 G
  dismantle_total     NUMERIC NOT NULL DEFAULT 0,  -- 分解退代幣
  coupon_total        NUMERIC NOT NULL DEFAULT 0,  -- 折價券
  shipping_total      NUMERIC NOT NULL DEFAULT 0,  -- 運費
  consumption_share   NUMERIC NOT NULL DEFAULT 1,  -- 廠商消費佔比
  ecpay_fee           NUMERIC NOT NULL DEFAULT 0,  -- ECPay 手續費（分攤）
  supplier_net        NUMERIC NOT NULL DEFAULT 0,  -- 最終應付金額

  -- 完整計算資料備查
  raw_data            JSONB,

  -- 流程狀態
  status              TEXT NOT NULL DEFAULT 'draft',  -- draft / confirmed / paid
  confirmed_at        TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  note                TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (supplier_id, period_start)
);

CREATE INDEX ON settlement_snapshots (period_start DESC);
CREATE INDEX ON settlement_snapshots (status);
