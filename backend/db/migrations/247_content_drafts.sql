-- Migration 247: content_drafts 表（AI 文案草稿 + 模板圖片）
CREATE TABLE IF NOT EXISTS public.content_drafts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_date   DATE        NOT NULL,                      -- 草稿對應的日期
  product_id   BIGINT      REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,                                      -- 快照品名（product 可能被刪）
  style        TEXT        NOT NULL,                      -- 'promotional' | 'story' | 'urgency'
  text_content TEXT        NOT NULL,                      -- AI 生成的文案
  image_path   TEXT,                                      -- Supabase Storage 路徑
  status       TEXT        NOT NULL DEFAULT 'pending',    -- 'pending' | 'approved' | 'published' | 'archived'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_drafts_date_idx    ON public.content_drafts (draft_date DESC);
CREATE INDEX IF NOT EXISTS content_drafts_status_idx  ON public.content_drafts (status);
CREATE INDEX IF NOT EXISTS content_drafts_product_idx ON public.content_drafts (product_id);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION public.set_content_drafts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_drafts_updated_at ON public.content_drafts;
CREATE TRIGGER content_drafts_updated_at
  BEFORE UPDATE ON public.content_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_content_drafts_updated_at();

-- RLS：僅 service_role（後台透過 service key 存取）
ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON public.content_drafts
  USING (auth.role() = 'service_role');
