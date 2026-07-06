-- Migration 245: webhook_events 表（Webhook 冪等性防護）
-- 記錄每次收到的 ECPay / Newebpay 回調，防止重複入帳

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT        NOT NULL,  -- 'newebpay_payment' | 'ecpay_payment' | 'ecpay_logistics'
  idempotency_key TEXT        NOT NULL,  -- 唯一交易識別（TradeNo / AllPayLogisticsID+Status）
  order_number    TEXT,                  -- 系統訂單號（TP-xxx / SO-xxx / LG-xxx）
  raw_payload     JSONB,                 -- 完整原始回調內容
  result          TEXT        NOT NULL DEFAULT 'processed',  -- 'processed' | 'duplicate' | 'failed' | 'ignored'
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 唯一索引：同一來源同一 idempotency_key 只能有一筆 processed 紀錄
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_idempotency_unique
  ON public.webhook_events (source, idempotency_key)
  WHERE result = 'processed';

-- 查詢用索引
CREATE INDEX IF NOT EXISTS webhook_events_order_number_idx ON public.webhook_events (order_number);
CREATE INDEX IF NOT EXISTS webhook_events_created_at_idx   ON public.webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_source_idx       ON public.webhook_events (source, result);

-- RLS：僅 service_role 可存取
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON public.webhook_events
  USING (auth.role() = 'service_role');
