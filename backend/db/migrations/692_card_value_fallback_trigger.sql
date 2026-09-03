-- 未來抽卡商品上架都要有行情且跳 +N（老闆 2026-09-03）。
-- 遊々亭擋所有機房 IP（Vercel iad1 的 serverless 與 edge、Supabase Seoul 的 pg_net 全部 403），
-- 真行情只有本機（台灣 IP）抓得到，所以真價在匯入腳本裡抓一次；這條 trigger 是保底：
-- 任何管道（後台手建、匯入、複製商品）新增的抽卡品項，沒有值就立刻補賞等體感值，
-- 之後匯入腳本再抓到真價會直接覆蓋。statement-level：一個 INSERT 只補一次，不逐列跑。
CREATE OR REPLACE FUNCTION trg_fill_card_value_fallback() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM apply_card_value_fallback();
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_prize_value_fallback ON product_prizes;
CREATE TRIGGER trg_prize_value_fallback
  AFTER INSERT ON product_prizes
  FOR EACH STATEMENT EXECUTE FUNCTION trg_fill_card_value_fallback();
