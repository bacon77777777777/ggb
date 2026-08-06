-- 492：商品匯入工作
--
-- 智能上架原本是一個 modal：上傳、解析、補齊、上架全部在開著的視窗裡做完。
-- 那撐不住實際的工作量 —— 33 筆商品每筆要爬網站查款式，10~30 秒跑不掉，
-- 整批就是 5~15 分鐘。中間關掉分頁、切走、網路斷一下就全部白做，
-- 而且 serverless function 有 60 秒上限，前端得自己切成幾十個請求輪流打，
-- 任何一個失敗就殘缺。實測時的症狀是「按了什麼都沒發生」。
--
-- 改成工作制：丟檔案 → 立刻解析完 → 建立工作 → 人就可以走了。
-- 補齊在背景由 pg_cron 分批跑（跟站上那 25 個 AI 單位同一個機制，
-- 不引進新的 queue 服務），隨時回來看進度。可中斷、可續跑、可重試。
--
-- 這個工具的定位是「格式轉換 + 資料補齊」，不是匯入器：
-- 輸入任何廠商格式，輸出我們的標準格式。完成後可以下載 CSV
--（原封不動餵回手動批量匯入），或直接匯入商品。

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id          bigserial PRIMARY KEY,
  filename    text        NOT NULL,
  supplier_id bigint      REFERENCES public.suppliers(id) ON DELETE SET NULL,
  -- 整批指定的商品類型。廠商的進貨單通常沒有類型欄，一份檔案就是一種類型
  product_type text,
  status      text        NOT NULL DEFAULT 'enriching'
                          CHECK (status IN ('parsing', 'enriching', 'done', 'failed', 'cancelled')),
  total_rows  integer     NOT NULL DEFAULT 0,
  -- 補齊完成的列數。進度就是 done_rows / total_rows，不用另外算
  done_rows   integer     NOT NULL DEFAULT 0,
  -- 欄位對應與原始標題列。出問題時要查是哪一欄對錯了
  mapping     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  headers     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  error       text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.import_job_rows (
  id          bigserial PRIMARY KEY,
  job_id      bigint      NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  -- 試算表上的列號，回報問題時人看得懂
  row_no      integer     NOT NULL,
  -- 解析出來的商品欄位（products 的形狀）
  product     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- 品項（product_prizes 的形狀）
  prizes      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'enriching', 'done', 'failed', 'skipped')),
  -- 補了什麼、從哪來。要讓人看得到系統動過什麼手腳
  filled      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  warnings    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  error       text,
  -- 已經重跑過幾次。二次補齊會把它加回佇列
  attempts    integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- cron 每輪要撈「還沒補齊的列」，這是最熱的查詢
CREATE INDEX IF NOT EXISTS import_job_rows_pending
  ON public.import_job_rows (job_id, status) WHERE status IN ('pending', 'enriching');
CREATE INDEX IF NOT EXISTS import_jobs_active
  ON public.import_jobs (status, created_at DESC);

-- 後台專用，一律走 service role。前台完全不該碰
ALTER TABLE public.import_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_job_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_jobs, public.import_job_rows FROM anon, authenticated;

COMMENT ON TABLE public.import_jobs IS
  '商品匯入工作。上傳廠商的 list 後解析成標準格式，補齊在背景由 cron 分批跑。';
COMMENT ON TABLE public.import_job_rows IS
  '匯入工作的每一列商品。status 是每列各自的補齊狀態，可以單獨重跑。';

-- 進度自動維護：某一列變成 done/failed/skipped 時把 job 的計數推上去，
-- 全部處理完就把 job 標成完成。放在資料庫裡做，才不會因為 cron 中途掛掉就對不上
CREATE OR REPLACE FUNCTION public.sync_import_job_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_total int;
  v_done  int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status IN ('done', 'failed', 'skipped'))
    INTO v_total, v_done
    FROM public.import_job_rows WHERE job_id = NEW.job_id;

  UPDATE public.import_jobs
     SET done_rows = v_done,
         total_rows = v_total,
         -- 只有還在補齊中的才自動翻成完成。已取消或失敗的不要被蓋回去
         status = CASE WHEN v_done >= v_total AND status = 'enriching' THEN 'done' ELSE status END,
         updated_at = now()
   WHERE id = NEW.job_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_import_job_progress ON public.import_job_rows;
CREATE TRIGGER trg_sync_import_job_progress
  AFTER INSERT OR UPDATE OF status ON public.import_job_rows
  FOR EACH ROW EXECUTE FUNCTION public.sync_import_job_progress();
