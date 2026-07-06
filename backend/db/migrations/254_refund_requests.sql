-- W2-4：退款申請表
CREATE TABLE refund_requests (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID    NOT NULL REFERENCES auth.users(id),
  recharge_id     BIGINT  REFERENCES recharge_records(id),   -- 對應的儲值單（可空）
  amount_twd      NUMERIC NOT NULL,                          -- 申請退款金額（TWD）
  tokens_to_deduct INTEGER NOT NULL DEFAULT 0,               -- 需扣回的代幣
  reason          TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending',        -- pending / approved / rejected / processed
  admin_note      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  processed_at    TIMESTAMPTZ
);

CREATE INDEX ON refund_requests (user_id);
CREATE INDEX ON refund_requests (status);
CREATE INDEX ON refund_requests (created_at DESC);

-- RPC：核准退款（扣代幣 + 更新狀態，atomic）
CREATE OR REPLACE FUNCTION process_refund(
  p_refund_id BIGINT,
  p_admin_note TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_user_id UUID;
  v_tokens  INTEGER;
  v_recharge_id BIGINT;
BEGIN
  SELECT user_id, tokens_to_deduct, recharge_id
  INTO v_user_id, v_tokens, v_recharge_id
  FROM refund_requests
  WHERE id = p_refund_id AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION '退款單不存在或狀態不正確';
  END IF;

  -- 扣回代幣
  IF v_tokens > 0 THEN
    UPDATE users SET tokens = GREATEST(0, tokens - v_tokens) WHERE id = v_user_id;
  END IF;

  -- 標記儲值單為退款
  IF v_recharge_id IS NOT NULL THEN
    UPDATE recharge_records SET status = 'refunded' WHERE id = v_recharge_id;
  END IF;

  -- 更新退款單
  UPDATE refund_requests
  SET status = 'processed', processed_at = NOW(),
      admin_note = COALESCE(p_admin_note, admin_note)
  WHERE id = p_refund_id;
END;
$$;
