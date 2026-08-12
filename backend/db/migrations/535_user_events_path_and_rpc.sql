-- 535: user_events 補 path 欄位與 6 參數版 track_user_event（STG 缺，PROD 早就有）
--
-- 這是「STG 的 user_events 一直是 0 筆」的真正原因。
--
-- 前台 `lib/trackEvent.ts` 是這樣呼叫的：
--   supabase.rpc('track_user_event', { p_event_type, p_product_id, p_series,
--                                      p_session_id, p_meta, p_path })
-- 六個參數。但 STG 只有五參數那一版（沒有 p_path），PostgREST 找不到相符的函式
-- 就回錯 —— 而 `trackEvent()` 是刻意 silent fail（追蹤不該弄壞前台），
-- 所以**每一次事件追蹤都失敗、而且完全沒有跡象**。
--
-- 實測 2026-08-12：STG `user_events` 0 筆、PROD 同期 7,455 筆。
-- 534 拿掉的過期 CHECK 是另一個較小的問題；就算沒有它，缺 p_path 一樣全軍覆沒。
--
-- 兩段都寫成冪等，PROD 跑起來是 no-op。

ALTER TABLE public.user_events
  ADD COLUMN IF NOT EXISTS path text;

-- 與 PROD 同定義：SECURITY DEFINER，user_id 取 auth.uid()（未登入為 NULL）
CREATE OR REPLACE FUNCTION public.track_user_event(
  p_event_type text,
  p_product_id integer DEFAULT NULL::integer,
  p_series     text    DEFAULT NULL::text,
  p_session_id text    DEFAULT NULL::text,
  p_meta       jsonb   DEFAULT '{}'::jsonb,
  p_path       text    DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.user_events (user_id, session_id, event_type, product_id, series, meta, path)
  VALUES (auth.uid(), p_session_id, p_event_type, p_product_id, p_series, p_meta, p_path);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.track_user_event(text, integer, text, text, jsonb, text)
  TO anon, authenticated;
