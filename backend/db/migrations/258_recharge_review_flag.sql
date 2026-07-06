-- W2-5: 待複核儲值旗標
ALTER TABLE recharge_records
  ADD COLUMN IF NOT EXISTS needs_review    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note     text;

CREATE INDEX IF NOT EXISTS idx_recharge_needs_review
  ON recharge_records (needs_review, status, created_at)
  WHERE needs_review = true;
