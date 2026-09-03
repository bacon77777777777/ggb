-- 行情只在上架時抓一次、之後不抓（老闆 2026-09-03：反正只是體驗）。每日排程拿掉。
-- Vercel 美國機房被遊々亭擋、Hobby 不吃 preferredRegion，這條排程本來也跑不動。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'card-price-daily') THEN
    PERFORM cron.unschedule('card-price-daily');
  END IF;
END $$;
