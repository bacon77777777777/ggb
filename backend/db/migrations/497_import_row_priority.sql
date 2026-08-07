-- 497：補齊佇列加優先權
--
-- 「重新補齊」按下去像沒反應：那幾列確實被退回佇列了，但領取是照 id 排序，
-- 一份 292 筆的檔案，人選的那 7 筆前面還排著 250 筆，要等二十分鐘才輪到。
-- 使用者的預期是「我選的這幾筆現在就重跑」，所以給它們插隊。

ALTER TABLE public.import_job_rows
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.import_job_rows.priority IS
  '領取順序，大的先跑。人工按「重新補齊」的列設 1，讓它們插到佇列前面。';

-- 領取的查詢會用 priority DESC, id ASC 排序，索引要跟著
DROP INDEX IF EXISTS import_job_rows_pending;
CREATE INDEX IF NOT EXISTS import_job_rows_pending
  ON public.import_job_rows (job_id, status, priority DESC, id)
  WHERE status IN ('pending', 'enriching');
