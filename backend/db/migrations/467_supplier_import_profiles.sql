-- 467: 記住每家廠商的檔案格式
--
-- 「多廠商都有自家的商品 list，格式都不同」是這次批量上架的核心難題。
-- 每次都靠猜（或叫 AI）有兩個問題：不穩定，而且要花錢。
--
-- 但實際上同一家廠商的檔案格式幾乎不變 —— 他們就是從自家系統匯出的。
-- 所以只要第一次對好，之後認得標題列指紋就直接套用，
-- 連 detectColumns 的 AI 呼叫都省掉。
--
-- fingerprint 由 lib/productSchema.ts 的 headerFingerprint() 算出：
-- 標題列去空白、轉小寫、排序後湊雜湊，所以廠商調動欄位順序不影響比對。
--
-- mapping 存的是「我們的欄位 key → 廠商的欄位名」，例如
--   {"name": "商品名稱", "price": "價格", "total_count": null}
-- prize_groups 存品項欄位的分組結果（橫向展開的 A賞名稱/A賞數量/... 那種）。

CREATE TABLE IF NOT EXISTS supplier_import_profiles (
  id            BIGSERIAL PRIMARY KEY,
  supplier_id   BIGINT      NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  fingerprint   TEXT        NOT NULL,
  label         TEXT,
  mapping       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  prize_groups  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- 用過幾次、最後一次何時用。太久沒用到的格式表示廠商改版了，可以清掉
  use_count     INTEGER     NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 同一家廠商同一個格式只留一筆，重複上傳是更新不是新增
  UNIQUE (supplier_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_supplier_import_profiles_fp
  ON supplier_import_profiles (fingerprint);

COMMENT ON TABLE supplier_import_profiles IS
  '廠商檔案格式記憶。第二次上傳同格式的檔案時直接套用上次的欄位對應，不需再猜也不需呼叫 AI。';

-- 只有後台（service role）會讀寫，前台完全不需要
ALTER TABLE supplier_import_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'supplier_import_profiles' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON supplier_import_profiles
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
