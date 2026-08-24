-- 617: 回收池加上「這批貨後來怎麼了」的追蹤
--
-- 為什麼：admin_recycle_pool 到目前為止只有 8 個欄位，沒有任何狀態欄位 ——
-- PROD 已經躺了 1,562 筆，但沒人能回答「這些實體有沒有再利用」。
-- 後台 /dismantled 也只是純列表。
--
-- 這件事必須先有，之後才談得上調回收比例：一番賞／自製賞的一般賞回收後
-- 平台白拿一件實體，該給多少退幣，取決於那件實體到底有沒有變成收入
-- （重組自製賞、進官方商城），還是就這樣爛在倉庫。沒有這欄位＝永遠是猜的。

ALTER TABLE public.admin_recycle_pool
  ADD COLUMN IF NOT EXISTS status       text        NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS handled_at   timestamptz,
  ADD COLUMN IF NOT EXISTS handled_by   text,
  ADD COLUMN IF NOT EXISTS handled_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_recycle_pool_status_check'
      AND conrelid = 'public.admin_recycle_pool'::regclass
  ) THEN
    ALTER TABLE public.admin_recycle_pool
      ADD CONSTRAINT admin_recycle_pool_status_check
      CHECK (status IN ('pending', 'reused', 'scrapped'));
  END IF;
END $$;

COMMENT ON COLUMN public.admin_recycle_pool.status IS
  'pending 待處理／reused 已再利用（重組賞、進商城）／scrapped 已報廢';
COMMENT ON COLUMN public.admin_recycle_pool.handled_at   IS '標記為已再利用／已報廢的時間';
COMMENT ON COLUMN public.admin_recycle_pool.handled_by   IS '標記的管理員帳號';
COMMENT ON COLUMN public.admin_recycle_pool.handled_note IS '處置備註（去向、報廢原因）';

-- 後台列表最常見的用法：篩 status + 依時間排
CREATE INDEX IF NOT EXISTS idx_admin_recycle_pool_status
  ON public.admin_recycle_pool (status, created_at DESC);

-- 既有 1,562 筆維持 pending（DEFAULT 已處理），不做任何推測性回填 ——
-- 沒人知道那些貨去哪了，標成 reused 只會製造假帳。
