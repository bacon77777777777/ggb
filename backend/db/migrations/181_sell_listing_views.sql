BEGIN;

ALTER TABLE public.sell_listings
ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.sell_listing_view_events (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES public.sell_listings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sell_listing_view_events_listing_id ON public.sell_listing_view_events(listing_id);
CREATE INDEX IF NOT EXISTS idx_sell_listing_view_events_created_at ON public.sell_listing_view_events(created_at);
CREATE INDEX IF NOT EXISTS idx_sell_listing_view_events_user_id ON public.sell_listing_view_events(user_id);
CREATE INDEX IF NOT EXISTS idx_sell_listing_view_events_session_id ON public.sell_listing_view_events(session_id);

ALTER TABLE public.sell_listing_view_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.increment_sell_listing_view(p_listing_id BIGINT, p_session_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_view_count BIGINT;
  v_session TEXT;
BEGIN
  v_session := NULLIF(TRIM(COALESCE(p_session_id, '')), '');

  UPDATE public.sell_listings
  SET view_count = view_count + 1
  WHERE id = p_listing_id
  RETURNING view_count INTO v_view_count;

  IF v_view_count IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.sell_listing_view_events (listing_id, user_id, session_id)
  VALUES (p_listing_id, auth.uid(), v_session);

  RETURN jsonb_build_object('success', true, 'view_count', v_view_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_sell_listing_view(BIGINT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

